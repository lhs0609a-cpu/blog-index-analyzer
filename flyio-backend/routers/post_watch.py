"""
새 글 감시 — 발행한 글이 검색에 실제로 나오는지 대신 확인한다.

관리자 엔드포인트(`/admin/*`)는 판정 정확도를 운영에서 보기 위한 것이고,
사용자 엔드포인트는 그 위에 얹는다.

⚠️ **누락(`missing`)은 이 버전이 확정하지 않는다.** 2026-09-14 판정 수정에서
"실제 검색에서 링크를 확인한 경우만 indexed, 미발견은 재시도 후 unmeasurable" 로
정했기 때문이다(docs/POST_EXPOSURE_WATCH_SPEC.md). 그래서 사용자 화면도
"누락됐습니다" 라고 말하지 않는다 — `delayed`/`unmeasurable` 까지만 보여주고
단어도 '지연'·'확인 불가'를 쓴다. 오탐 알림이 이 기능에서 가장 비싼 손실이고,
스펙의 출시 전 검증(최근 글 100개 비교, 불일치 5% 이하)이 아직 안 끝났다.
"""
import asyncio
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import post_watch_db as db
from database.subscription_db import PLAN_LIMITS, PlanType, get_user_subscription
from routers.admin import require_admin
from routers.auth_deps import get_current_user

router = APIRouter(prefix="/api/post-watch", tags=["새글누락감시"])

_BLOG_ID = re.compile(r"^[A-Za-z0-9_-]{3,50}$")


class WatchRequest(BaseModel):
    blog_id: str


def _normalize(blog_id: str) -> str:
    bid = blog_id.strip()
    m = re.search(r"blog\.naver\.com/([A-Za-z0-9_-]+)", bid)
    if m:
        bid = m.group(1)
    if not _BLOG_ID.match(bid):
        raise HTTPException(status_code=400, detail="invalid blog_id")
    return bid


@router.post("/admin/blogs")
async def admin_add_watch(req: WatchRequest, admin: dict = Depends(require_admin)):
    from services.post_watch import poll_blog

    bid = _normalize(req.blog_id)
    created = await asyncio.to_thread(db.add_watch, admin["id"], bid)
    # 등록 즉시 RSS 를 한 번 읽어 72시간 안의 글은 감시에 넣고 나머지는 baseline 으로 둔다
    poll = await poll_blog(bid)
    return {"blog_id": bid, "created": created, "poll": poll}


@router.delete("/admin/blogs/{blog_id}")
async def admin_remove_watch(blog_id: str, admin: dict = Depends(require_admin)):
    removed = await asyncio.to_thread(db.remove_watch, admin["id"], _normalize(blog_id))
    return {"removed": removed}


@router.post("/admin/run")
async def admin_run_once(_: dict = Depends(require_admin)):
    """스케줄을 기다리지 않고 RSS 순회와 확인 한 주기를 돌린다."""
    from services.post_watch import check_due, poll_all

    rss = await poll_all()
    check = await check_due()
    return {"rss": rss, "check": check}


@router.get("/admin/report")
async def admin_report(_: dict = Depends(require_admin)):
    from services.post_watch import DAILY_API_CAP
    from services.post_watch_scheduler import is_enabled

    watches = await asyncio.to_thread(db.list_watches)
    blogs = {}
    for w in watches:
        if w["blog_id"] not in blogs:
            blogs[w["blog_id"]] = {
                "rss_state": w["rss_state"],
                "last_rss_at": w["last_rss_at"],
                "posts": await asyncio.to_thread(db.posts_for_blog, w["blog_id"], 20),
            }
    return {
        "enabled": is_enabled(),
        "worker": await asyncio.to_thread(db.runtime_status),
        "measurement_method": "serp_v2_positive_only",
        "status_summary": await asyncio.to_thread(db.status_summary),
        "api_budget": {"used_today": await asyncio.to_thread(db.budget_used_today), "cap": DAILY_API_CAP},
        "blogs": blogs,
    }


# ============ 사용자 API ============
#
# 스펙의 제1원칙: **블로그 ID 하나로 설정이 끝나야 한다.** 기존 순위 추적은
# 키워드를 사람이 등록해야 해서 운영 6개월간 등록 0건이었다.


def _plan_limits(user_id: int) -> dict:
    """이 사용자의 플랜 한도. 구독을 못 읽으면 무료로 본다(막는 쪽이 안전)."""
    try:
        sub = get_user_subscription(user_id) or {}
        plan = PlanType(sub.get("plan_type") or "free")
    except Exception:
        plan = PlanType.FREE
    return PLAN_LIMITS.get(plan, PLAN_LIMITS[PlanType.FREE])


def _my_blog_ids(user_id: int) -> set:
    return {w["blog_id"] for w in db.list_watches(user_id)}


# 사용자에게 보여줄 말. status 원문을 그대로 쓰면 '누락'으로 읽히는 단어가 생긴다.
_STATUS_LABEL = {
    "pending": "확인 중",
    "indexed": "노출 확인",
    "delayed": "24시간 지나도 미확인",
    "unmeasurable": "확인 불가",
    "removed": "삭제·비공개",
    "baseline": "감시 전 글",
}


def _post_view(post: dict) -> dict:
    return {
        "id": post["id"],
        "log_no": post["log_no"],
        "title": post["title"],
        "url": post["url"],
        "published_at": post["published_at"],
        "status": post["status"],
        "status_label": _STATUS_LABEL.get(post["status"], post["status"]),
        "checks_done": post.get("checks_done"),
        "indexed_at": post.get("indexed_at"),
        "first_rank": post.get("first_rank"),
        "last_checked_at": post.get("last_checked_at"),
        "next_check_at": post.get("next_check_at"),
    }


@router.get("/blogs")
async def my_watches(user: dict = Depends(get_current_user)):
    """내 감시 블로그와 블로그별 최근 글 상태."""
    limits = _plan_limits(user["id"])
    watches = await asyncio.to_thread(db.list_watches, user["id"])
    blogs = []
    for w in watches:
        posts = await asyncio.to_thread(db.posts_for_blog, w["blog_id"], 10)
        blogs.append({
            "blog_id": w["blog_id"],
            "rss_state": w["rss_state"],
            "last_rss_at": w["last_rss_at"],
            "created_at": w["created_at"],
            "posts": [_post_view(p) for p in posts],
        })
    return {
        "blogs": blogs,
        "limit": limits.get("post_watch_blogs", 1),
        "used": len(watches),
        "checkpoints_hours": limits.get("post_watch_checkpoints", [24, 72]),
        "summary": await asyncio.to_thread(db.user_status_summary, user["id"]),
        # 화면이 '누락'이라고 쓰지 않도록 서버가 먼저 말해 둔다
        "asserts_missing": False,
    }


@router.post("/blogs")
async def add_my_watch(req: WatchRequest, user: dict = Depends(get_current_user)):
    from services.post_watch import poll_blog

    bid = _normalize(req.blog_id)
    limits = _plan_limits(user["id"])
    cap = limits.get("post_watch_blogs", 1)
    mine = _my_blog_ids(user["id"])
    # 이미 감시 중인 블로그를 다시 누른 건 한도 초과가 아니다 — 멱등으로 둔다.
    if bid not in mine and cap != -1 and len(mine) >= cap:
        raise HTTPException(
            status_code=402,
            detail={
                "error_code": "WATCH_LIMIT_EXCEEDED",
                "message": f"현재 플랜은 블로그 {cap}개까지 감시할 수 있습니다.",
                "limit": cap,
                "used": len(mine),
            },
        )

    created = await asyncio.to_thread(db.add_watch, user["id"], bid)
    # 등록 즉시 RSS 를 읽어 72시간 안의 글은 감시에, 나머지는 baseline 으로.
    # 이걸 안 하면 다음 순회(60분)까지 화면이 비어 있어 등록이 실패한 것처럼 보인다.
    try:
        poll = await poll_blog(bid)
    except Exception as e:  # RSS 실패가 등록 자체를 막지는 않는다
        poll = {"error": str(e)[:200]}
    return {"blog_id": bid, "created": created, "poll": poll, "used": len(mine | {bid}), "limit": cap}


@router.delete("/blogs/{blog_id}")
async def remove_my_watch(blog_id: str, user: dict = Depends(get_current_user)):
    removed = await asyncio.to_thread(db.remove_watch, user["id"], _normalize(blog_id))
    return {"removed": removed}


@router.get("/blogs/{blog_id}/posts")
async def my_blog_posts(blog_id: str, user: dict = Depends(get_current_user)):
    """글별 상태와 확인 이력. 내가 감시하는 블로그만 볼 수 있다."""
    bid = _normalize(blog_id)
    if bid not in _my_blog_ids(user["id"]):
        raise HTTPException(status_code=404, detail="감시 중인 블로그가 아닙니다")
    posts = await asyncio.to_thread(db.posts_for_blog, bid, 30)
    out = []
    for p in posts:
        view = _post_view(p)
        view["checks"] = await asyncio.to_thread(db.checks_for_post, p["id"], 10)
        out.append(view)
    return {"blog_id": bid, "posts": out, "asserts_missing": False}


@router.get("/summary")
async def my_summary(user: dict = Depends(get_current_user)):
    """대시보드 카드용 — 블로그 수와 상태 집계만."""
    limits = _plan_limits(user["id"])
    watches = await asyncio.to_thread(db.list_watches, user["id"])
    return {
        "watching": len(watches),
        "limit": limits.get("post_watch_blogs", 1),
        "blog_ids": [w["blog_id"] for w in watches],
        "summary": await asyncio.to_thread(db.user_status_summary, user["id"]),
    }
