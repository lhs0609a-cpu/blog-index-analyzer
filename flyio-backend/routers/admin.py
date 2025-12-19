"""
Admin router for user management and system monitoring
"""
from fastapi import APIRouter, HTTPException, Depends, status, Request
from pydantic import BaseModel
from typing import Optional, List
import logging

from config import settings
from database.user_db import get_user_db
from database.usage_db import get_usage_db
from database.admin_audit_db import (
    log_admin_action,
    get_audit_logs,
    get_user_audit_history,
    ACTION_GRANT_PREMIUM,
    ACTION_REVOKE_PREMIUM,
    ACTION_EXTEND_SUBSCRIPTION,
    ACTION_SET_ADMIN
)
from routers.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

# Secret key for initial admin setup (use SECRET_KEY from settings)
ADMIN_SETUP_KEY = settings.SECRET_KEY


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


class ExtendSubscriptionRequest(BaseModel):
    user_id: int
    days: int
    memo: Optional[str] = None


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

        # Audit log
        log_admin_action(
            admin_id=admin['id'],
            admin_email=admin['email'],
            action_type=ACTION_GRANT_PREMIUM,
            target_user_id=request.user_id,
            target_email=target_user['email'],
            details={"plan": request.plan, "memo": request.memo}
        )

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

        # Audit log
        log_admin_action(
            admin_id=admin['id'],
            admin_email=admin['email'],
            action_type=ACTION_REVOKE_PREMIUM,
            target_user_id=request.user_id,
            target_email=target_user['email'],
            details={"previous_plan": target_user.get('plan')}
        )

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

        # Audit log
        log_admin_action(
            admin_id=admin['id'],
            admin_email=admin['email'],
            action_type=ACTION_SET_ADMIN,
            target_user_id=request.user_id,
            target_email=target_user['email'],
            details={"is_admin": request.is_admin}
        )

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
    subscription_stats = user_db.get_subscription_stats()

    return {
        "users": {
            "total": total_users,
            "premium": len(premium_users)
        },
        "usage": usage_stats,
        "limits": usage_db.DAILY_LIMITS,
        "subscription": subscription_stats
    }


@router.get("/stats/subscription")
async def get_subscription_stats(admin: dict = Depends(require_admin)):
    """Get subscription statistics (admin only)"""
    user_db = get_user_db()
    stats = user_db.get_subscription_stats()
    return stats


@router.get("/users/expiring")
async def get_expiring_users(
    days: int = 7,
    admin: dict = Depends(require_admin)
):
    """Get users whose subscription expires within N days (admin only)"""
    try:
        user_db = get_user_db()
        usage_db = get_usage_db()

        users = user_db.get_expiring_users(days=days)

        # Add remaining days and usage for each user
        from datetime import datetime
        now = datetime.now()

        for user in users:
            expires_at = user.get('subscription_expires_at')
            if expires_at:
                try:
                    expiry = datetime.fromisoformat(expires_at.replace('Z', '+00:00').replace('+00:00', ''))
                    user['remaining_days'] = max(0, (expiry - now).days)
                except:
                    user['remaining_days'] = None

            # Get today's usage
            try:
                usage = usage_db.get_user_usage(user['id'], user.get('plan', 'free'))
                user['usage_today'] = usage.get('count', 0)
                user['usage_limit'] = usage.get('limit', 0)
            except Exception as e:
                logger.error(f"Error getting usage for user {user['id']}: {e}")
                user['usage_today'] = 0
                user['usage_limit'] = 0

        return {"users": users, "count": len(users), "days": days}
    except Exception as e:
        logger.error(f"Error in get_expiring_users: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/users/with-usage")
async def get_users_with_usage(
    limit: int = 100,
    offset: int = 0,
    admin: dict = Depends(require_admin)
):
    """Get all users with remaining days and today's usage (admin only)"""
    try:
        user_db = get_user_db()
        usage_db = get_usage_db()

        users = user_db.get_all_users_with_usage(limit=limit, offset=offset)
        total = user_db.get_users_count()

        # Serialize users properly
        serialized_users = []
        for user in users:
            try:
                usage = usage_db.get_user_usage(user['id'], user.get('plan', 'free'))
                serialized_user = {
                    "id": user.get('id'),
                    "email": user.get('email'),
                    "name": user.get('name'),
                    "blog_id": user.get('blog_id'),
                    "plan": user.get('plan', 'free'),
                    "is_active": bool(user.get('is_active', True)),
                    "is_verified": bool(user.get('is_verified', False)),
                    "is_admin": bool(user.get('is_admin', False)),
                    "is_premium_granted": bool(user.get('is_premium_granted', False)),
                    "subscription_expires_at": str(user.get('subscription_expires_at')) if user.get('subscription_expires_at') else None,
                    "granted_by": user.get('granted_by'),
                    "granted_at": str(user.get('granted_at')) if user.get('granted_at') else None,
                    "memo": user.get('memo'),
                    "created_at": str(user.get('created_at', '')),
                    "remaining_days": user.get('remaining_days'),
                    "usage_today": usage.get('count', 0),
                    "usage_limit": usage.get('limit', 0)
                }
                serialized_users.append(serialized_user)
            except Exception as e:
                logger.error(f"Error processing user {user.get('id')}: {e}")

        return {
            "users": serialized_users,
            "total": total,
            "limit": limit,
            "offset": offset
        }
    except Exception as e:
        logger.error(f"Error in get_users_with_usage: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))


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


# ============ Subscription Management ============

@router.post("/users/extend-subscription")
async def extend_subscription(
    request: ExtendSubscriptionRequest,
    admin: dict = Depends(require_admin)
):
    """Extend user's subscription period (admin only)"""
    user_db = get_user_db()

    target_user = user_db.get_user_by_id(request.user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    result = user_db.extend_subscription(
        user_id=request.user_id,
        days=request.days,
        admin_id=admin['id'],
        memo=request.memo
    )

    if result.get('success'):
        logger.info(f"Admin {admin['email']} extended subscription for user {request.user_id} by {request.days} days")

        # Audit log
        log_admin_action(
            admin_id=admin['id'],
            admin_email=admin['email'],
            action_type=ACTION_EXTEND_SUBSCRIPTION,
            target_user_id=request.user_id,
            target_email=target_user['email'],
            details={
                "days": request.days,
                "old_expiry": result.get('old_expiry'),
                "new_expiry": result.get('new_expiry'),
                "memo": request.memo
            }
        )

        return result

    raise HTTPException(status_code=500, detail=result.get('error', 'Failed to extend subscription'))


@router.get("/users/{user_id}/detail")
async def get_user_full_detail(
    user_id: int,
    admin: dict = Depends(require_admin)
):
    """Get detailed user information with usage stats (admin only)"""
    user_db = get_user_db()
    usage_db = get_usage_db()

    user = user_db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Remove password hash
    user.pop('hashed_password', None)

    # Get granter email if granted
    granter_email = None
    if user.get('granted_by'):
        granter = user_db.get_user_by_id(user['granted_by'])
        if granter:
            granter_email = granter.get('email')

    # Get today's usage
    usage_today = usage_db.get_user_usage(user_id)

    # Get audit history for this user
    audit_history = get_user_audit_history(user_id, limit=10)

    return {
        "user": user,
        "granter_email": granter_email,
        "usage_today": usage_today,
        "audit_history": audit_history
    }


# ============ Audit Logs ============

@router.get("/logs")
async def get_admin_logs(
    limit: int = 50,
    offset: int = 0,
    action_type: Optional[str] = None,
    admin: dict = Depends(require_admin)
):
    """Get admin activity logs (admin only)"""
    result = get_audit_logs(
        limit=limit,
        offset=offset,
        action_type=action_type
    )
    return result


# ============ Initial Admin Setup (One-time use) ============

class InitialAdminSetupRequest(BaseModel):
    email: str
    setup_key: str


@router.post("/setup/initial-admin")
async def setup_initial_admin(request: InitialAdminSetupRequest):
    """
    초기 관리자 설정 (SECRET_KEY 필요)
    보안: SECRET_KEY를 알아야만 관리자 설정 가능
    """
    # Verify setup key
    if request.setup_key != ADMIN_SETUP_KEY:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid setup key"
        )

    user_db = get_user_db()

    # Find user by email
    user = user_db.get_user_by_email(request.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User with email {request.email} not found. Please register first."
        )

    # Check if already admin
    if user.get('is_admin'):
        return {"message": f"User {request.email} is already an admin", "user_id": user['id']}

    # Set admin status
    success = user_db.set_admin(user['id'], True)
    if success:
        logger.info(f"Initial admin setup: {request.email} is now admin")
        return {
            "message": f"Successfully set {request.email} as admin",
            "user_id": user['id'],
            "email": request.email
        }

    raise HTTPException(status_code=500, detail="Failed to set admin status")
