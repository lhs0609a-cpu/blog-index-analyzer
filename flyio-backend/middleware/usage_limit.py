"""
Usage limit middleware and dependencies
"""
from fastapi import Request, HTTPException, status, Depends
from typing import Optional
import logging

from database.usage_db import get_usage_db
from database.user_db import get_user_db
from routers.auth import get_current_user_optional

logger = logging.getLogger(__name__)


def get_client_ip(request: Request) -> str:
    """Get client IP address from request"""
    # Check for forwarded headers (for proxies like Fly.io)
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        # Take the first IP in the chain
        return forwarded.split(",")[0].strip()

    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip

    # Fallback to direct client IP
    if request.client:
        return request.client.host

    return "unknown"


async def check_usage_limit(
    request: Request,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """
    Check usage limit before allowing API access.
    Raises HTTPException if limit exceeded.
    """
    usage_db = get_usage_db()
    user_db = get_user_db()
    client_ip = get_client_ip(request)

    if current_user:
        # Logged in user
        effective_plan = user_db.get_user_effective_plan(current_user['id'])
        result = usage_db.check_and_use(
            ip_address=client_ip,
            user_id=current_user['id'],
            plan=effective_plan
        )
    else:
        # Guest user
        result = usage_db.check_and_use(
            ip_address=client_ip,
            user_id=None,
            plan='guest'
        )

    if not result['allowed']:
        limit = result['limit']
        plan = result['plan']

        if plan == 'guest':
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "error": "daily_limit_exceeded",
                    "message": f"일일 무료 검색 한도({limit}회)를 초과했습니다. 회원가입하시면 더 많은 검색이 가능합니다.",
                    "limit": limit,
                    "plan": plan,
                    "upgrade_hint": "회원가입 시 일일 10회까지 무료로 이용 가능합니다."
                }
            )
        else:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "error": "daily_limit_exceeded",
                    "message": f"일일 검색 한도({limit}회)를 초과했습니다.",
                    "limit": limit,
                    "plan": plan,
                    "upgrade_hint": "프리미엄 구독으로 업그레이드하시면 더 많은 검색이 가능합니다."
                }
            )

    # Attach usage info to request state for response headers
    request.state.usage_info = result
    return result


async def get_usage_info(
    request: Request,
    current_user: Optional[dict] = Depends(get_current_user_optional)
):
    """
    Get usage info without incrementing counter.
    For checking remaining quota before making a request.
    """
    usage_db = get_usage_db()
    user_db = get_user_db()
    client_ip = get_client_ip(request)

    if current_user:
        effective_plan = user_db.get_user_effective_plan(current_user['id'])
        usage = usage_db.get_user_usage(current_user['id'], effective_plan)
        usage['plan'] = effective_plan
    else:
        usage = usage_db.get_guest_usage(client_ip)
        usage['plan'] = 'guest'

    return usage
