"""
크로스 플랫폼 예산 재분배 API
- 플랫폼 건강도 분석
- 예산 재분배 계획 생성
- 재분배 적용 및 이력 관리
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
from datetime import datetime
import logging

from routers.auth import get_current_user
from services.cross_platform_budget_service import (
    get_budget_optimizer,
    PlatformPerformance,
    ReallocationStrategy,
    AllocationPriority,
)
from database.ad_optimization_db import (
    save_reallocation_plan,
    get_reallocation_plan,
    get_reallocation_plans,
    apply_reallocation_plan,
    save_reallocation_history,
    get_reallocation_history,
    save_platform_priority,
    get_platform_priorities,
    get_performance_history,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ads/budget", tags=["Budget Reallocation"])


# ============ Request/Response Models ============

class PlatformPerformanceInput(BaseModel):
    """플랫폼 성과 입력"""
    platform_id: str
    platform_name: str
    current_budget: float = Field(ge=0)
    spend: float = Field(ge=0)
    impressions: int = Field(ge=0)
    clicks: int = Field(ge=0)
    conversions: int = Field(ge=0)
    revenue: float = Field(ge=0)


class GeneratePlanRequest(BaseModel):
    """재분배 계획 생성 요청"""
    performances: List[PlatformPerformanceInput]
    total_budget: float = Field(gt=0)
    strategy: str = Field(default="balanced")
    max_change_ratio: float = Field(default=0.3, ge=0.1, le=0.5)
    excluded_platforms: List[str] = Field(default_factory=list)
    locked_budgets: Dict[str, float] = Field(default_factory=dict)


class ApplyPlanRequest(BaseModel):
    """계획 적용 요청"""
    plan_id: str
    notes: Optional[str] = None


class PlatformPriorityRequest(BaseModel):
    """플랫폼 우선순위 설정 요청"""
    platform_id: str
    priority: str = Field(default="medium")
    min_budget: Optional[float] = None
    max_budget: Optional[float] = None
    is_locked: bool = False


class QuickMoveRequest(BaseModel):
    """빠른 예산 이동 요청"""
    source_platform: str
    target_platform: str
    amount: float = Field(gt=0)
    reason: Optional[str] = None


# ============ Endpoints ============

@router.get("/health")
async def get_platform_health(
    current_user: dict = Depends(get_current_user)
):
    """플랫폼 건강도 분석"""
    user_id = current_user.get("id")
    optimizer = get_budget_optimizer()

    # 성과 데이터 조회 (최근 7일)
    performances = await _get_user_performances(user_id)

    if not performances:
        return {
            "success": True,
            "data": {
                "status": "no_data",
                "message": "연동된 플랫폼의 성과 데이터가 없습니다."
            }
        }

    analysis = optimizer.analyze_platform_health(performances)

    return {
        "success": True,
        "data": analysis
    }


@router.get("/recommendation")
async def get_quick_recommendation(
    current_user: dict = Depends(get_current_user)
):
    """빠른 재분배 추천"""
    user_id = current_user.get("id")
    optimizer = get_budget_optimizer()

    performances = await _get_user_performances(user_id)

    if not performances:
        return {
            "success": True,
            "data": {
                "has_recommendation": False,
                "message": "성과 데이터가 없습니다."
            }
        }

    recommendation = optimizer.get_quick_recommendation(performances)

    return {
        "success": True,
        "data": recommendation
    }


@router.post("/plan/generate")
async def generate_plan(
    request: GeneratePlanRequest,
    current_user: dict = Depends(get_current_user)
):
    """예산 재분배 계획 생성"""
    user_id = current_user.get("id")
    optimizer = get_budget_optimizer()

    # 입력 데이터를 PlatformPerformance로 변환
    performances = [
        PlatformPerformance(
            platform_id=p.platform_id,
            platform_name=p.platform_name,
            current_budget=p.current_budget,
            spend=p.spend,
            impressions=p.impressions,
            clicks=p.clicks,
            conversions=p.conversions,
            revenue=p.revenue
        )
        for p in request.performances
    ]

    try:
        strategy = ReallocationStrategy(request.strategy)
    except ValueError:
        strategy = ReallocationStrategy.BALANCED

    constraints = {
        "max_change_ratio": request.max_change_ratio,
        "excluded_platforms": request.excluded_platforms,
        "locked_budgets": request.locked_budgets,
    }

    try:
        plan = optimizer.generate_reallocation_plan(
            user_id=user_id,
            performances=performances,
            total_budget=request.total_budget,
            strategy=strategy,
            constraints=constraints
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # DB에 저장
    reallocations_data = [
        {
            "platform_id": r.platform_id,
            "platform_name": r.platform_name,
            "current_budget": r.current_budget,
            "suggested_budget": r.suggested_budget,
            "change_amount": r.change_amount,
            "change_percent": r.change_percent,
            "reason": r.reason,
            "priority": r.priority.value,
            "expected_impact": r.expected_impact,
        }
        for r in plan.reallocations
    ]

    save_reallocation_plan(
        plan_id=plan.id,
        user_id=user_id,
        strategy=plan.strategy.value,
        total_budget=plan.total_budget,
        reallocations=reallocations_data,
        expected_roas_improvement=plan.expected_roas_improvement,
        expected_cpa_reduction=plan.expected_cpa_reduction,
        expected_conversion_increase=plan.expected_conversion_increase
    )

    return {
        "success": True,
        "data": {
            "plan_id": plan.id,
            "strategy": plan.strategy.value,
            "total_budget": plan.total_budget,
            "reallocations": reallocations_data,
            "expected_improvements": {
                "roas_improvement": round(plan.expected_roas_improvement, 1),
                "cpa_reduction": round(plan.expected_cpa_reduction, 0),
                "conversion_increase": plan.expected_conversion_increase,
            },
            "created_at": plan.created_at.isoformat()
        }
    }


@router.get("/plan/{plan_id}")
async def get_plan(
    plan_id: str,
    current_user: dict = Depends(get_current_user)
):
    """특정 재분배 계획 조회"""
    user_id = current_user.get("id")

    plan = get_reallocation_plan(plan_id, user_id)

    if not plan:
        raise HTTPException(status_code=404, detail="계획을 찾을 수 없습니다.")

    return {
        "success": True,
        "data": plan
    }


@router.get("/plans")
async def get_plans(
    include_applied: bool = True,
    limit: int = 20,
    current_user: dict = Depends(get_current_user)
):
    """재분배 계획 목록 조회"""
    user_id = current_user.get("id")

    plans = get_reallocation_plans(user_id, include_applied, limit)

    return {
        "success": True,
        "data": plans,
        "total": len(plans)
    }


@router.post("/plan/apply")
async def apply_plan(
    request: ApplyPlanRequest,
    current_user: dict = Depends(get_current_user)
):
    """재분배 계획 적용"""
    user_id = current_user.get("id")

    # 계획 조회
    plan = get_reallocation_plan(request.plan_id, user_id)
    if not plan:
        raise HTTPException(status_code=404, detail="계획을 찾을 수 없습니다.")

    if plan.get("is_applied"):
        raise HTTPException(status_code=400, detail="이미 적용된 계획입니다.")

    # 각 재분배 항목에 대해 이력 저장
    reallocations = plan.get("reallocations", [])

    for i, realloc in enumerate(reallocations):
        if realloc.get("change_amount", 0) != 0:
            # 변경이 있는 항목만 이력 저장
            # 증가하는 플랫폼은 다른 플랫폼에서 감소
            if realloc["change_amount"] > 0:
                # 예산이 증가한 경우 - 감소한 플랫폼 찾기
                for other in reallocations:
                    if other["change_amount"] < 0:
                        save_reallocation_history(
                            user_id=user_id,
                            source_platform=other["platform_id"],
                            target_platform=realloc["platform_id"],
                            amount=min(abs(other["change_amount"]), realloc["change_amount"]),
                            source_old_budget=other["current_budget"],
                            source_new_budget=other["suggested_budget"],
                            target_old_budget=realloc["current_budget"],
                            target_new_budget=realloc["suggested_budget"],
                            reason=realloc.get("reason"),
                            plan_id=request.plan_id,
                            status="applied"
                        )
                        break

    # 계획 적용 표시
    result = apply_reallocation_plan(request.plan_id, user_id, request.notes)

    if not result:
        raise HTTPException(status_code=500, detail="계획 적용에 실패했습니다.")

    return {
        "success": True,
        "message": "예산 재분배 계획이 적용되었습니다.",
        "applied_at": datetime.now().isoformat()
    }


@router.post("/quick-move")
async def quick_move_budget(
    request: QuickMoveRequest,
    current_user: dict = Depends(get_current_user)
):
    """빠른 예산 이동"""
    user_id = current_user.get("id")

    # 현재 예산 조회 (실제로는 API에서 가져와야 함)
    # 여기서는 이력만 저장

    history_id = save_reallocation_history(
        user_id=user_id,
        source_platform=request.source_platform,
        target_platform=request.target_platform,
        amount=request.amount,
        source_old_budget=0,  # 실제 값은 API 연동 필요
        source_new_budget=0,
        target_old_budget=0,
        target_new_budget=0,
        reason=request.reason or "빠른 예산 이동",
        status="pending"
    )

    return {
        "success": True,
        "message": f"{request.source_platform}에서 {request.target_platform}으로 {request.amount:,.0f}원 이동 요청됨",
        "history_id": history_id
    }


@router.get("/history")
async def get_history(
    days: int = 30,
    limit: int = 50,
    current_user: dict = Depends(get_current_user)
):
    """재분배 이력 조회"""
    user_id = current_user.get("id")

    history = get_reallocation_history(user_id, days, limit)

    return {
        "success": True,
        "data": history,
        "total": len(history)
    }


# ============ Platform Priorities ============

@router.get("/priorities")
async def get_priorities(
    current_user: dict = Depends(get_current_user)
):
    """플랫폼 우선순위 목록 조회"""
    user_id = current_user.get("id")

    priorities = get_platform_priorities(user_id)

    return {
        "success": True,
        "data": priorities
    }


@router.post("/priorities")
async def set_priority(
    request: PlatformPriorityRequest,
    current_user: dict = Depends(get_current_user)
):
    """플랫폼 우선순위 설정"""
    user_id = current_user.get("id")

    # 유효성 검사
    valid_priorities = ["high", "medium", "low", "exclude"]
    if request.priority not in valid_priorities:
        raise HTTPException(status_code=400, detail=f"유효하지 않은 우선순위: {request.priority}")

    save_platform_priority(
        user_id=user_id,
        platform_id=request.platform_id,
        priority=request.priority,
        min_budget=request.min_budget,
        max_budget=request.max_budget,
        is_locked=request.is_locked
    )

    return {
        "success": True,
        "message": f"{request.platform_id} 우선순위가 {request.priority}로 설정되었습니다."
    }


# ============ Strategies ============

@router.get("/strategies")
async def get_strategies(current_user: dict = Depends(get_current_user)):
    """사용 가능한 재분배 전략 목록"""
    strategies = [
        {
            "id": ReallocationStrategy.MAXIMIZE_ROAS.value,
            "name": "ROAS 최대화",
            "description": "광고 수익률이 높은 플랫폼에 예산 집중",
            "weights": {"roas": 60, "conversions": 20, "cpa": 20},
            "recommended_for": "수익성 중심 비즈니스"
        },
        {
            "id": ReallocationStrategy.MINIMIZE_CPA.value,
            "name": "CPA 최소화",
            "description": "전환당 비용이 낮은 플랫폼에 예산 집중",
            "weights": {"cpa": 60, "conversions": 20, "roas": 20},
            "recommended_for": "리드 생성 캠페인"
        },
        {
            "id": ReallocationStrategy.MAXIMIZE_CONVERSIONS.value,
            "name": "전환 최대화",
            "description": "전환수가 높은 플랫폼에 예산 집중",
            "weights": {"conversions": 50, "roas": 30, "cpa": 20},
            "recommended_for": "성장 단계 비즈니스"
        },
        {
            "id": ReallocationStrategy.BALANCED.value,
            "name": "균형 전략",
            "description": "ROAS, CPA, 전환을 균형있게 고려",
            "weights": {"roas": 35, "cpa": 35, "conversions": 30},
            "recommended_for": "일반적인 상황"
        },
        {
            "id": ReallocationStrategy.CONSERVATIVE.value,
            "name": "보수적 전략",
            "description": "소폭의 예산 조정만 수행",
            "weights": {"roas": 40, "cpa": 30, "conversions": 30},
            "recommended_for": "안정적인 성과 유지"
        },
    ]

    return {
        "success": True,
        "data": strategies
    }


# ============ Helper Functions ============

async def _get_user_performances(user_id: int) -> List[PlatformPerformance]:
    """사용자의 플랫폼 성과 데이터 조회"""
    # 최근 7일 성과 데이터 조회
    performances = []

    # 각 플랫폼별 성과 집계 (실제로는 연동된 플랫폼 조회)
    platform_data = get_performance_history(user_id, days=7)

    if not platform_data:
        return []

    # 플랫폼별로 그룹화
    by_platform: Dict[str, Dict] = {}
    for row in platform_data:
        pid = row.get("platform_id", "unknown")
        if pid not in by_platform:
            by_platform[pid] = {
                "impressions": 0,
                "clicks": 0,
                "cost": 0,
                "conversions": 0,
                "revenue": 0,
            }
        by_platform[pid]["impressions"] += row.get("impressions", 0)
        by_platform[pid]["clicks"] += row.get("clicks", 0)
        by_platform[pid]["cost"] += row.get("cost", 0)
        by_platform[pid]["conversions"] += row.get("conversions", 0)
        by_platform[pid]["revenue"] += row.get("revenue", 0)

    # PlatformPerformance 객체로 변환
    platform_names = {
        "naver": "네이버 광고",
        "google": "구글 광고",
        "meta": "메타 광고",
        "kakao": "카카오 모먼트",
        "coupang": "쿠팡 광고",
    }

    for pid, data in by_platform.items():
        name = platform_names.get(pid, pid)
        # 예산은 비용의 120%로 추정 (실제로는 API 조회 필요)
        estimated_budget = data["cost"] * 1.2 if data["cost"] > 0 else 100000

        performances.append(PlatformPerformance(
            platform_id=pid,
            platform_name=name,
            current_budget=estimated_budget,
            spend=data["cost"],
            impressions=data["impressions"],
            clicks=data["clicks"],
            conversions=data["conversions"],
            revenue=data["revenue"]
        ))

    return performances
