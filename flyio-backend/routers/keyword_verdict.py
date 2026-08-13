"""
키워드 상위노출 판정 API (2단 응답)
====================================

  POST /api/keyword-verdict/facts      — 사실 층. 3~8초. 내 현재 순위 + 1페이지 점유자.
  POST /api/keyword-verdict/deep       — 판정 층 실행요청 → job_id (worker 가 실행)
  GET  /api/keyword-verdict/deep/{id}  — 판정 결과 폴링
  GET  /api/keyword-verdict/accuracy   — 이 판정기의 실측 정확도(정답지 채점 결과)

판정 층을 큐로 넘기는 이유는 services/keyword_verdict_queue.py 상단 참고
(요약: 무거운 작업을 public API 프로세스에서 돌리면 로그인·/health 까지 밀린다).
"""

import logging
import os
import time
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/keyword-verdict", tags=["키워드판정"])


class VerdictRequest(BaseModel):
    blog_id: str
    keyword: str


def _clean(request: VerdictRequest):
    blog_id = (request.blog_id or "").strip().replace("blog.naver.com/", "").strip("/")
    keyword = (request.keyword or "").strip()
    if not blog_id or not keyword:
        raise HTTPException(status_code=400, detail="blog_id와 keyword를 입력하세요")
    return blog_id, keyword


@router.post("/facts")
async def keyword_facts(request: VerdictRequest):
    """1단: 사실만 — **이미 측정된 SERP 캐시가 있을 때만** 즉답한다.

    캐시가 없으면 `error="not_measured_yet"` 을 주고, 클라이언트는 `/deep` 을 걸어
    워커가 조회하게 해야 한다. 이 프로세스에서 SERP 를 새로 조회하지 않는 이유:
    프로덕션(Fly)에서는 검색 HTML 이 빈 페이지로 와서 브라우저 경로를 타야 하는데,
    그걸 public API 이벤트루프에서 돌리면 로그인·/health 까지 밀린다.
    """
    from services.keyword_verdict import stage1_facts

    blog_id, keyword = _clean(request)
    try:
        return await stage1_facts(blog_id, keyword, cache_only=True)
    except Exception as e:
        logger.exception(f"[kwv] facts failed {blog_id}/{keyword}: {e}")
        raise HTTPException(status_code=500, detail=f"facts_failed: {e}")


@router.post("/deep")
async def keyword_deep(request: VerdictRequest):
    """2단: 컷라인 판정 실행요청. worker 가 집어 실행하고, 결과는 폴링으로 받는다."""
    from services.keyword_verdict_queue import enqueue

    blog_id, keyword = _clean(request)
    q = enqueue(blog_id, keyword)
    if not q.get("queued"):
        raise HTTPException(status_code=503,
                            detail=f"판정 큐 적재 실패: {q.get('reason')}")

    # 로컬 단일 프로세스(스케줄러 워커 없음)에서는 워치독이 없으므로 인라인 실행.
    # 프로덕션(app: SCHEDULERS_DISABLED=1)은 worker 워치독이 2초 내 집어간다.
    if os.getenv("SCHEDULERS_DISABLED") != "1" and not q.get("reused"):
        import asyncio
        from services.keyword_verdict_queue import claim, run_job

        async def _inline():
            job = claim()
            if job:
                await run_job(job)

        asyncio.create_task(_inline())

    return {"job_id": q["job_id"], "status": q.get("status", "queued"),
            "reused": q.get("reused", False),
            "poll_after_seconds": 3}


@router.get("/deep/{job_id}")
async def keyword_deep_result(job_id: str):
    """판정 결과 폴링. status: queued|running|done|error"""
    from services.keyword_verdict_queue import get_job

    job = get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job_not_found (만료되었거나 잘못된 id)")
    return {
        "job_id": job["job_id"],
        "status": job.get("status"),
        "blog_id": job.get("blog_id"),
        "keyword": job.get("keyword"),
        "error": job.get("error"),
        # 사실(1단)은 판정(2단)보다 먼저 실린다 — 화면을 먼저 채우라고 따로 내보낸다.
        "facts": job.get("facts"),
        "phase": job.get("phase"),
        "result": job.get("result"),
        "waited_seconds": round((job.get("done_at") or time.time())
                                - float(job.get("requested_at") or 0), 1),
    }


@router.get("/debug/queue")
async def debug_queue():
    """큐/워치독 상태. 워치독 하트비트가 늙어 있으면 워커 루프가 막힌 것이다."""
    from services.keyword_verdict_queue import _all_jobs, read_heartbeat, _JOB_DIR

    jobs = _all_jobs()
    hb = read_heartbeat()
    return {
        "job_dir": _JOB_DIR,
        "counts": {s: sum(1 for j in jobs if j.get("status") == s)
                   for s in ("queued", "running", "done", "error")},
        "running": [{"job_id": j["job_id"], "phase": j.get("phase"),
                     "keyword": j.get("keyword"), "attempts": j.get("attempts"),
                     "age": round(time.time() - float(j.get("claimed_at") or 0), 1)}
                    for j in jobs if j.get("status") == "running"],
        "recent_errors": [{"job_id": j["job_id"], "keyword": j.get("keyword"),
                           "error": j.get("error"), "phase": j.get("phase")}
                          for j in jobs if j.get("status") == "error"][:5],
        "oldest_queued_age": round(time.time() - min(
            [float(j.get("requested_at") or 0) for j in jobs
             if j.get("status") == "queued"] or [time.time()]), 1),
        "heartbeat": hb,
        "heartbeat_age": round(time.time() - float(hb["ts"]), 1) if hb else None,
    }


@router.get("/debug/serp")
async def debug_serp(keyword: str, ua: Optional[str] = None):
    """SERP 조회가 **어디서** 깨지는지 보는 진단.

    로컬에서는 되는데 Fly 에서 안 될 때, 원인이 (a) 차단/비200 (b) 200 이지만 다른 마크업
    (c) 파싱 실패 중 무엇인지 구분해야 고칠 수 있다. 응답 본문을 그대로 내보내지 않고
    판별에 필요한 지표만 낸다.
    """
    from urllib.parse import quote
    from routers.blogs import get_http_client, get_random_headers
    from services.keyword_verdict import _parse_serp_html

    encoded = quote(keyword.strip())
    client = await get_http_client()
    out = []
    candidates = [
        ("ssc_pc", f"https://search.naver.com/search.naver?ssc=tab.blog.all&query={encoded}&start=1", False),
        ("ssc_mo", f"https://m.search.naver.com/search.naver?ssc=tab.m_blog.all&query={encoded}&start=1", True),
        ("where_pc", f"https://search.naver.com/search.naver?where=blog&query={encoded}&start=1&sm=tab_opt&sort=sim", False),
        ("where_mo", f"https://m.search.naver.com/search.naver?where=m_blog&query={encoded}&start=1", True),
    ]
    for name, url, mobile in candidates:
        rec = {"name": name, "mobile": mobile}
        try:
            headers = get_random_headers(mobile=mobile)
            headers["Referer"] = ("https://m.search.naver.com/" if mobile
                                  else "https://search.naver.com/")
            if ua:
                headers["User-Agent"] = ua
            resp = await client.get(url, headers=headers, timeout=15.0)
            html = resp.text
            rows, mode = _parse_serp_html(html)
            rec.update({
                "status": resp.status_code,
                "final_url": str(resp.url),
                "bytes": len(html),
                "has_list_container": "fds-ugc-single-intention-item-list" in html,
                "has_blog_link": "blog.naver.com/" in html,
                "looks_blocked": any(t in html for t in ("비정상적인 검색", "captcha", "자동입력 방지")),
                "parse_mode": mode,
                "rows": len(rows),
                "top3": [r["blog_id"] for r in rows[:3]],
            })
        except Exception as e:
            rec.update({"error": f"{type(e).__name__}: {e}"})
        out.append(rec)
    return {"keyword": keyword, "attempts": out}


@router.get("/accuracy")
async def verdict_accuracy(blog_id: Optional[str] = None):
    """이 판정기의 **실측** 정확도.

    keyword_predictions 원장에서 실제 순위로 채점된 건만 집계한다. graded_total 이
    작으면 그 사실을 그대로 보여줘야 한다 — '신뢰도 높음'을 근거 없이 말하지 않는다.
    """
    from services.keyword_verdict import load_model
    model = load_model()
    try:
        from database.rank_tracker_db import get_rank_tracker_db
        cal = get_rank_tracker_db().get_prediction_calibration(blog_id=blog_id)
    except Exception as e:
        logger.warning(f"[kwv] calibration read failed: {e}")
        cal = {"graded_total": 0, "error": str(e)}

    graded = cal.get("graded_total") or 0
    return {
        **cal,
        "model_version": model.get("version"),
        "is_validated": graded >= 50,
        "note": ("실측 표본이 아직 적어 정확도 수치를 신뢰 구간으로 말할 수 없습니다."
                 if graded < 50 else None),
    }
