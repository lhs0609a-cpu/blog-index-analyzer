"""
새 글 누락 감시 — 1단계는 관리자 전용.

판정 정확도를 운영에서 확인하기 전에는 사용자에게 열지 않는다
(docs/POST_EXPOSURE_WATCH_SPEC.md "출시 전 검증"). 여기서 내부 테스트 블로그를
등록하고, 한 주기를 즉시 돌리고, 판정 결과를 본다.
"""
import asyncio
import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import post_watch_db as db
from routers.admin import require_admin

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
