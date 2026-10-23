"""
전수 노출 감사 — 블로그 여러 개의 최근 글을 **전부 실제로 검색해** 몇 개가
안 보이는지 센다.

왜 이걸 만드는가 (2026-10-23 실측):

  블스피 베이직 결제자(골프 회원권 중개업, 블로그 10개)의 글을 제목으로 직접
  검색해 봤다. 겹치는 쌍 6건 **12글 전부 미발견**이었다. 같은 측정기로 대조군
  (post_watch 가 indexed 로 판정한 글 6건)을 재니 5건이 노출로 재현됐다 —
  측정 오류가 아니라 그 10개 블로그가 통째로 안 보이는 상태였다.

  그는 월 9,900원을 내면서 영업이 투명한 상태였고, **아무도 그걸 말해주지
  않았다.** 블스피조차 블로그를 하나씩 '준최 3' 같은 점수로만 보여줬다.

경쟁 도구 10곳(블라이·NSIDE·블로랭크·블연플·블로그매트릭스·블로그차트·
웨어이즈포스트·라온픽·블로그유틸24·터틀메이커)은 전부 **점수**를 준다.
이 모듈이 주는 건 **관측**이다 — "제목 120개를 검색했고 87개가 안 나왔다".

비용 설계 (이 박스는 동시 4명에서 무너진 전력이 있다):
  · 글 하나에 검색 요청 최대 2회. 블로그 10개 × 30글 = 요청 최대 600회.
  · 그래서 (a) 작업 큐로 **한 번에 하나만** 돌리고, (b) 요청 간 1초를 띄우고,
    (c) post_watch 와 **같은 일일 예산**을 쓰고, (d) 플랜별로 글 수를 제한한다.
  · 이미 관측한 글(indexed/absent_in_search/removed)은 다시 재지 않는다.
"""
import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional

import httpx

from database import post_watch_db as db
from services.post_watch import (
    DAILY_API_CAP,
    MIN_TITLE_LEN,
    check_post_indexed,
    clean_title,
    extract_log_no,
)

logger = logging.getLogger(__name__)

# 요청 간격. post_watch 의 CHECK_SPACING_SECONDS 와 같은 보수치를 쓴다.
SPACING_SECONDS = 1.0

# 예산을 다 쓰기 전에 멈출 여유분. 감사가 일상 감시를 굶기면 안 된다.
BUDGET_RESERVE = 300

# 한 번에 도는 감사는 하나다. 프로세스가 재시작되면 잠금도 사라지지만,
# 그 경우 DB 의 queued/running 수로 한 번 더 막는다.
_lock = asyncio.Lock()


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


async def _collect_posts(blog_id: str, limit: int) -> List[Dict]:
    """RSS 최근 글. 감사는 '이미 쓴 글'을 보는 것이라 baseline 구분이 없다."""
    from routers.content_lifespan import fetch_blog_posts_via_rss

    try:
        posts = await fetch_blog_posts_via_rss(blog_id)
    except Exception as e:
        logger.warning(f"[audit] RSS 실패 {blog_id}: {e}")
        return []

    out = []
    for p in posts[:limit]:
        link = p.get("link", "") or ""
        log_no = extract_log_no(link, blog_id)
        title = p.get("title", "") or ""
        if not log_no or not title:
            continue
        out.append({
            "blog_id": blog_id,
            "log_no": log_no,
            "title": title,
            "url": link,
            "published_at": p.get("pubDate").strftime("%Y-%m-%dT%H:%M:%SZ")
            if isinstance(p.get("pubDate"), datetime) else None,
        })
    return out


async def run_audit(job_id: int, posts_per_blog: int = 30) -> None:
    """
    작업 하나를 끝까지 돈다. 예외는 밖으로 내보내지 않고 job 에 기록한다 —
    백그라운드 태스크에서 터지면 사용자는 영원히 'running' 을 보게 된다.
    """
    async with _lock:
        job = await asyncio.to_thread(db.get_audit_job, job_id)
        if not job or job["status"] not in ("queued", "running"):
            return

        await asyncio.to_thread(db.update_audit_job, job_id, status="running")
        blog_ids: List[str] = job["blog_ids"]

        try:
            # 1) RSS 로 잴 대상을 먼저 확정한다. 진행률의 분모가 있어야 화면이
            #    "87/300" 을 말할 수 있다.
            targets: List[Dict] = []
            rss_failed: List[str] = []
            for bid in blog_ids:
                got = await _collect_posts(bid, posts_per_blog)
                if not got:
                    rss_failed.append(bid)
                targets += got
                await asyncio.sleep(0.5)

            await asyncio.to_thread(db.update_audit_job, job_id, total=len(targets))

            per_blog: Dict[str, Dict] = {
                bid: {"blog_id": bid, "checked": 0, "indexed": 0, "absent": 0,
                      "unmeasurable": 0, "reused": 0, "absent_posts": []}
                for bid in blog_ids
            }

            stopped_reason = None
            checked = 0
            async with httpx.AsyncClient(timeout=15.0) as client:
                for t in targets:
                    bucket = per_blog[t["blog_id"]]

                    # 이미 관측한 글은 다시 재지 않는다
                    cached = await asyncio.to_thread(
                        db.observed_status, t["blog_id"], t["log_no"]
                    )
                    if cached:
                        bucket["reused"] += 1
                        bucket["checked"] += 1
                        if cached == "indexed":
                            bucket["indexed"] += 1
                        elif cached == "absent_in_search":
                            bucket["absent"] += 1
                            bucket["absent_posts"].append(
                                {"title": t["title"], "url": t["url"],
                                 "published_at": t["published_at"], "source": "watch"}
                            )
                        checked += 1
                        continue

                    # 예산 — 감시가 쓸 몫을 남긴다
                    used = await asyncio.to_thread(db.budget_used_today)
                    if used >= DAILY_API_CAP - BUDGET_RESERVE:
                        stopped_reason = "daily_budget"
                        break

                    if len(clean_title(t["title"])) < MIN_TITLE_LEN:
                        bucket["unmeasurable"] += 1
                        bucket["checked"] += 1
                        checked += 1
                        continue

                    found, _rank, error = await check_post_indexed(
                        t["title"], t["blog_id"], t["log_no"], client
                    )
                    bucket["checked"] += 1
                    checked += 1

                    if found is True:
                        bucket["indexed"] += 1
                    elif error and set(x for x in error.split(";") if x) <= {"serp_not_found"}:
                        # 검색 페이지를 정상으로 보고도 못 찾은 것 = 관측된 부재.
                        # post_watch 와 같은 기준이다(terminal_unfound_status).
                        bucket["absent"] += 1
                        bucket["absent_posts"].append(
                            {"title": t["title"], "url": t["url"],
                             "published_at": t["published_at"], "source": "audit"}
                        )
                    else:
                        bucket["unmeasurable"] += 1

                    if checked % 5 == 0:
                        await asyncio.to_thread(db.update_audit_job, job_id, checked=checked)
                    await asyncio.sleep(SPACING_SECONDS)

            blogs = list(per_blog.values())
            total_checked = sum(b["checked"] for b in blogs)
            total_absent = sum(b["absent"] for b in blogs)
            result = {
                "blogs": blogs,
                "rss_failed": rss_failed,
                "totals": {
                    "posts": len(targets),
                    "checked": total_checked,
                    "indexed": sum(b["indexed"] for b in blogs),
                    "absent": total_absent,
                    "unmeasurable": sum(b["unmeasurable"] for b in blogs),
                    "reused": sum(b["reused"] for b in blogs),
                },
                # 판정의 한계를 결과에 같이 싣는다. 이 숫자만 떼서 보면
                # "누락 87건"으로 읽히고 그건 우리가 주장하지 않는 것이다.
                "caveat": (
                    "제목을 그대로 검색해 그 글이 결과에 있는지 관측한 값입니다. "
                    "'안 보임'은 색인에서 빠졌다는 판정이 아니라 그 시점 검색 결과에 "
                    "없었다는 사실입니다. 측정 실패는 따로 셉니다."
                ),
                "stopped_reason": stopped_reason,
                "measured_at": _now(),
            }
            await asyncio.to_thread(
                db.update_audit_job, job_id,
                status="done", checked=total_checked, result=result, finished_at=_now(),
            )
            logger.info(
                f"[audit] job={job_id} 완료 글 {total_checked} 중 안 보임 {total_absent}"
                + (f" (중단: {stopped_reason})" if stopped_reason else "")
            )
        except Exception as e:
            logger.exception(f"[audit] job={job_id} 실패: {e}")
            await asyncio.to_thread(
                db.update_audit_job, job_id,
                status="failed", error=str(e)[:300], finished_at=_now(),
            )


def start_audit(job_id: int, posts_per_blog: int = 30) -> None:
    """엔드포인트에서 호출. 태스크 참조를 잡아둬 GC 에 수거되지 않게 한다."""
    task = asyncio.create_task(run_audit(job_id, posts_per_blog))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


_tasks: set = set()
