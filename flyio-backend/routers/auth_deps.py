"""
공통 인증 의존성 모듈
모든 광고 관련 라우터에서 사용하는 JWT 인증 의존성을 제공합니다.
"""
from fastapi import Depends, HTTPException, Query, Request, status
from fastapi.security import OAuth2PasswordBearer
from typing import Optional
from jose import JWTError, jwt
import hmac
import ipaddress
import logging
import os

from database.user_db import get_user_db
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


async def get_current_user(token: Optional[str] = Depends(oauth2_scheme)) -> dict:
    """
    JWT 토큰에서 현재 사용자를 추출합니다.
    토큰이 없거나 유효하지 않으면 401 에러를 반환합니다.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="인증이 필요합니다. 로그인해주세요.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not token:
        raise credentials_exception

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user_db = get_user_db()
    user = user_db.get_user_by_id(int(user_id))
    if user is None:
        raise credentials_exception
    if not user.get("is_active"):
        raise HTTPException(status_code=403, detail="비활성 계정입니다.")

    return user


async def get_current_user_optional(token: Optional[str] = Depends(oauth2_scheme)) -> Optional[dict]:
    """
    JWT 토큰에서 현재 사용자를 추출합니다 (선택적).
    토큰이 없거나 유효하지 않으면 None을 반환합니다.
    """
    if not token:
        return None

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            return None
    except JWTError:
        return None

    user_db = get_user_db()
    user = user_db.get_user_by_id(int(user_id))
    if user is None or not user.get("is_active"):
        return None

    return user


def get_user_id(current_user: dict = Depends(get_current_user)) -> int:
    """
    JWT 인증된 사용자의 ID를 반환합니다.
    엔드포인트에서 user_id만 필요할 때 사용합니다.

    사용법:
        @router.get("/dashboard")
        async def get_dashboard(user_id: int = Depends(get_user_id)):
            ...
    """
    return current_user["id"]


# ─────────────────────────────────────────────────────────────
# user_id 쿼리 폴백을 어디서까지 허용할지
# ─────────────────────────────────────────────────────────────
# 이 폴백은 원래 **인증을 통째로 대체**했다. 토큰 없이 `?user_id=1` 만 붙이면
# 그 사용자 행세가 됐고, 이걸 쓰는 엔드포인트가 naver_ad.py 에만 129개
# (변경 계열 85개, 그중 debug/naver-raw 는 네이버 API 임의 호출·PUT 까지 통과).
# 즉 로그인 없이 남의 계정 입찰·예산을 바꿀 수 있었다.
#
# 그렇다고 그냥 끄면 이 폴백으로 도는 로컬 운영 스크립트 338개가 같이 죽는다.
# 그래서 **폴백을 없애지 않고 출처를 좁힌다** — 허용된 IP 에서만 받는다.
# 인터넷 전체에는 닫히고, 작업 PC 의 스크립트는 그대로 돈다.
#
# ⚠️ IP 신뢰는 토큰보다 약하다. 이건 종착지가 아니라 스크립트를 옮길 시간을 버는
#    조치다. 최종 목표는 JWT 또는 서비스 토큰이다.
_FALLBACK_ALLOWLIST_ENV = "USER_ID_FALLBACK_ALLOWLIST"
_SERVICE_TOKEN_ENV = "CRON_TOKEN"


def _client_ip(request: Optional[Request]) -> Optional[str]:
    """호출자의 실제 IP.

    ★`X-Forwarded-For` 는 쓰지 않는다 — 밖에서 아무 값이나 넣어 보낼 수 있어
    허용목록을 그대로 통과시킨다. Fly 프록시가 직접 덮어쓰는 `Fly-Client-IP` 만
    믿고, 없으면 소켓 주소로 떨어진다(로컬 실행용).
    """
    if request is None:
        return None
    ip = (request.headers.get("fly-client-ip") or "").strip()
    if ip:
        return ip
    return getattr(getattr(request, "client", None), "host", None)


def _ip_allowed(ip: Optional[str]) -> bool:
    raw = (os.environ.get(_FALLBACK_ALLOWLIST_ENV) or "").strip()
    if not raw or not ip:
        # 미설정이면 아무도 통과시키지 않는다. 열어두는 쪽으로 기울면
        # "설정하는 걸 깜빡했다" 가 곧 구멍이 된다.
        return False
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    for token in raw.replace(" ", "").split(","):
        if not token:
            continue
        try:
            if addr in ipaddress.ip_network(token, strict=False):
                return True
        except ValueError:
            continue
    return False


def _service_token_ok(request: Optional[Request]) -> bool:
    """IP 가 바뀌어 스크립트가 통째로 막혔을 때 쓸 탈출구."""
    expected = (os.environ.get(_SERVICE_TOKEN_ENV) or "").strip()
    if not expected or request is None:
        return False
    given = (request.headers.get("x-service-token") or "").strip()
    if not given:
        auth = (request.headers.get("authorization") or "").strip()
        if auth.startswith("Bearer "):
            given = auth.split(" ", 1)[1].strip()
    return bool(given) and hmac.compare_digest(given, expected)


def get_user_id_with_fallback(
    request: Request,
    current_user: Optional[dict] = Depends(get_current_user_optional),
    user_id: Optional[int] = Query(None, description="사용자 ID (deprecated, JWT 토큰 사용 권장)")
) -> int:
    """
    JWT 인증 우선, Query param 폴백 (마이그레이션 기간용).

    폴백은 **허용된 출처에서만** 받는다(위 주석 참조). 예전에는 아무나 통과했다.
    """
    if current_user:
        return current_user["id"]
    if user_id is not None:
        if _service_token_ok(request):
            logger.info(f"user_id={user_id} fallback via service token")
            return user_id
        ip = _client_ip(request)
        if _ip_allowed(ip):
            logger.warning(f"user_id={user_id} fallback from allowlisted ip={ip} (deprecated)")
            return user_id
        # 거절 사유를 밖으로 알려주지 않는다 — 허용목록의 존재 자체가 정보다.
        logger.warning(f"user_id={user_id} fallback REJECTED ip={ip}")
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="인증이 필요합니다. 로그인해주세요.",
        headers={"WWW-Authenticate": "Bearer"},
    )
