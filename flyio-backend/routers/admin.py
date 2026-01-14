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
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/users/with-usage")
async def get_users_with_usage(
    limit: int = 100,
    offset: int = 0,
    admin: dict = Depends(require_admin)
):
    """Get all users with remaining days and today's usage (admin only)"""
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
