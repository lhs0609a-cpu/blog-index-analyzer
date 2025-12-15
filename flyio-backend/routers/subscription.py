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

logger = logging.getLogger(__name__)
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
async def get_my_subscription(user_id: int = Query(..., description="사용자 ID")):
    """내 구독 정보 조회"""
    subscription = get_user_subscription(user_id)

    if not subscription:
        # 구독이 없으면 무료 플랜으로 자동 생성
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
    user_id: int = Query(..., description="사용자 ID")
):
    """구독 업그레이드 (결제 완료 후 호출)"""
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
async def cancel_plan(user_id: int = Query(..., description="사용자 ID")):
    """구독 취소 (만료일까지 유지)"""
    success = cancel_subscription(user_id)

    if not success:
        raise HTTPException(status_code=404, detail="구독을 찾을 수 없습니다")

    return {
        "success": True,
        "message": "구독이 취소되었습니다. 만료일까지 서비스를 이용하실 수 있습니다."
    }


# ============ 사용량 API ============

@router.get("/usage")
async def get_usage(user_id: int = Query(..., description="사용자 ID")):
    """오늘 사용량 조회"""
    subscription = get_user_subscription(user_id)
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
async def check_limit(
    user_id: int = Query(..., description="사용자 ID"),
    usage_type: str = Query(..., description="사용 유형 (keyword_search, blog_analysis)")
):
    """사용량 제한 확인"""
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
    usage_type: str = Query(..., description="사용 유형 (keyword_search, blog_analysis)")
):
    """사용량 기록 (내부용)"""
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
    limit: int = Query(10, description="조회 개수")
):
    """결제 내역 조회"""
    payments = get_payment_history(user_id, limit)
    return {
        "payments": payments,
        "count": len(payments)
    }


# ============ 추가 크레딧 API ============

@router.get("/credits")
async def get_credits(user_id: int = Query(..., description="사용자 ID")):
    """추가 크레딧 잔여량 조회"""
    credits = get_extra_credits(user_id)
    return {
        "credits": credits
    }


@router.post("/credits/purchase")
async def purchase_credits(
    user_id: int = Query(..., description="사용자 ID"),
    credit_type: str = Query(..., description="크레딧 유형 (keyword, analysis)"),
    amount: int = Query(..., description="구매 수량")
):
    """추가 크레딧 구매 (결제 완료 후 호출)"""
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
