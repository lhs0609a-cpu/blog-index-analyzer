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
    """1단: 사실만. 실제 블로그탭 SERP 1회 조회(키워드 단위 공용 캐시 6h) + 검색량.

    확률·판정은 여기서 내지 않는다. 이미 1페이지면 `already_page1=true` 로 끝난다.
    """
    from services.keyword_verdict import stage1_facts

    blog_id, keyword = _clean(request)
    try:
        return await stage1_facts(blog_id, keyword)
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
        "result": job.get("result"),
        "waited_seconds": round((job.get("done_at") or time.time())
                                - float(job.get("requested_at") or 0), 1),
    }


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
