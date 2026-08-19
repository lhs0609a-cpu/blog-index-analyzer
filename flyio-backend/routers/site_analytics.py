"""
사이트 방문 통계 API.

수집(POST /collect)은 브라우저가 페이지마다 부르므로 **가볍고 조용해야 한다** —
실패해도 절대 사용자 화면에 영향을 주지 않고, 항상 204 를 돌려준다.
조회(GET /summary)는 관리자 전용.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request, Response
from pydantic import BaseModel

from database import site_analytics_db as adb
from routers.admin import require_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/analytics", tags=["사이트통계"])


def _client_ip(request: Request) -> str:
    """
    Fly 프록시 뒤라 request.client.host 는 내부 IP 다. 고유 방문자 집계가
    통째로 무의미해지므로 실제 IP 헤더를 본다(rate limit 과 같은 이유).
    """
    return (
        request.headers.get("fly-client-ip")
        or (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )


class PageviewIn(BaseModel):
    path: str
    referrer: Optional[str] = ""
    user_id: Optional[str] = None
    device: Optional[str] = None


@router.post("/collect", status_code=204)
async def collect(pv: PageviewIn, request: Request):
    """
    페이지뷰 1건 기록.

    ⚠️ 어떤 이유로도 예외를 밖으로 내보내지 않는다. 통계 수집이 실패해서
    사용자 페이지에 에러 토스트가 뜨면 본말전도다.
    """
    try:
        adb.record_pageview(
            path=pv.path,
            ip=_client_ip(request),
            user_agent=request.headers.get("user-agent", ""),
            referrer=pv.referrer or "",
            user_id=pv.user_id,
            device=pv.device,
        )
    except Exception as e:
        logger.warning(f"[analytics] 기록 실패: {e}")
    return Response(status_code=204)


@router.get("/summary")
async def get_summary(
    days: int = Query(30, ge=1, le=365),
    include_bots: bool = Query(False),
    admin: dict = Depends(require_admin),
):
    """
    관리자 대시보드용 집계.

    인증: 관리자만. 방문 통계는 영업 정보라 공개하지 않는다.
    (admin 라우터의 require_admin 재사용 — 인증 규칙을 한 곳에만 둔다)
    """
    return adb.summary(days=days, include_bots=include_bots)
