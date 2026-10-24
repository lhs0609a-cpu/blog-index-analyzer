"""
구독 관리 API 라우터
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import logging

from database.subscription_db import (
    get_user_subscription,
    create_subscription,
    upgrade_subscription,
    cancel_subscription,
    get_today_usage,
    check_usage_limit,
    increment_usage,
    get_payment_history,
    get_extra_credits,
    add_extra_credits,
    use_extra_credit,
    PLAN_LIMITS,
    PlanType
)
from database.user_db import get_user_db
from routers.auth import get_current_user

logger = logging.getLogger(__name__)


def _enforce_owner(user_id: int, current_user: dict) -> None:
    """요청한 user_id 가 토큰 주인(또는 관리자)인지 확인한다.

    예전엔 이 라우터 전체가 인증 없이 user_id 쿼리만 믿었다. 그래서 토큰 없이
    /me?user_id=1 로 **관리자 구독을 읽거나**, /upgrade?user_id=X 로 **결제 없이
    비즈니스 플랜**을 받을 수 있었다(payment.py 가 이미 막은 그 구멍과 동일한 것이
    여기에 그대로 남아 있었다). user_id 는 더 이상 신원이 아니라 조회 대상일 뿐이고,
    신원은 토큰에서만 온다.
    """
    try:
        token_uid = int(current_user.get("id"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="인증이 필요합니다")
    if current_user.get("is_admin"):
        return
    if token_uid != int(user_id):
        raise HTTPException(status_code=403, detail="본인의 구독 정보만 조회·변경할 수 있습니다")


def _require_admin(current_user: dict) -> None:
    """결제 검증 없이 플랜/크레딧을 직접 부여하는 경로는 관리자만 호출할 수 있다.

    일반 사용자의 정상 업그레이드는 payment.py(/api/payment/subscription/complete)가
    토스 결제 DONE·금액을 확인한 뒤 upgrade_subscription 을 부른다. 이 라우터의
    /upgrade·/credits/purchase 는 그 확인이 전혀 없으므로 외부에 열어두면 공짜
    업그레이드가 된다 — 수동 보정용으로 관리자에게만 남긴다.
    """
    if not current_user.get("is_admin"):
        raise HTTPException(
            status_code=403,
            detail="이 경로는 관리자 전용입니다. 결제를 통한 업그레이드는 결제 페이지에서 진행됩니다",
        )


def verify_subscription_ownership(user_id: int, subscription: dict) -> dict:
    """
    구독이 실제 사용자에게 속하는지 확인하고, 고아 구독이면 무료로 리셋

    문제 상황: users 테이블과 subscriptions 테이블이 별도 DB 파일을 사용하므로,
    삭제된 사용자의 구독이 남아있다가 새 사용자에게 할당될 수 있음
    """
    if not subscription:
        return None

    # 사용자가 실제로 존재하는지 확인
    user_db = get_user_db()
    user = user_db.get_user_by_id(user_id)

    if not user:
        # 사용자가 존재하지 않으면 고아 구독 - 무시
        logger.warning(f"Orphaned subscription found for non-existent user_id={user_id}")
        return None

    # 구독의 생성 시간과 사용자의 생성 시간 비교
    # 구독이 사용자보다 먼저 생성되었다면 고아 구독일 가능성 높음
    sub_created = subscription.get("created_at") or subscription.get("started_at")
    user_created = user.get("created_at")

    if sub_created and user_created:
        try:
            from datetime import datetime
            # 문자열을 datetime으로 변환
            if isinstance(sub_created, str):
                sub_dt = datetime.fromisoformat(sub_created.replace('Z', '+00:00').replace('+00:00', ''))
            else:
                sub_dt = sub_created

            if isinstance(user_created, str):
                user_dt = datetime.fromisoformat(user_created.replace('Z', '+00:00').replace('+00:00', ''))
            else:
                user_dt = user_created

            # 구독이 사용자 생성보다 1일 이상 먼저 생성되었고, free가 아니면 고아 구독
            if (user_dt - sub_dt).days > 1 and subscription.get("plan_type") != "free":
                logger.warning(
                    f"Suspicious subscription for user_id={user_id}: "
                    f"subscription created at {sub_created}, user created at {user_created}"
                )
                # 무료로 리셋
                return None
        except Exception as e:
            logger.debug(f"Date comparison failed: {e}")

    return subscription
router = APIRouter()


# ============ Pydantic 모델 ============

class SubscriptionResponse(BaseModel):
    user_id: int
    plan_type: str
    plan_name: str
    billing_cycle: Optional[str]
    status: str
    expires_at: Optional[str]
    plan_limits: dict


class UsageResponse(BaseModel):
    keyword_searches: int
    blog_analyses: int
    limits: dict
    plan_type: str


class UsageLimitCheck(BaseModel):
    allowed: bool
    used: int
    limit: int
    remaining: int
    plan: str


class UpgradeRequest(BaseModel):
    plan_type: str
    billing_cycle: str = "monthly"


class PlanInfo(BaseModel):
    type: str
    name: str
    price_monthly: int
    price_yearly: int
    features: dict


# ============ 플랜 정보 API ============

@router.get("/plans", response_model=List[PlanInfo])
async def get_all_plans():
    """모든 구독 플랜 정보 조회"""
    plans = []
    for plan_type, limits in PLAN_LIMITS.items():
        plans.append({
            "type": plan_type.value,
            "name": limits["name"],
            "price_monthly": limits["price_monthly"],
            "price_yearly": limits["price_yearly"],
            "features": {
                "keyword_search_daily": limits["keyword_search_daily"],
                "blog_analysis_daily": limits["blog_analysis_daily"],
                "search_results_count": limits["search_results_count"],
                "history_days": limits["history_days"],
                "competitor_compare": limits["competitor_compare"],
                "rank_alert": limits["rank_alert"],
                "excel_export": limits["excel_export"],
                "api_access": limits["api_access"],
                "team_members": limits["team_members"],
            }
        })
    return plans


@router.get("/plans/{plan_type}")
async def get_plan_info(plan_type: str):
    """특정 플랜 정보 조회"""
    try:
        plan = PlanType(plan_type)
        limits = PLAN_LIMITS[plan]
        return {
            "type": plan.value,
            "name": limits["name"],
            "price_monthly": limits["price_monthly"],
            "price_yearly": limits["price_yearly"],
            "features": limits
        }
    except ValueError:
        raise HTTPException(status_code=404, detail="플랜을 찾을 수 없습니다")


# ============ 구독 관리 API ============

@router.get("/me")
def get_my_subscription(
    user_id: int = Query(..., description="사용자 ID"),
    current_user: dict = Depends(get_current_user),
):
    """내 구독 정보 조회.

    sync def — FastAPI 가 자동으로 threadpool 에 dispatch.
    cron 이 event loop 점유 중이어도 threadpool worker 가 sqlite 읽고 즉시 응답.
    (async def 였을 때 /usage 45s timeout 폭주 사고 차단)
    """
    _enforce_owner(user_id, current_user)
    # 관리자 체크 - business 플랜으로 반환
    try:
        user_db_inst = get_user_db()
        user = user_db_inst.get_user_by_id(user_id)
        if user and user.get('is_admin'):
            business_limits = PLAN_LIMITS[PlanType.BUSINESS]
            return {
                "user_id": user_id,
                "plan_type": "business",
                "plan_name": "비즈니스 (관리자)",
                "billing_cycle": None,
                "status": "active",
                "started_at": None,
                "expires_at": None,
                "cancelled_at": None,
                "plan_limits": business_limits
            }
    except Exception:
        pass

    subscription = get_user_subscription(user_id)

    # 고아 구독 검증 (삭제된 사용자의 구독이 새 사용자에게 할당되는 문제 방지)
    subscription = verify_subscription_ownership(user_id, subscription)

    if not subscription:
        # 구독이 없거나 고아 구독이면 무료 플랜으로 새로 생성
        subscription = create_subscription(user_id, "free")

    return {
        "user_id": subscription["user_id"],
        "plan_type": subscription["plan_type"],
        "plan_name": PLAN_LIMITS[PlanType(subscription["plan_type"])]["name"],
        "billing_cycle": subscription.get("billing_cycle"),
        "status": subscription["status"],
        "started_at": subscription.get("started_at"),
        "expires_at": subscription.get("expires_at"),
        "cancelled_at": subscription.get("cancelled_at"),
        "plan_limits": subscription["plan_limits"]
    }


@router.post("/upgrade")
async def upgrade_plan(
    request: UpgradeRequest,
    user_id: int = Query(..., description="사용자 ID"),
    current_user: dict = Depends(get_current_user),
):
    """구독 업그레이드 — 관리자 수동 보정용.

    일반 결제 업그레이드는 /api/payment/subscription/complete 가 토스 결제를
    검증한 뒤 처리한다. 이 경로는 결제 확인이 없으므로 관리자만 쓸 수 있다.
    """
    _require_admin(current_user)
    try:
        plan = PlanType(request.plan_type)
    except ValueError:
        raise HTTPException(status_code=400, detail="유효하지 않은 플랜입니다")

    subscription = upgrade_subscription(
        user_id=user_id,
        plan_type=request.plan_type,
        billing_cycle=request.billing_cycle
    )

    logger.info(f"User {user_id} upgraded to {request.plan_type} ({request.billing_cycle})")

    return {
        "success": True,
        "message": f"{PLAN_LIMITS[plan]['name']} 플랜으로 업그레이드되었습니다",
        "subscription": subscription
    }


@router.post("/cancel")
async def cancel_plan(
    user_id: int = Query(..., description="사용자 ID"),
    current_user: dict = Depends(get_current_user),
):
    """구독 취소 (만료일까지 유지)"""
    _enforce_owner(user_id, current_user)
    success = cancel_subscription(user_id)

    if not success:
        raise HTTPException(status_code=404, detail="구독을 찾을 수 없습니다")

    return {
        "success": True,
        "message": "구독이 취소되었습니다. 만료일까지 서비스를 이용하실 수 있습니다."
    }


# ============ 사용량 API ============

@router.get("/usage")
def get_usage(
    user_id: int = Query(..., description="사용자 ID"),
    current_user: dict = Depends(get_current_user),
):
    """오늘 사용량 조회.

    sync def — threadpool dispatch. event loop 무관하게 즉시 응답.
    """
    _enforce_owner(user_id, current_user)
    subscription = get_user_subscription(user_id)

    # 고아 구독 검증
    subscription = verify_subscription_ownership(user_id, subscription)

    if not subscription:
        subscription = create_subscription(user_id, "free")

    usage = get_today_usage(user_id)
    limits = subscription["plan_limits"]

    return {
        "date": usage["date"],
        "keyword_searches": {
            "used": usage["keyword_searches"],
            "limit": limits["keyword_search_daily"],
            "remaining": max(0, limits["keyword_search_daily"] - usage["keyword_searches"])
                if limits["keyword_search_daily"] != -1 else -1
        },
        "blog_analyses": {
            "used": usage["blog_analyses"],
            "limit": limits["blog_analysis_daily"],
            "remaining": max(0, limits["blog_analysis_daily"] - usage["blog_analyses"])
                if limits["blog_analysis_daily"] != -1 else -1
        },
        "plan_type": subscription["plan_type"],
        "plan_name": limits["name"]
    }


@router.get("/usage/check")
def check_limit(
    user_id: int = Query(..., description="사용자 ID"),
    usage_type: str = Query(..., description="사용 유형 (keyword_search, blog_analysis)"),
    current_user: dict = Depends(get_current_user),
):
    """사용량 제한 확인 — sync def → threadpool."""
    _enforce_owner(user_id, current_user)
    if usage_type not in ["keyword_search", "blog_analysis"]:
        raise HTTPException(status_code=400, detail="유효하지 않은 사용 유형입니다")

    result = check_usage_limit(user_id, usage_type)

    if not result["allowed"]:
        plan_limits = PLAN_LIMITS[PlanType(result["plan"])]
        return {
            **result,
            "message": f"일일 {usage_type} 한도에 도달했습니다. (무료: {plan_limits['keyword_search_daily']}회)",
            "upgrade_message": "더 많은 검색을 원하시면 베이직 플랜으로 업그레이드하세요!"
        }

    return result


@router.post("/usage/increment")
async def record_usage(
    user_id: int = Query(..., description="사용자 ID"),
    usage_type: str = Query(..., description="사용 유형 (keyword_search, blog_analysis)"),
    current_user: dict = Depends(get_current_user),
):
    """사용량 기록 (내부용)"""
    _enforce_owner(user_id, current_user)
    if usage_type not in ["keyword_search", "blog_analysis"]:
        raise HTTPException(status_code=400, detail="유효하지 않은 사용 유형입니다")

    # 먼저 제한 확인
    limit_check = check_usage_limit(user_id, usage_type)

    if not limit_check["allowed"]:
        # 추가 크레딧 확인
        credit_type = "keyword" if usage_type == "keyword_search" else "analysis"
        if use_extra_credit(user_id, credit_type):
            return {
                "success": True,
                "used_extra_credit": True,
                "message": "추가 크레딧을 사용했습니다"
            }

        raise HTTPException(
            status_code=429,
            detail={
                "message": "일일 한도에 도달했습니다",
                "limit": limit_check["limit"],
                "used": limit_check["used"],
                "plan": limit_check["plan"]
            }
        )

    usage = increment_usage(user_id, usage_type)
    return {
        "success": True,
        "usage": usage
    }


# ============ 결제 내역 API ============

@router.get("/payments")
async def get_payments(
    user_id: int = Query(..., description="사용자 ID"),
    limit: int = Query(10, description="조회 개수"),
    current_user: dict = Depends(get_current_user),
):
    """결제 내역 조회"""
    _enforce_owner(user_id, current_user)
    payments = get_payment_history(user_id, limit)
    return {
        "payments": payments,
        "count": len(payments)
    }


# ============ 추가 크레딧 API ============

@router.get("/credits")
async def get_credits(
    user_id: int = Query(..., description="사용자 ID"),
    current_user: dict = Depends(get_current_user),
):
    """추가 크레딧 잔여량 조회"""
    _enforce_owner(user_id, current_user)
    credits = get_extra_credits(user_id)
    return {
        "credits": credits
    }


@router.post("/credits/purchase")
async def purchase_credits(
    user_id: int = Query(..., description="사용자 ID"),
    credit_type: str = Query(..., description="크레딧 유형 (keyword, analysis)"),
    amount: int = Query(..., description="구매 수량"),
    current_user: dict = Depends(get_current_user),
):
    """추가 크레딧 지급 — 관리자 수동 보정용(결제 확인은 결제 경로에서).

    /upgrade 와 같은 이유로 관리자 전용이다. 결제 없이 크레딧을 그냥 더해 준다.
    """
    _require_admin(current_user)
    if credit_type not in ["keyword", "analysis"]:
        raise HTTPException(status_code=400, detail="유효하지 않은 크레딧 유형입니다")

    if amount not in [100, 500, 1000]:
        raise HTTPException(status_code=400, detail="유효하지 않은 구매 수량입니다")

    credit = add_extra_credits(user_id, credit_type, amount)

    return {
        "success": True,
        "message": f"{amount}개의 {credit_type} 크레딧이 추가되었습니다",
        "credit": credit
    }
