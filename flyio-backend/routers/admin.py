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


# ============ Database Backup & Restore ============

@router.post("/restore-from-backup")
async def restore_database_from_backup(backup_filename: str = "backup_20260205_100515.db"):
    """
    백업 파일에서 데이터베이스 복구 (관리자 없을 때만 작동)
    보안: 기존 관리자가 있으면 require_admin 필요
    """
    import shutil
    import os

    backup_dir = "/data/backups"
    backup_path = os.path.join(backup_dir, backup_filename)
    db_path = "/data/blog_analyzer.db"

    # 백업 파일 존재 확인
    if not os.path.exists(backup_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"백업 파일을 찾을 수 없습니다: {backup_filename}"
        )

    # 현재 관리자 확인 (관리자 있으면 차단)
    user_db = get_user_db()
    with user_db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM users WHERE is_admin = 1")
        admin_count = cursor.fetchone()[0]

        if admin_count > 0:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="관리자가 이미 존재합니다. SSH에서 직접 복구하세요."
            )

    try:
        # 현재 DB 임시 백업
        temp_backup = db_path + ".temp_before_restore"
        if os.path.exists(db_path):
            shutil.copy2(db_path, temp_backup)

        # 백업에서 복구
        shutil.copy2(backup_path, db_path)

        # 복구된 DB에서 사용자 수 확인
        with user_db.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM users")
            user_count = cursor.fetchone()[0]
            cursor.execute("SELECT COUNT(*) FROM users WHERE is_admin = 1")
            admin_count = cursor.fetchone()[0]

        logger.info(f"Database restored from {backup_filename}: {user_count} users, {admin_count} admins")

        return {
            "message": f"데이터베이스 복구 완료: {backup_filename}",
            "user_count": user_count,
            "admin_count": admin_count
        }

    except Exception as e:
        # 복구 실패 시 원래 DB 복원
        if os.path.exists(temp_backup):
            shutil.copy2(temp_backup, db_path)
        logger.error(f"Database restore failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"데이터베이스 복구 실패: {str(e)}"
        )


@router.get("/list-backups")
async def list_backup_files():
    """백업 파일 목록 조회"""
    import os

    backup_dir = "/data/backups"

    if not os.path.exists(backup_dir):
        return {"backups": [], "message": "백업 디렉토리가 없습니다"}

    backups = []
    for f in os.listdir(backup_dir):
        if f.endswith('.db'):
            path = os.path.join(backup_dir, f)
            stat = os.stat(path)
            backups.append({
                "filename": f,
                "size_mb": round(stat.st_size / 1024 / 1024, 2),
                "modified": stat.st_mtime
            })

    # 최신순 정렬
    backups.sort(key=lambda x: x['modified'], reverse=True)

    return {"backups": backups}


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


# ============ Community Auto Generation ============

import asyncio
import random
from datetime import datetime, timedelta

# 자동 생성 상태
_auto_gen_task = None
_auto_gen_running = False

# 한국 인터넷 감탄사/이모티콘
REACTIONS = [
    "ㅋㅋㅋ", "ㅋㅋㅋㅋ", "ㅋㅋㅋㅋㅋ", "ㅋㅋㅋㅋㅋㅋ", "ㅎㅎ", "ㅎㅎㅎ", "ㅎㅎㅎㅎ",
    "ㅠㅠ", "ㅜㅜ", "ㅠㅜ", "ㅜㅠ", "ㅠㅠㅠ", "ㅜㅜㅜ", "ㅡㅡ", "ㅡ.ㅡ", ";;", ";;;",
    "ㄷㄷ", "ㄷㄷㄷ", "ㄱㄱ", "ㄴㄴ", "ㅇㅇ", "ㅇㅋ", "ㄹㅇ", "ㅇㅈ", "ㄱㅇㄷ",
    "헐", "헐ㅋㅋ", "대박", "미쳤다", "실화냐", "실화임?", "레전드", "ㄹㅇㅋㅋ",
    "와", "오", "우와", "와씨", "아니", "진짜", "마자", "맞아", "인정", "ㅇㅈ요",
    "ㄱㅅ", "ㄳ", "ㄱㅅㄱㅅ", "고마워", "땡큐", "ㅊㅋ", "ㅊㅊ", "축하",
]

# 비속어/욕설 (가벼운 수준)
SLANG = [
    "ㅅㅂ", "ㅆㅂ", "시발", "씨발", "ㅂㅅ", "병신", "ㅈㄹ", "지랄",
    "ㄷㅊ", "닥쳐", "꺼져", "미친", "ㅁㅊ", "또라이", "븅신", "ㅄ",
    "ㅈㄴ", "존나", "개", "개같은", "개빡", "빡치네", "열받네", "짜증",
    "뭔씹", "ㅁㅊㄴ", "아씨", "에휴", "하아", "후",
]

# 줄임말
ABBREVIATIONS = {
    "블로그": ["블로", "블", "블ㄹ"],
    "상위노출": ["상놀", "상위", "상노"],
    "키워드": ["키워", "키웓", "ㅋㅇㄷ"],
    "조회수": ["조회", "조수"],
    "방문자": ["방문", "방자"],
    "최적화": ["최적", "최ㅈㅎ"],
    "검색": ["검색", "ㄱㅅ"],
    "수익": ["수익", "수이"],
    "체험단": ["체단", "체험"],
    "협찬": ["협찬", "협"],
    "애드포스트": ["애포", "애드포"],
    "인플루언서": ["인플", "인플루"],
    "리뷰": ["리뷰", "ㄹㅂ"],
    "포스팅": ["포스팅", "포팅", "글"],
}

# 글 주제별 템플릿
TOPIC_TEMPLATES = {
    "tip": [
        "{reaction} 블로그 {months}개월차인데 드디어 상놀 성공함\n\n{tip1}\n{tip2}\n{tip3}\n\n이거 {reaction} 진짜 효과 봄 ㄹㅇ",
        "야 {slang} 이거 꿀팁인데 {reaction}\n\n{tip1} 하면 바로 {result}\n\n나만 알고 싶은데 공유함 {reaction}",
        "{months}개월 삽질하다가 깨달은거\n\n{tip1}\n{tip2}\n\n이거 안하면 {slang} 시간낭비임 {reaction}",
        "상놀 비법 알려줄까? {reaction}\n\n{tip1}\n\n근데 {slang} 귀찮아서 맨날 안함 ㅋㅋㅋ",
        "오늘 터진거 공유 {reaction}\n\n{keyword} 키워드로 {rank}위 찍음\n\n비결: {tip1}\n\n{feeling}",
    ],
    "question": [
        "아 {slang} 블로그 왜이러냐 {reaction}\n\n{problem}\n\n이거 나만 그런거? 도와줘 {reaction}",
        "질문있는데요 {reaction}\n\n{problem}\n\n아시는분 알려주세요 제발 {slang}",
        "ㅠㅠ 누가 좀 도와줘\n\n블로그 {months}개월찬데 {problem}\n\n진짜 답답해 {slang}",
        "이거 정상임?\n\n{problem}\n\n뭐가 문젠지 모르겠음 {reaction}",
        "선배님들 질문요 ㅠㅠ\n\n{problem}\n\n구글링해도 안나옴 {slang}",
    ],
    "free": [
        "오늘 블로그 현황 {reaction}\n\n글 {posts}개 / 방문자 {visitors}명\n\n{feeling}",
        "{reaction} 그냥 잡담인데\n\n{chat}\n\n블로그하는 사람 여기 있음? {reaction}",
        "아 {slang} 오늘 글 {posts}개 썼다\n\n{feeling}\n\n다들 화이팅 {reaction}",
        "ㅎㅇ 심심해서 왔음 {reaction}\n\n{chat}\n\n블로그 하기 싫다 {slang}",
        "일기장 대신 씀 {reaction}\n\n{chat}\n\n읽어줘서 고마움 ㅋㅋ",
    ],
    "success": [
        "드디어 {result} {reaction}{reaction}{reaction}\n\n{months}개월 걸림\n\n{tip1} 했더니 됨\n\n{slang} 감격 {reaction}",
        "와 {reaction} 터졌다\n\n{keyword} {rank}위 달성!!\n\n{feeling}\n\n포기 안하길 잘했다 {reaction}",
        "성공 인증 {reaction}\n\n드디어 {result}\n\n비결은 {tip1}\n\n{slang} 눈물남",
        "ㅋㅋㅋ 방금 확인했는데 {result}\n\n{feeling}\n\n이맛에 블로그 함 {reaction}",
        "야 {slang} 드디어 해냈다 {reaction}\n\n{result}\n\n{months}개월 삽질 끝 ㅠㅠ",
    ],
    "promo": [
        "서이추 환영 {reaction}\n\n{months}개월차 블로거입니다\n\n맞팔해요~ {reaction}",
        "이웃 구해요!\n\n{niche} 관심있는 분 환영\n\n소통해요 {reaction}",
        "제 블로그 한번 봐주세요 ㅠㅠ\n\n{niche} 주제로 글 쓰고 있어요\n\n피드백 부탁드려요 {reaction}",
        "맞팔 구함 {reaction}\n\n활동 열심히 하는 편이에요\n\n소통 원해요~",
        "이웃 신청 받아요!\n\n{niche} 블로그 운영중\n\n같이 성장해요 {reaction}",
    ],
    "rant": [
        "아 {slang} 진짜 빡치네\n\n{complaint}\n\n블로그 접을까 {reaction}",
        "열받아서 씀 {slang}\n\n{complaint}\n\n이해하는 사람? {reaction}",
        "오늘 {slang} 최악이었음\n\n{complaint}\n\n위로해줘 ㅠㅠ",
        "ㅋㅋㅋ 웃겨서 씀\n\n{complaint}\n\n{slang} 어이없네 진짜",
        "{slang} 왜이러냐고\n\n{complaint}\n\n나만 이런거 아니지? {reaction}",
    ],
}

# 문제 상황
PROBLEMS = [
    "갑자기 방문자 반토막남", "저품질 걸린것 같음", "상위노출 안됨",
    "글이 검색에 안잡힘", "C-Rank가 안오름", "이웃이 안늘어",
    "댓글이 하나도 없음", "조회수가 0임", "글쓰기가 너무 어려움",
    "키워드 선정을 못하겠음", "사진 편집 ㅈㄴ 귀찮음", "매일 쓰기 힘듬",
    "뭘 써야할지 모르겠음", "경쟁 너무 치열함", "수익이 0원임",
]

# 팁
TIPS = [
    "매일 1포스팅 필수", "키워드 3개 이상 넣기", "2000자 이상 쓰기",
    "이미지 10장 이상", "이웃 소통 열심히", "댓글 답글 필수",
    "시리즈로 연재하기", "롱테일 키워드 공략", "경쟁 낮은거 찾기",
    "아침에 발행하기", "제목에 키워드 넣기", "본문에 키워드 자연스럽게",
    "카테고리 정리하기", "태그 잘 달기", "썸네일 신경쓰기",
]

# 결과
RESULTS = [
    "상놀 성공", "방문자 2배 증가", "이웃 100명 돌파", "첫 협찬 받음",
    "애드포스트 승인", "월수익 10만원", "일방문 1000명", "C-Rank 상승",
    "인플루언서 달성", "체험단 당첨", "첫 원고료", "브랜드 협업",
]

# 감정
FEELINGS = [
    "기분 좋다 ㅎㅎ", "뿌듯하네", "힘든데 해볼만함", "아직 갈길이 멀다",
    "오늘도 화이팅", "포기하고 싶다", "의욕 없음", "동기부여 필요",
    "보람차다", "재밌다 ㅋㅋ", "지친다", "힘들다 ㅠㅠ",
]

# 잡담
CHATS = [
    "오늘 날씨 좋네", "점심 뭐먹지", "졸리다", "일하기 싫다",
    "블로그나 할까", "유튜브 보다가 옴", "심심해", "할거 없다",
    "커피 마시는 중", "퇴근하고 싶다", "주말이 기다려짐", "피곤하다",
]

# 불만
COMPLAINTS = [
    "네이버 알고리즘 ㅈ같음", "저품질 기준이 뭐냐", "왜 상놀이 안되냐",
    "이웃이 다 잠수탐", "댓글 아무도 안달아줌", "조회수 왜이리 낮냐",
    "경쟁자가 너무 많음", "글쓰기 너무 힘듬", "시간이 부족함",
    "돈이 안됨", "수익화가 어려움", "체험단 계속 떨어짐",
]

# 니치/분야
NICHES = [
    "맛집", "여행", "육아", "재테크", "다이어트", "뷰티", "패션",
    "인테리어", "자기계발", "IT/테크", "게임", "영화/드라마", "독서",
    "요리", "운동", "반려동물", "취미생활", "일상",
]

# 키워드
KEYWORDS = [
    "서울 맛집", "강남 카페", "홍대 데이트", "제주도 여행", "다이어트 식단",
    "주식 투자", "부동산", "육아 일기", "신생아 용품", "노트북 추천",
    "아이폰 케이스", "갤럭시 비교", "넷플릭스 추천", "운동 루틴", "홈트레이닝",
]


def generate_realistic_post():
    """실제 한국 인터넷 커뮤니티 스타일의 글 생성"""
    categories = ["tip", "question", "free", "success", "promo", "rant"]
    weights = [0.25, 0.2, 0.25, 0.1, 0.1, 0.1]
    category = random.choices(categories, weights=weights)[0]

    # 카테고리 매핑 (DB용)
    db_category = {
        "tip": "tip",
        "question": "question",
        "success": "success",
        "promo": "free",
        "rant": "free",
        "free": "free",
    }.get(category, "free")

    template = random.choice(TOPIC_TEMPLATES[category])

    # 템플릿 변수 채우기
    content = template.format(
        reaction=random.choice(REACTIONS),
        slang=random.choice(SLANG) if random.random() < 0.4 else random.choice(REACTIONS),
        months=random.randint(1, 36),
        tip1=random.choice(TIPS),
        tip2=random.choice(TIPS),
        tip3=random.choice(TIPS),
        result=random.choice(RESULTS),
        problem=random.choice(PROBLEMS),
        feeling=random.choice(FEELINGS),
        chat=random.choice(CHATS),
        complaint=random.choice(COMPLAINTS),
        niche=random.choice(NICHES),
        keyword=random.choice(KEYWORDS),
        rank=random.randint(1, 10),
        posts=random.randint(10, 500),
        visitors=random.randint(50, 5000),
    )

    # 제목 생성
    title_templates = {
        "tip": [
            "상놀 꿀팁 공유 {r}", "이거 모르면 손해 {r}", "{m}개월차 노하우",
            "드디어 깨달음 {r}", "팁 공유합니다", "효과 봤던 방법",
        ],
        "question": [
            "이거 왜이럼? {r}", "도와주세요 ㅠㅠ", "질문있어요",
            "아시는분? {r}", "이거 정상임?", "뭐가 문젠지 모르겠음",
        ],
        "free": [
            "오늘 일상 {r}", "그냥 잡담 {r}", "심심해서 씀",
            "하이 {r}", "일기장", "블로그 현황",
        ],
        "success": [
            "성공했다 {r}{r}", "드디어!!! {r}", "인증합니다",
            "해냈다 {r}", "터졌다 {r}", "감격 ㅠㅠ",
        ],
        "promo": [
            "서이추해요~", "맞팔 구합니다", "이웃 구해요",
            "소통해요 {r}", "이웃신청 받아요", "같이 성장해요",
        ],
        "rant": [
            "열받아서 씀", "빡치네 진짜", "왜이러냐고",
            "이해 안됨", "어이없다 {r}", "진짜 ㅋㅋㅋ",
        ],
    }

    title_template = random.choice(title_templates[category])
    title = title_template.format(
        r=random.choice(REACTIONS),
        m=random.randint(1, 24),
    )

    # 랜덤하게 오타/줄임말 적용
    if random.random() < 0.3:
        for word, abbrs in ABBREVIATIONS.items():
            if word in content and random.random() < 0.5:
                content = content.replace(word, random.choice(abbrs), 1)

    return {
        "title": title[:100],
        "content": content,
        "category": db_category,
    }


def generate_realistic_comment():
    """실제 한국 인터넷 스타일의 댓글 생성"""
    templates = [
        "{r} 저도 해봐야겠어요", "오 대박 {r}", "이거 진짜 꿀팁 {r}",
        "감사합니다 {r}", "저도 비슷한 경험 ㅋㅋ", "인정 {r}",
        "굳굳", "좋은 정보 {r}", "저장 {r}", "화이팅 {r}",
        "응원해요~", "좋은 글 감사해요", "저도 궁금했는데 {r}",
        "공감 {r}", "저도요 ㅠㅠ", "힘내세요!", "대박 {r}",
        "{r}", "{r}{r}", "ㅇㅈ", "ㄹㅇ", "굳", "ㄱㅅ", "ㅊㅊ",
        "오오", "와", "헐", "실화?", "대박ㅋㅋ",
        "{s} 진짜?", "이거 {s} 대박인데", "{r} 나도 해봐야지",
        "저 이거 해봤는데 {r}", "효과 있던데요 {r}", "추천 {r}",
    ]

    template = random.choice(templates)
    comment = template.format(
        r=random.choice(REACTIONS),
        s=random.choice(SLANG) if random.random() < 0.2 else random.choice(REACTIONS),
    )

    return comment


class AutoGenRequest(BaseModel):
    enabled: bool = True
    posts_per_hour: int = 10
    include_comments: bool = True


async def auto_generate_content_task(posts_per_hour: int, include_comments: bool):
    """백그라운드 자동 글 생성 태스크 (Supabase 우선, SQLite fallback)"""
    global _auto_gen_running

    # community_db 사용 (Supabase 또는 SQLite)
    from database.community_db import create_post, create_post_comment, USE_SUPABASE

    # 시간당 글 수 -> 분당 간격 계산
    interval_seconds = 3600 / posts_per_hour
    storage_type = "Supabase" if USE_SUPABASE else "SQLite"

    logger.info(f"Auto generation started: {posts_per_hour} posts/hour, interval: {interval_seconds:.1f}s, storage: {storage_type}")

    while _auto_gen_running:
        try:
            # 글 생성
            post_data = generate_realistic_post()
            user_id = 1000 + random.randint(0, 9999)

            # SQLite에 저장
            post_id = create_post(
                user_id=user_id,
                title=post_data["title"],
                content=post_data["content"],
                category=post_data["category"],
                tags=[]
            )

            if post_id:
                logger.info(f"Auto generated post {post_id}: {post_data['title'][:30]}...")

                # 댓글 생성
                if include_comments:
                    num_comments = random.choices([0, 1, 2, 3, 4, 5], weights=[0.3, 0.25, 0.2, 0.15, 0.07, 0.03])[0]

                    for _ in range(num_comments):
                        comment_user = 1000 + random.randint(0, 9999)
                        try:
                            create_post_comment(
                                post_id=post_id,
                                user_id=comment_user,
                                content=generate_realistic_comment()
                            )
                        except Exception as ce:
                            logger.debug(f"Comment creation error: {ce}")

            # 랜덤 지연 추가 (자연스러운 간격)
            jitter = random.uniform(0.5, 1.5)
            await asyncio.sleep(interval_seconds * jitter)

        except Exception as e:
            logger.error(f"Auto generation error: {e}")
            await asyncio.sleep(60)  # 에러 시 1분 대기


@router.post("/community/auto-generate")
async def toggle_auto_generation(
    request: AutoGenRequest,
    admin: dict = Depends(require_admin)
):
    """커뮤니티 자동 글 생성 토글"""
    global _auto_gen_task, _auto_gen_running

    if request.enabled:
        if _auto_gen_running:
            return {"message": "이미 실행 중입니다", "status": "running"}

        _auto_gen_running = True
        _auto_gen_task = asyncio.create_task(
            auto_generate_content_task(request.posts_per_hour, request.include_comments)
        )

        logger.info(f"Admin {admin['email']} started auto generation: {request.posts_per_hour} posts/hour")

        return {
            "success": True,
            "status": "started",
            "message": f"자동 생성 시작: 시간당 {request.posts_per_hour}개 글",
            "posts_per_hour": request.posts_per_hour,
        }
    else:
        _auto_gen_running = False
        if _auto_gen_task:
            _auto_gen_task.cancel()
            _auto_gen_task = None

        logger.info(f"Admin {admin['email']} stopped auto generation")

        return {
            "success": True,
            "status": "stopped",
            "message": "자동 생성 중지됨",
        }


@router.get("/community/auto-generate/status")
async def get_auto_generation_status(admin: dict = Depends(require_admin)):
    """자동 생성 상태 확인"""
    return {
        "running": _auto_gen_running,
        "status": "running" if _auto_gen_running else "stopped",
    }


@router.post("/community/generate-batch")
async def generate_batch_posts(
    count: int = 100,
    admin: dict = Depends(require_admin)
):
    """일괄 게시글 생성 (최대 500개) - Supabase 우선, SQLite fallback"""
    if count > 500:
        raise HTTPException(status_code=400, detail="최대 500개까지 생성 가능")

    from database.community_db import USE_SUPABASE, supabase, get_db_connection
    import json

    created = 0
    comments_created = 0

    # Supabase 사용
    if USE_SUPABASE and supabase:
        logger.info(f"Generating {count} posts using Supabase...")

        for i in range(count):
            try:
                post_data = generate_realistic_post()
                user_id = 1000 + random.randint(0, 9999)

                # 랜덤 시간 (최근 7일 내)
                days_ago = random.randint(0, 7)
                hours_ago = random.randint(0, 23)
                created_at = (datetime.now() - timedelta(days=days_ago, hours=hours_ago)).isoformat()

                response = supabase.table("posts").insert({
                    "user_id": user_id,
                    "user_name": f"블로거{user_id % 10000:04d}",
                    "title": post_data["title"],
                    "content": post_data["content"],
                    "category": post_data["category"],
                    "tags": [],
                    "views": random.randint(10, 500),
                    "likes": random.randint(0, 30),
                    "comments_count": 0,
                    "created_at": created_at,
                }).execute()

                if response.data:
                    created += 1
                    post_id = response.data[0]["id"]

                    # 댓글 추가
                    num_comments = random.randint(0, 5)
                    for _ in range(num_comments):
                        try:
                            comment_user_id = 1000 + random.randint(0, 9999)
                            supabase.table("post_comments").insert({
                                "post_id": post_id,
                                "user_id": comment_user_id,
                                "user_name": f"블로거{comment_user_id % 10000:04d}",
                                "content": generate_realistic_comment(),
                                "created_at": created_at,
                            }).execute()
                            comments_created += 1
                        except Exception as ce:
                            logger.debug(f"Comment error: {ce}")

                    if num_comments > 0:
                        supabase.table("posts").update({"comments_count": num_comments}).eq("id", post_id).execute()

            except Exception as e:
                logger.error(f"Supabase batch error: {e}")

            # 진행상황 로깅
            if (i + 1) % 50 == 0:
                logger.info(f"Generated {i + 1}/{count} posts (Supabase)...")
                await asyncio.sleep(1)  # Rate limiting

    else:
        # SQLite fallback
        logger.info(f"Generating {count} posts using SQLite (fallback)...")
        conn = get_db_connection()
        cursor = conn.cursor()

        try:
            for i in range(count):
                try:
                    post_data = generate_realistic_post()
                    user_id = 1000 + random.randint(0, 9999)

                    days_ago = random.randint(0, 7)
                    hours_ago = random.randint(0, 23)
                    created_at = (datetime.now() - timedelta(days=days_ago, hours=hours_ago)).isoformat()

                    cursor.execute("""
                        INSERT INTO posts (user_id, user_name, title, content, category, tags, views, likes, comments_count, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        user_id,
                        f"블로거{user_id % 10000:04d}",
                        post_data["title"],
                        post_data["content"],
                        post_data["category"],
                        json.dumps([]),
                        random.randint(10, 500),
                        random.randint(0, 30),
                        0,
                        created_at,
                    ))

                    post_id = cursor.lastrowid
                    created += 1

                    num_comments = random.randint(0, 5)
                    for _ in range(num_comments):
                        try:
                            comment_user_id = 1000 + random.randint(0, 9999)
                            cursor.execute("""
                                INSERT INTO post_comments (post_id, user_id, user_name, content, created_at)
                                VALUES (?, ?, ?, ?, ?)
                            """, (post_id, comment_user_id, f"블로거{comment_user_id % 10000:04d}", generate_realistic_comment(), created_at))
                            comments_created += 1
                        except Exception as ce:
                            logger.error(f"Comment error: {ce}")

                    if num_comments > 0:
                        cursor.execute("UPDATE posts SET comments_count = ? WHERE id = ?", (num_comments, post_id))

                except Exception as e:
                    logger.error(f"SQLite batch error: {e}")

                if (i + 1) % 50 == 0:
                    conn.commit()
                    logger.info(f"Generated {i + 1}/{count} posts (SQLite)...")

            conn.commit()
        finally:
            conn.close()

    logger.info(f"Admin {admin['email']} generated {created} posts, {comments_created} comments")

    return {
        "success": True,
        "posts_created": created,
        "comments_created": comments_created,
        "storage": "supabase" if USE_SUPABASE else "sqlite",
        "message": f"{created}개 글, {comments_created}개 댓글 생성 완료 ({'Supabase' if USE_SUPABASE else 'SQLite'})",
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


# ============ Blog Percentile Management ============

@router.post("/percentile/reset-seed")
async def reset_percentile_seed_data(admin: dict = Depends(require_admin)):
    """백분위 시드 데이터 리셋 (admin only)

    새로운 점수 분포로 시드 데이터를 재생성합니다.
    실제 분석된 블로그 데이터는 유지됩니다.
    """
    from database.blog_percentile_db import get_blog_percentile_db

    try:
        db = get_blog_percentile_db()
        result = db.reset_seed_data()
        return {
            "message": "Seed data reset completed",
            "details": result
        }
    except Exception as e:
        logger.error(f"Failed to reset seed data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/percentile/stats")
async def get_percentile_stats(admin: dict = Depends(require_admin)):
    """백분위 통계 조회 (admin only)"""
    from database.blog_percentile_db import get_blog_percentile_db

    try:
        db = get_blog_percentile_db()
        stats = db.get_stats()

        # 주요 백분위 점수 조회
        percentile_scores = {}
        for p in [50, 75, 90, 95, 99]:
            percentile_scores[f"p{p}"] = db.get_score_for_percentile(p)

        return {
            "stats": stats,
            "percentile_scores": percentile_scores
        }
    except Exception as e:
        logger.error(f"Failed to get percentile stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))
