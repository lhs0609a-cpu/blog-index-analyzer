"""
공통 인증 의존성 모듈
모든 광고 관련 라우터에서 사용하는 JWT 인증 의존성을 제공합니다.
"""
from fastapi import Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from typing import Optional
from jose import JWTError, jwt
import logging

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


def get_user_id_with_fallback(
    current_user: Optional[dict] = Depends(get_current_user_optional),
    user_id: Optional[int] = Query(None, description="사용자 ID (deprecated, JWT 토큰 사용 권장)")
) -> int:
    """
    JWT 인증 우선, Query param 폴백 (마이그레이션 기간용).
    JWT 토큰이 있으면 토큰에서 user_id를 추출하고,
    없으면 Query parameter의 user_id를 사용합니다.

    마이그레이션 완료 후 get_user_id로 교체하세요.
    """
    if current_user:
        return current_user["id"]
    if user_id is not None:
        logger.warning(f"Query param user_id={user_id} used without JWT token (deprecated)")
        return user_id
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="인증이 필요합니다. 로그인해주세요.",
        headers={"WWW-Authenticate": "Bearer"},
    )
