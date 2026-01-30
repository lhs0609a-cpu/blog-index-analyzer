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
from database.subscription_db import (
    get_all_payments_admin,
    get_revenue_stats,
    get_payment_by_id,
    cancel_payment_record,
    get_payment_history
)
from routers.auth import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter()

# Secret key for initial admin setup (use SECRET_KEY from settings)
ADMIN_SETUP_KEY = settings.SECRET_KEY


# Request/Response models
class GrantPremiumRequest(BaseModel):
    user_id: int
    plan: str = 'business'  # free, basic, pro, business
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


class BulkUpgradeRequest(BaseModel):
    user_ids: List[int]
    plan: str = 'pro'
    days: int = 30
    memo: Optional[str] = None


class RefundRequest(BaseModel):
    payment_id: int
    reason: str


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


# Pagination 제한 상수
MAX_PAGE_LIMIT = 500

# Admin endpoints
@router.get("/users")
async def get_all_users(
    limit: int = 100,
    offset: int = 0,
    admin: dict = Depends(require_admin)
):
    """Get all users (admin only)"""
    # Pagination 제한 적용
    if limit < 1:
        limit = 100
    if limit > MAX_PAGE_LIMIT:
        limit = MAX_PAGE_LIMIT
    if offset < 0:
        offset = 0

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
        logger.info(f"get_expiring_users called with days={days}")
        user_db = get_user_db()
        usage_db = get_usage_db()

        users = user_db.get_expiring_users(days=days)
        logger.info(f"Found {len(users)} expiring users")

        # Add remaining days and usage for each user - with proper serialization
        from datetime import datetime
        now = datetime.now()

        serialized_users = []
        for user in users:
            try:
                expires_at = user.get('subscription_expires_at')
                remaining_days = None
                if expires_at:
                    try:
                        expiry = datetime.fromisoformat(expires_at.replace('Z', '+00:00').replace('+00:00', ''))
                        remaining_days = max(0, (expiry - now).days)
                    except:
                        remaining_days = None

                # Get today's usage
                usage_today = 0
                usage_limit = 0
                try:
                    usage = usage_db.get_user_usage(user['id'], user.get('plan', 'free'))
                    usage_today = usage.get('count', 0)
                    usage_limit = usage.get('limit', 0)
                except Exception as e:
                    logger.error(f"Error getting usage for user {user['id']}: {e}")

                serialized_user = {
                    "id": user.get('id'),
                    "email": user.get('email'),
                    "name": user.get('name'),
                    "plan": user.get('plan', 'free'),
                    "is_premium_granted": bool(user.get('is_premium_granted', False)),
                    "subscription_expires_at": str(user.get('subscription_expires_at')) if user.get('subscription_expires_at') else None,
                    "granted_by": user.get('granted_by'),
                    "memo": user.get('memo'),
                    "created_at": str(user.get('created_at', '')),
                    "remaining_days": remaining_days,
                    "usage_today": usage_today,
                    "usage_limit": usage_limit
                }
                serialized_users.append(serialized_user)
            except Exception as e:
                logger.error(f"Error serializing expiring user {user.get('id')}: {e}")
                import traceback
                logger.error(traceback.format_exc())

        logger.info(f"Returning {len(serialized_users)} serialized expiring users")
        return {"users": serialized_users, "count": len(serialized_users), "days": days}
    except Exception as e:
        logger.error(f"Error in get_expiring_users: {e}")
        import traceback
        logger.error(traceback.format_exc())
        # 내부 오류 정보를 클라이언트에 노출하지 않음
        raise HTTPException(status_code=500, detail="사용자 목록을 불러오는 중 오류가 발생했습니다")


@router.get("/users/with-usage")
async def get_users_with_usage(
    limit: int = 100,
    offset: int = 0,
    admin: dict = Depends(require_admin)
):
    """Get all users with remaining days and today's usage (admin only)"""
    # Pagination 제한 적용
    limit = max(1, min(limit, MAX_PAGE_LIMIT))
    offset = max(0, offset)

    try:
        logger.info(f"get_users_with_usage called with limit={limit}, offset={offset}")
        user_db = get_user_db()
        usage_db = get_usage_db()

        logger.info("Fetching users from database...")
        users = user_db.get_all_users_with_usage(limit=limit, offset=offset)
        logger.info(f"Got {len(users)} users from database")
        total = user_db.get_users_count()
        logger.info(f"Total users count: {total}")

        # Serialize users properly
        logger.info("Starting user serialization...")
        serialized_users = []
        for idx, user in enumerate(users):
            try:
                logger.info(f"Processing user {idx}: id={user.get('id')}, email={user.get('email')}")
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
                logger.info(f"User {idx} serialized successfully")
            except Exception as e:
                logger.error(f"Error processing user {user.get('id')}: {e}")
                import traceback
                logger.error(traceback.format_exc())

        logger.info(f"Serialization complete. Returning {len(serialized_users)} users")
        response = {
            "users": serialized_users,
            "total": total,
            "limit": limit,
            "offset": offset
        }
        logger.info(f"Response prepared: {len(response['users'])} users, total={response['total']}")
        return response
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


# Rate limiting for admin setup (simple in-memory, reset on restart)
_admin_setup_attempts: dict = {}
_MAX_SETUP_ATTEMPTS = 5
_LOCKOUT_MINUTES = 30

@router.post("/setup/initial-admin")
async def setup_initial_admin(request: InitialAdminSetupRequest):
    """
    초기 관리자 설정 (SECRET_KEY 필요)
    보안: SECRET_KEY를 알아야만 관리자 설정 가능
    Rate limiting: 5회 실패 시 30분 차단
    """
    from datetime import datetime, timedelta

    # Rate limiting check
    client_key = request.email.lower()
    now = datetime.utcnow()

    if client_key in _admin_setup_attempts:
        attempts, lockout_until = _admin_setup_attempts[client_key]
        if lockout_until and now < lockout_until:
            remaining = int((lockout_until - now).total_seconds() / 60)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many attempts. Try again in {remaining} minutes."
            )
        if lockout_until and now >= lockout_until:
            # Reset after lockout period
            _admin_setup_attempts[client_key] = (0, None)

    # Verify setup key
    if request.setup_key != ADMIN_SETUP_KEY:
        # Track failed attempt
        attempts, _ = _admin_setup_attempts.get(client_key, (0, None))
        attempts += 1
        if attempts >= _MAX_SETUP_ATTEMPTS:
            lockout_until = now + timedelta(minutes=_LOCKOUT_MINUTES)
            _admin_setup_attempts[client_key] = (attempts, lockout_until)
            logger.warning(f"Admin setup locked out for {client_key} until {lockout_until}")
        else:
            _admin_setup_attempts[client_key] = (attempts, None)

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid setup key"
        )

    # Clear attempts on success
    if client_key in _admin_setup_attempts:
        del _admin_setup_attempts[client_key]

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


# ============ Payment Management ============

@router.get("/payments")
async def get_all_payments(
    limit: int = 50,
    offset: int = 0,
    status: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    admin: dict = Depends(require_admin)
):
    """모든 결제 내역 조회 (admin only)"""
    # Pagination 제한 적용
    limit = max(1, min(limit, MAX_PAGE_LIMIT))
    offset = max(0, offset)

    result = get_all_payments_admin(
        limit=limit,
        offset=offset,
        status=status,
        start_date=start_date,
        end_date=end_date
    )

    # 사용자 정보 추가
    user_db = get_user_db()
    payments_with_user = []
    for payment in result['payments']:
        user = user_db.get_user_by_id(payment['user_id'])
        payment['user_email'] = user.get('email') if user else 'Unknown'
        payment['user_name'] = user.get('name') if user else 'Unknown'
        payments_with_user.append(payment)

    result['payments'] = payments_with_user
    return result


@router.get("/stats/revenue")
async def get_revenue_statistics(
    period: str = "30d",
    admin: dict = Depends(require_admin)
):
    """매출 통계 조회 (admin only)"""
    return get_revenue_stats(period=period)


@router.get("/users/{user_id}/payments")
async def get_user_payment_history(
    user_id: int,
    limit: int = 20,
    admin: dict = Depends(require_admin)
):
    """특정 사용자의 결제 내역 조회 (admin only)"""
    # Pagination 제한 적용
    limit = max(1, min(limit, 100))

    user_db = get_user_db()
    user = user_db.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    payments = get_payment_history(user_id, limit=limit)
    return {
        "user_id": user_id,
        "user_email": user.get('email'),
        "payments": payments,
        "count": len(payments)
    }


@router.post("/payments/{payment_id}/refund")
async def refund_payment(
    payment_id: int,
    request: RefundRequest,
    admin: dict = Depends(require_admin)
):
    """결제 환불 처리 (admin only)"""
    import httpx
    import base64

    # 결제 정보 조회
    payment = get_payment_by_id(payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")

    if payment['status'] != 'completed':
        raise HTTPException(status_code=400, detail="Only completed payments can be refunded")

    payment_key = payment.get('payment_key')
    if not payment_key:
        raise HTTPException(status_code=400, detail="Payment key not found")

    # 토스페이먼츠 환불 API 호출
    TOSS_SECRET_KEY = getattr(settings, 'TOSS_SECRET_KEY', '')
    if not TOSS_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Payment system not configured")

    encoded_key = base64.b64encode(f"{TOSS_SECRET_KEY}:".encode()).decode()
    headers = {
        "Authorization": f"Basic {encoded_key}",
        "Content-Type": "application/json"
    }

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"https://api.tosspayments.com/v1/payments/{payment_key}/cancel",
                headers=headers,
                json={"cancelReason": request.reason}
            )

            if response.status_code != 200:
                error_data = response.json()
                raise HTTPException(
                    status_code=response.status_code,
                    detail=error_data.get("message", "환불 처리에 실패했습니다")
                )

            # DB 업데이트
            cancel_payment_record(payment_id)

            # 사용자 플랜 다운그레이드
            user_db = get_user_db()
            user_db.revoke_premium(payment['user_id'])

            # 감사 로그
            log_admin_action(
                admin_id=admin['id'],
                admin_email=admin['email'],
                action_type="REFUND_PAYMENT",
                target_user_id=payment['user_id'],
                target_email="",
                details={
                    "payment_id": payment_id,
                    "amount": payment['amount'],
                    "reason": request.reason
                }
            )

            logger.info(f"Admin {admin['email']} refunded payment {payment_id}")

            return {
                "success": True,
                "message": "환불이 완료되었습니다",
                "payment_id": payment_id,
                "refunded_amount": payment['amount']
            }

    except httpx.RequestError as e:
        logger.error(f"Refund request error: {e}")
        raise HTTPException(status_code=500, detail="결제 서버 연결에 실패했습니다")


# ============ Bulk Operations ============

@router.post("/users/bulk-upgrade")
async def bulk_upgrade_users(
    request: BulkUpgradeRequest,
    admin: dict = Depends(require_admin)
):
    """여러 사용자 일괄 플랜 업그레이드 (admin only)"""
    if len(request.user_ids) > 50:
        raise HTTPException(status_code=400, detail="한 번에 최대 50명까지 업그레이드 가능합니다")

    if request.plan not in ['basic', 'pro', 'business']:
        raise HTTPException(status_code=400, detail="유효하지 않은 플랜입니다")

    user_db = get_user_db()
    results = {
        "success": [],
        "failed": []
    }

    for user_id in request.user_ids:
        try:
            user = user_db.get_user_by_id(user_id)
            if not user:
                results['failed'].append({"user_id": user_id, "error": "User not found"})
                continue

            success = user_db.grant_premium(
                user_id=user_id,
                admin_id=admin['id'],
                plan=request.plan,
                memo=request.memo or f"일괄 업그레이드 ({request.days}일)"
            )

            if success:
                # 구독 기간 설정
                if request.days > 0:
                    user_db.extend_subscription(
                        user_id=user_id,
                        days=request.days,
                        admin_id=admin['id'],
                        memo=request.memo
                    )

                results['success'].append({
                    "user_id": user_id,
                    "email": user.get('email'),
                    "plan": request.plan
                })

                # 감사 로그
                log_admin_action(
                    admin_id=admin['id'],
                    admin_email=admin['email'],
                    action_type="BULK_UPGRADE",
                    target_user_id=user_id,
                    target_email=user.get('email', ''),
                    details={
                        "plan": request.plan,
                        "days": request.days,
                        "memo": request.memo
                    }
                )
            else:
                results['failed'].append({"user_id": user_id, "error": "Upgrade failed"})

        except Exception as e:
            logger.error(f"Bulk upgrade error for user {user_id}: {e}")
            results['failed'].append({"user_id": user_id, "error": str(e)})

    logger.info(f"Admin {admin['email']} bulk upgraded {len(results['success'])} users to {request.plan}")

    return {
        "message": f"{len(results['success'])}명 업그레이드 완료, {len(results['failed'])}명 실패",
        "success_count": len(results['success']),
        "failed_count": len(results['failed']),
        "results": results
    }


# ============ Community Seed Data Generation ============

import asyncio
import random
from datetime import datetime, timedelta

# 자동 생성 상태 관리
_auto_generation_task = None
_auto_generation_running = False

# 감탄사/추임새
EXCLAMATIONS = [
    "ㅋㅋㅋ", "ㅋㅋㅋㅋ", "ㅋㅋㅋㅋㅋ", "ㅎㅎ", "ㅎㅎㅎ",
    "ㅠㅠ", "ㅜㅜ", "ㅠㅜ", "ㅡㅡ", ";;", "...", "ㄷㄷ", "ㄷㄷㄷ",
    "ㅇㅇ", "ㄹㅇ", "ㅇㅈ", "ㄱㅇㄷ", "ㅇㄱㄹㅇ", "ㅁㅊ",
    "헐", "대박", "미쳤다", "레전드", "실화냐", "ㄹㅇㅋㅋ",
    "와", "오", "우와", "와씨", "아니", "진짜", "마자", "맞아",
]

# 블로그 운영 관련 주제
TOPICS = {
    "tip": [
        "블로그 상위노출 팁", "C-Rank 올리는 법", "D.I.A. 점수 높이는 방법",
        "키워드 선정하는 법", "블로그 지수 올리기", "이웃 늘리는 방법",
        "방문자수 늘리는 팁", "블로그 수익화 방법", "애드포스트 수익 인증",
        "체험단 신청 꿀팁", "원고료 협찬 받는법", "블로그 마케팅 노하우",
    ],
    "question": [
        "블로그 저품질 왜 걸리나요", "상위노출이 안돼요", "C-Rank가 뭔가요",
        "D.I.A. 점수 어떻게 봐요", "키워드 몇개가 적당해요", "글 몇개 써야 상위노출",
        "이웃 몇명이면 최적화", "방문자 100명 어떻게", "애드포스트 승인 조건",
    ],
    "free": [
        "오늘 블로그 현황", "드디어 상위노출 성공", "방문자 1000명 돌파",
        "첫 체험단 당첨", "애드포스트 수익 인증", "블로그 시작 1개월차",
        "오늘 쓴 글 피드백", "슬럼프 왔어요", "동기부여 필요해요",
    ],
    "success": [
        "드디어 상위노출 성공했어요", "첫 협찬 후기", "월 수익 100만원 달성",
        "방문자 1만명 돌파", "최적화 블로그 됐어요", "저품질 탈출 성공",
    ],
}

TIPS = [
    "키워드 3개 이상 넣기", "제목에 키워드 필수", "본문 2000자 이상 쓰기",
    "이미지 최소 10장", "매일 1포스팅", "이웃 소통 열심히",
    "댓글 답글 꼭 달기", "상위노출 키워드 분석", "경쟁 낮은 키워드 공략",
    "롱테일 키워드 활용", "시리즈물로 연재하기", "정보성 글 위주로",
]

RESULTS = [
    "상위노출 됐어요", "방문자 2배 늘었어요", "이웃 100명 늘었음",
    "C-Rank 올랐어요", "D.I.A. 점수 상승", "첫 협찬 받음",
]

FEELINGS = [
    "요즘 블로그가 너무 재밌어요", "슬럼프가 좀 왔어요 ㅠㅠ",
    "동기부여가 필요해요", "귀찮은데 해야해서..", "보람찬 하루였어요",
    "오늘 좀 힘들었어요", "뿌듯해요 ㅎㅎ", "아직 갈길이 멀어요",
]

COMMENT_TEMPLATES = [
    "오 {exc} 저도 해봐야겠어요", "와 대박 {exc} 도움됐어요",
    "이거 진짜 꿀팁이네요 {exc}", "감사합니다 {exc} 바로 적용해볼게요",
    "저도 이렇게 하니까 효과봤어요 ㅎㅎ", "ㅇㅈ {exc} 인정합니다",
    "굳굳 좋은 정보네요", "오 이거 몰랐는데 {exc}", "저장해둡니다 {exc}",
    "화이팅 {exc}", "응원합니다 {exc}", "좋은 글 감사합니다~",
    "저도 궁금했는데 {exc}", "저도 비슷한 경험 있어요 ㅋㅋ",
    "어렵네요 ㅠㅠ", "저만 안되나..",
    "ㅋㅋㅋㅋ", "ㅇㅈ", "ㄹㅇ", "굳", "ㅎㅎ", "오오", "와", "대박",
]


def add_typo(text: str) -> str:
    """랜덤하게 오타 추가"""
    if random.random() < 0.1:
        typos = [
            ("ㅋㅋㅋ", "ㅋㅋㅋㅋ"), ("요", "욤"), ("어요", "어용"),
            ("해요", "햄"), ("네요", "넹"), ("죠", "쥬"), (" ", ""),
        ]
        old, new = random.choice(typos)
        text = text.replace(old, new, 1)
    return text


def generate_post_content(category: str) -> dict:
    """게시글 내용 생성"""
    topic = random.choice(TOPICS.get(category, TOPICS["free"]))
    months = random.randint(1, 24)
    exc = random.choice(EXCLAMATIONS)

    templates = {
        "tip": f"""안녕하세요 블로그 {months}개월차입니다
오늘은 {topic}에 대해 공유할게요 {exc}

제가 직접 해보니까 확실히 효과있더라구요
- {random.choice(TIPS)}
- {random.choice(TIPS)}
- {random.choice(TIPS)}

이거 ㄹㅇ 해보시면 바로 효과봄
저도 이거 하고 {random.choice(RESULTS)}

혹시 궁금한거 있으면 댓글 남겨주세요~""",

        "question": f"""저 블로그 {months}개월찬데요 ㅠㅠ
{topic}?

{random.choice(FEELINGS)}
이거 왜이러는지 아시는분 ㅠㅠ

진짜 답답해서 글 올립니다 도와주세요 {exc}""",

        "free": f"""오늘 블로그 현황 공유 {exc}

글 {random.randint(10, 500)}개 / 방문자 {random.randint(50, 5000)}명 / 이웃 {random.randint(20, 2000)}명

{random.choice(FEELINGS)}
내일은 {random.choice(TIPS)} 해봐야겠어요

다들 오늘도 화이팅 {random.choice(EXCLAMATIONS)}""",

        "success": f"""와 드디어 {random.choice(RESULTS)} {exc}{exc}{exc}

솔직히 포기할뻔 했는데 ㄹㅇ 기뻐서 글씀

{months}개월 걸렸어요
매일 글 쓰면서 {random.choice(TIPS)} 했어요

비결은 {random.choice(TIPS)}

포기하지 마세요 여러분도 할 수 있어요!!""",
    }

    content = templates.get(category, templates["free"])
    return {
        "title": add_typo(topic),
        "content": add_typo(content),
        "category": category,
    }


def generate_comment() -> str:
    """댓글 내용 생성"""
    template = random.choice(COMMENT_TEMPLATES)
    return add_typo(template.format(exc=random.choice(EXCLAMATIONS)))


class SeedDataRequest(BaseModel):
    count: int = 100
    with_comments: bool = True
    with_likes: bool = True


class AutoGenerationRequest(BaseModel):
    enabled: bool = True
    interval_minutes: int = 30  # 30분마다
    posts_per_interval: int = 3  # 3개씩


@router.post("/community/seed")
async def generate_seed_data(
    request: SeedDataRequest,
    admin: dict = Depends(require_admin)
):
    """커뮤니티 시드 데이터 생성 (admin only)"""
    from database.community_db import get_supabase, create_post, create_post_comment

    supabase = get_supabase()
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase not configured")

    if request.count > 1000:
        raise HTTPException(status_code=400, detail="Maximum 1000 posts at a time")

    categories = ["free", "tip", "question", "success"]
    weights = [0.4, 0.3, 0.2, 0.1]
    created_posts = 0
    created_comments = 0
    start_user_id = 1000

    try:
        for i in range(request.count):
            category = random.choices(categories, weights=weights)[0]
            post = generate_post_content(category)
            user_id = start_user_id + random.randint(0, 500)

            # 랜덤 시간 (최근 30일 내)
            days_ago = random.randint(0, 30)
            hours_ago = random.randint(0, 23)
            created_at = (datetime.now() - timedelta(days=days_ago, hours=hours_ago)).isoformat()

            # 게시글 생성
            response = supabase.table("posts").insert({
                "user_id": user_id,
                "title": post["title"],
                "content": post["content"],
                "category": post["category"],
                "tags": [],
                "views": random.randint(10, 1000),
                "likes": random.randint(0, 50),
                "comments_count": 0,
                "created_at": created_at,
            }).execute()

            if response.data:
                created_posts += 1
                post_id = response.data[0]["id"]

                # 댓글 생성
                if request.with_comments:
                    num_comments = random.randint(0, 6)
                    for _ in range(num_comments):
                        comment_user = start_user_id + random.randint(0, 500)
                        comment_created = (datetime.now() - timedelta(days=random.randint(0, 7), hours=random.randint(0, 23))).isoformat()
                        try:
                            supabase.table("post_comments").insert({
                                "post_id": post_id,
                                "user_id": comment_user,
                                "content": generate_comment(),
                                "created_at": comment_created,
                            }).execute()
                            created_comments += 1
                        except:
                            pass

                    # comments_count 업데이트
                    if num_comments > 0:
                        supabase.table("posts").update({"comments_count": num_comments}).eq("id", post_id).execute()

            # API 부하 방지
            if (i + 1) % 50 == 0:
                await asyncio.sleep(0.5)

        logger.info(f"Admin {admin['email']} generated {created_posts} posts and {created_comments} comments")

        return {
            "success": True,
            "posts_created": created_posts,
            "comments_created": created_comments,
            "message": f"{created_posts}개 게시글, {created_comments}개 댓글 생성 완료"
        }

    except Exception as e:
        logger.error(f"Seed data generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def auto_generate_posts_task(interval_minutes: int, posts_per_interval: int):
    """백그라운드에서 자동으로 게시글 생성"""
    global _auto_generation_running
    from database.community_db import get_supabase

    while _auto_generation_running:
        try:
            supabase = get_supabase()
            if not supabase:
                logger.warning("Auto generation: Supabase not available")
                await asyncio.sleep(60)
                continue

            categories = ["free", "tip", "question", "success"]
            weights = [0.4, 0.3, 0.2, 0.1]
            start_user_id = 1000

            for _ in range(posts_per_interval):
                category = random.choices(categories, weights=weights)[0]
                post = generate_post_content(category)
                user_id = start_user_id + random.randint(0, 500)

                # 최근 몇 시간 내 생성된 것처럼
                hours_ago = random.randint(0, 3)
                created_at = (datetime.now() - timedelta(hours=hours_ago, minutes=random.randint(0, 59))).isoformat()

                response = supabase.table("posts").insert({
                    "user_id": user_id,
                    "title": post["title"],
                    "content": post["content"],
                    "category": post["category"],
                    "tags": [],
                    "views": random.randint(5, 100),
                    "likes": random.randint(0, 10),
                    "comments_count": 0,
                    "created_at": created_at,
                }).execute()

                if response.data:
                    post_id = response.data[0]["id"]
                    # 댓글 1-2개 추가
                    num_comments = random.randint(0, 2)
                    for _ in range(num_comments):
                        comment_user = start_user_id + random.randint(0, 500)
                        try:
                            supabase.table("post_comments").insert({
                                "post_id": post_id,
                                "user_id": comment_user,
                                "content": generate_comment(),
                            }).execute()
                        except:
                            pass

                    if num_comments > 0:
                        supabase.table("posts").update({"comments_count": num_comments}).eq("id", post_id).execute()

                await asyncio.sleep(random.randint(1, 5))  # 각 게시글 간 랜덤 딜레이

            logger.info(f"Auto generated {posts_per_interval} posts")

        except Exception as e:
            logger.error(f"Auto generation error: {e}")

        # 다음 실행까지 대기 (약간의 랜덤성 추가)
        wait_time = interval_minutes * 60 + random.randint(-120, 120)
        await asyncio.sleep(max(60, wait_time))


@router.post("/community/auto-generate")
async def toggle_auto_generation(
    request: AutoGenerationRequest,
    admin: dict = Depends(require_admin)
):
    """자동 게시글 생성 토글 (admin only)"""
    global _auto_generation_task, _auto_generation_running

    if request.enabled:
        if _auto_generation_running:
            return {"message": "Auto generation is already running", "status": "running"}

        _auto_generation_running = True
        _auto_generation_task = asyncio.create_task(
            auto_generate_posts_task(request.interval_minutes, request.posts_per_interval)
        )
        logger.info(f"Admin {admin['email']} enabled auto generation: {request.posts_per_interval} posts every {request.interval_minutes} min")

        return {
            "success": True,
            "status": "started",
            "message": f"자동 생성 시작: {request.interval_minutes}분마다 {request.posts_per_interval}개 게시글",
            "interval_minutes": request.interval_minutes,
            "posts_per_interval": request.posts_per_interval
        }
    else:
        _auto_generation_running = False
        if _auto_generation_task:
            _auto_generation_task.cancel()
            _auto_generation_task = None

        logger.info(f"Admin {admin['email']} disabled auto generation")

        return {
            "success": True,
            "status": "stopped",
            "message": "자동 생성 중지됨"
        }


@router.get("/community/auto-generate/status")
async def get_auto_generation_status(admin: dict = Depends(require_admin)):
    """자동 생성 상태 확인 (admin only)"""
    global _auto_generation_running

    return {
        "running": _auto_generation_running,
        "status": "running" if _auto_generation_running else "stopped"
    }


# ============ Dynamic User Routes (must be at the end to avoid route conflicts) ============

@router.get("/users/{user_id}")
async def get_user_by_id(
    user_id: int,
    admin: dict = Depends(require_admin)
):
    """Get user detail by ID (admin only) - must be defined after all /users/* routes"""
    user_db = get_user_db()
    user = user_db.get_user_by_id(user_id)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Remove password hash
    user.pop('hashed_password', None)
    return user
