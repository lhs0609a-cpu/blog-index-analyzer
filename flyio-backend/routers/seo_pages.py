"""
프로그래매틱 SEO 페이지 API.

읽기(GET)는 전부 캐시 조회라 밀리초 단위다 — 프론트가 ISR 로 이걸 읽어
키워드 상세 페이지를 만든다. 실측(21~26초/키워드)은 관리자가 호출하는
precompute 에서만 일어난다.
"""
import asyncio
import hmac
import logging
import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, BackgroundTasks, Header, HTTPException, Query
from pydantic import BaseModel

from database import seo_keyword_pages_db as seo_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/seo", tags=["프로그래매틱SEO"])

# precompute 가 겹쳐 돌면 1 CPU 머신에서 이벤트루프가 죽는다. 한 번에 하나만.
_build_lock = asyncio.Lock()
_last_build: Dict[str, Any] = {}


def _require_cron_token(authorization: Optional[str]) -> None:
    """
    쓰기 엔드포인트 보호. 읽기(GET)는 공개지만 enqueue/precompute 는
    키워드당 20초 넘는 실측을 유발하므로 아무나 호출하게 두면 안 된다.
    rank-tracker/measure-all 과 같은 CRON_TOKEN 규약을 쓴다.
    """
    expected = (os.environ.get("CRON_TOKEN") or "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="CRON_TOKEN 환경변수가 설정되지 않음")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authorization Bearer 토큰 필요")
    if not hmac.compare_digest(authorization.split(" ", 1)[1].strip(), expected):
        raise HTTPException(status_code=403, detail="잘못된 cron 토큰")


@router.get("/keyword/{slug}")
async def get_keyword_page(slug: str):
    """
    키워드 상세 페이지 데이터 (캐시 조회).

    없으면 404 — 프론트는 이걸 받아 notFound() 를 내야 한다.
    측정 안 된 키워드에 빈 페이지를 내보내면 얇은 페이지 대량 생산이 된다.
    """
    seo_db.init_seo_pages_db()
    page = seo_db.get_page(slug)
    if not page:
        raise HTTPException(status_code=404, detail="keyword page not found")
    page["related_pages"] = seo_db.related_published(page["keyword"], limit=12)
    return page


@router.get("/keywords")
async def list_keyword_pages(
    offset: int = Query(0, ge=0),
    limit: int = Query(5000, ge=1, le=5000),
):
    """사이트맵 생성용 슬러그 목록. 검색량 큰 것부터."""
    seo_db.init_seo_pages_db()
    return {
        "total": seo_db.count_published(),
        "offset": offset,
        "limit": limit,
        "items": seo_db.list_published_slugs(offset=offset, limit=limit),
    }


@router.get("/stats")
async def get_seo_stats():
    seo_db.init_seo_pages_db()
    return seo_db.stats()


class EnqueueRequest(BaseModel):
    keywords: List[str]
    source: Optional[str] = "manual"
    depth: Optional[int] = 0


@router.post("/enqueue")
async def enqueue(req: EnqueueRequest, authorization: Optional[str] = Header(None)):
    """측정 후보 키워드를 큐에 넣는다."""
    _require_cron_token(authorization)
    seo_db.init_seo_pages_db()
    added = seo_db.enqueue_keywords(req.keywords, source=req.source or "manual", depth=req.depth or 0)
    return {"added": added, "stats": seo_db.stats()}


class PrecomputeRequest(BaseModel):
    limit: Optional[int] = 10
    expand: Optional[bool] = True


async def _run_build(limit: int, expand: bool) -> None:
    global _last_build
    if _build_lock.locked():
        logger.info("[seo] precompute already running, skipped")
        return
    async with _build_lock:
        from services.seo_page_builder import build_batch

        try:
            _last_build = await build_batch(limit=limit, expand=expand)
            logger.info(f"[seo] precompute done: {_last_build}")
        except Exception as e:
            logger.exception(f"[seo] precompute failed: {e}")
            _last_build = {"error": str(e)[:300]}


@router.post("/precompute")
async def precompute(
    req: PrecomputeRequest,
    background: BackgroundTasks,
    authorization: Optional[str] = Header(None),
):
    """
    큐에서 꺼내 실측한다. 오래 걸리므로 백그라운드로 던지고 즉시 응답한다.
    진행 상황은 GET /api/seo/stats, 마지막 결과는 GET /api/seo/precompute/last.
    """
    _require_cron_token(authorization)
    if _build_lock.locked():
        return {"started": False, "reason": "already_running", "last": _last_build}
    background.add_task(_run_build, int(req.limit or 10), bool(req.expand))
    return {"started": True, "limit": req.limit, "expand": req.expand}


@router.get("/precompute/last")
async def precompute_last():
    return {"running": _build_lock.locked(), "last": _last_build}
