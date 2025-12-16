"""
Admin router for user management and system monitoring
"""
from fastapi import APIRouter, HTTPException, Depends, status, Request
from pydantic import BaseModel
from typing import Optional, List
import logging

from database.user_db import get_user_db
from database.usage_db import get_usage_db
from routers.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()


# Request/Response models
class GrantPremiumRequest(BaseModel):
    user_id: int
    plan: str = 'unlimited'  # free, basic, pro, unlimited
    memo: Optional[str] = None


class RevokePremiumRequest(BaseModel):
    user_id: int


class SetAdminRequest(BaseModel):
    user_id: int
    is_admin: bool


class UserResponse(BaseModel):
    id: int
    email: str
    name: Optional[str]
    blog_id: Optional[str]
    plan: str
    is_active: bool
    is_verified: bool
    is_admin: bool
    is_premium_granted: bool
    subscription_expires_at: Optional[str]
    granted_by: Optional[int]
    granted_at: Optional[str]
    memo: Optional[str]
    created_at: str


# Helper function to check admin access
async def require_admin(current_user: dict = Depends(get_current_user)) -> dict:
    """Require admin access"""
    if not current_user.get('is_admin'):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


# Admin endpoints
@router.get("/users")
async def get_all_users(
    limit: int = 100,
    offset: int = 0,
    admin: dict = Depends(require_admin)
):
    """Get all users (admin only)"""
    user_db = get_user_db()
    users = user_db.get_all_users(limit=limit, offset=offset)
    total = user_db.get_users_count()

    return {
        "users": users,
        "total": total,
        "limit": limit,
        "offset": offset
    }


@router.get("/users/search")
async def search_users(
    q: str,
    admin: dict = Depends(require_admin)
):
    """Search users by email or name (admin only)"""
    user_db = get_user_db()
    users = user_db.search_users(q)
    return {"users": users, "count": len(users)}


@router.get("/users/premium")
async def get_premium_users(admin: dict = Depends(require_admin)):
    """Get all premium users (paid or granted) (admin only)"""
    user_db = get_user_db()
    users = user_db.get_premium_users()
    return {"users": users, "count": len(users)}


@router.get("/users/{user_id}")
async def get_user_detail(
    user_id: int,
    admin: dict = Depends(require_admin)
):
    """Get user detail (admin only)"""
    user_db = get_user_db()
    user = user_db.get_user_by_id(user_id)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Remove password hash
    user.pop('hashed_password', None)
    return user


@router.post("/users/grant-premium")
async def grant_premium_access(
    request: GrantPremiumRequest,
    admin: dict = Depends(require_admin)
):
    """Grant premium access to a user (admin only)"""
    user_db = get_user_db()

    # Check if target user exists
    target_user = user_db.get_user_by_id(request.user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Grant premium
    success = user_db.grant_premium(
        user_id=request.user_id,
        admin_id=admin['id'],
        plan=request.plan,
        memo=request.memo
    )

    if success:
        logger.info(f"Admin {admin['email']} granted {request.plan} to user {request.user_id}")
        updated_user = user_db.get_user_by_id(request.user_id)
        updated_user.pop('hashed_password', None)
        return {
            "message": "Premium access granted",
            "user": updated_user
        }

    raise HTTPException(status_code=500, detail="Failed to grant premium")


@router.post("/users/revoke-premium")
async def revoke_premium_access(
    request: RevokePremiumRequest,
    admin: dict = Depends(require_admin)
):
    """Revoke premium access from a user (admin only)"""
    user_db = get_user_db()

    target_user = user_db.get_user_by_id(request.user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    success = user_db.revoke_premium(request.user_id)

    if success:
        logger.info(f"Admin {admin['email']} revoked premium from user {request.user_id}")
        updated_user = user_db.get_user_by_id(request.user_id)
        updated_user.pop('hashed_password', None)
        return {
            "message": "Premium access revoked",
            "user": updated_user
        }

    raise HTTPException(status_code=500, detail="Failed to revoke premium")


@router.post("/users/set-admin")
async def set_admin_status(
    request: SetAdminRequest,
    admin: dict = Depends(require_admin)
):
    """Set admin status for a user (admin only)"""
    user_db = get_user_db()

    # Prevent self-demotion
    if request.user_id == admin['id'] and not request.is_admin:
        raise HTTPException(status_code=400, detail="Cannot remove your own admin status")

    target_user = user_db.get_user_by_id(request.user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    success = user_db.set_admin(request.user_id, request.is_admin)

    if success:
        logger.info(f"Admin {admin['email']} set admin={request.is_admin} for user {request.user_id}")
        return {"message": f"Admin status set to {request.is_admin}"}

    raise HTTPException(status_code=500, detail="Failed to update admin status")


@router.get("/usage/stats")
async def get_usage_stats(admin: dict = Depends(require_admin)):
    """Get usage statistics (admin only)"""
    usage_db = get_usage_db()
    stats = usage_db.get_usage_stats()
    return stats


@router.get("/stats/overview")
async def get_admin_overview(admin: dict = Depends(require_admin)):
    """Get admin dashboard overview (admin only)"""
    user_db = get_user_db()
    usage_db = get_usage_db()

    total_users = user_db.get_users_count()
    premium_users = user_db.get_premium_users()
    usage_stats = usage_db.get_usage_stats()

    return {
        "users": {
            "total": total_users,
            "premium": len(premium_users)
        },
        "usage": usage_stats,
        "limits": usage_db.DAILY_LIMITS
    }


# Usage check endpoint (for non-admin, check own usage)
@router.get("/usage/check")
async def check_usage(request: Request, current_user: dict = Depends(get_current_user)):
    """Check current user's usage"""
    usage_db = get_usage_db()
    user_db = get_user_db()

    effective_plan = user_db.get_user_effective_plan(current_user['id'])
    usage = usage_db.get_user_usage(current_user['id'], effective_plan)

    return {
        "plan": effective_plan,
        "usage": usage
    }


@router.get("/health")
async def detailed_health_check(admin: dict = Depends(require_admin)):
    """상세 헬스 체크 (admin only)"""
    from config import settings

    health_status = {
        "status": "healthy",
        "checks": {}
    }

    # 실제 DB 연결 체크
    try:
        from database.sqlite_db import get_sqlite_client
        client = get_sqlite_client()
        client.execute_query("SELECT 1")
        health_status["checks"]["database"] = "connected"
    except Exception as e:
        health_status["checks"]["database"] = f"error: {str(e)}"
        health_status["status"] = "degraded"

    # Learning DB 체크
    try:
        from database.learning_db import get_learning_statistics
        stats = get_learning_statistics()
        health_status["checks"]["learning_db"] = f"connected (samples: {stats['total_samples']})"
    except Exception as e:
        health_status["checks"]["learning_db"] = f"error: {str(e)}"

    # Redis 체크 (선택적)
    if settings.REDIS_URL:
        try:
            health_status["checks"]["redis"] = "not_configured"
        except Exception as e:
            health_status["checks"]["redis"] = f"error: {str(e)}"
    else:
        health_status["checks"]["redis"] = "not_configured"

    # MongoDB 체크 (선택적)
    health_status["checks"]["mongodb"] = "not_configured"

    return health_status


@router.get("/system/info")
async def get_system_info(admin: dict = Depends(require_admin)):
    """시스템 정보 (admin only)"""
    import platform
    import sys
    from config import settings

    return {
        "app_name": settings.APP_NAME,
        "version": settings.API_VERSION,
        "environment": settings.APP_ENV,
        "python_version": sys.version,
        "platform": platform.platform()
    }


@router.get("/system/config")
async def get_system_config(admin: dict = Depends(require_admin)):
    """시스템 설정 (admin only)"""
    from config import settings

    return {
        "app_name": settings.APP_NAME,
        "api_version": settings.API_VERSION,
        "environment": settings.APP_ENV,
        "debug_mode": settings.DEBUG,
        "features": {
            "learning_engine": True,
            "related_keywords": True,
            "blog_analysis": True
        }
    }
