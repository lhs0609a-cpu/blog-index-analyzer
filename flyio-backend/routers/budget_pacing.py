"""
Budget Pacing API Router - 예산 페이싱 최적화 API

일일/월간 예산을 시간대별로 최적화하여 분배하고,
예산 소진 속도를 모니터링합니다.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, date
import logging

from routers.auth_deps import get_user_id_with_fallback
from services.budget_pacing_service import (
    budget_pacing_optimizer,
    PacingStrategy,
    PacingStatus,
    CampaignBudget,
    HourlyBudget
)
from database.ad_optimization_db import (
    get_campaign_budgets,
    save_campaign_budget,
    update_campaign_spend,
    get_hourly_allocations,
    save_hourly_allocation,
    get_pacing_analyses,
    save_pacing_analysis,
    get_pacing_alerts,
    save_pacing_alert,
    resolve_pacing_alert,
    get_pacing_recommendations,
    save_pacing_recommendation,
    apply_pacing_recommendation,
    get_monthly_projections,
    save_monthly_projection
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ads/budget-pacing", tags=["예산페이싱"])


# ============ Request/Response Models ============

class CampaignBudgetRequest(BaseModel):
    campaign_id: str
    campaign_name: str
    platform: str
    daily_budget: float = Field(..., gt=0)
    monthly_budget: float = Field(default=0, ge=0)
    spent_today: float = Field(default=0, ge=0)
    spent_this_month: float = Field(default=0, ge=0)
    pacing_strategy: str = "standard"


class SpendUpdateRequest(BaseModel):
    campaign_id: str
    spent_today: float = Field(..., ge=0)
    spent_this_month: float = Field(default=0, ge=0)


class HourlyAllocationRequest(BaseModel):
    campaign_id: str
    hour: int = Field(..., ge=0, le=23)
    allocated_budget: float = Field(..., ge=0)
    actual_spend: float = Field(default=0, ge=0)
    impressions: int = Field(default=0, ge=0)
    clicks: int = Field(default=0, ge=0)
    conversions: int = Field(default=0, ge=0)


class AnalyzeRequest(BaseModel):
    """분석 요청"""
    campaign_ids: Optional[List[str]] = None  # None이면 전체


class StrategyChangeRequest(BaseModel):
    campaign_id: str
    new_strategy: str = Field(..., description="standard, accelerated, front_loaded, back_loaded, performance, dayparting")


# ============ API Endpoints ============

@router.get("/summary")
async def get_pacing_summary(user_id: int = Depends(get_user_id_with_fallback)):
    """예산 페이싱 전체 요약"""
    try:
        # DB에서 캠페인 목록 가져오기
        db_campaigns = get_campaign_budgets(user_id)

        if not db_campaigns:
            # 샘플 데이터 생성
            sample_campaigns = _generate_sample_campaigns(user_id)
            campaigns = sample_campaigns
        else:
            # DB 데이터를 CampaignBudget 객체로 변환
            campaigns = []
            for c in db_campaigns:
                campaigns.append(CampaignBudget(
                    campaign_id=c['campaign_id'],
                    campaign_name=c['campaign_name'],
                    platform=c['platform'],
                    daily_budget=c['daily_budget'],
                    monthly_budget=c.get('monthly_budget', 0),
                    spent_today=c.get('spent_today', 0),
                    spent_this_month=c.get('spent_this_month', 0),
                    pacing_strategy=PacingStrategy(c.get('pacing_strategy', 'standard'))
                ))

        summary = budget_pacing_optimizer.get_summary(campaigns)

        # 시간대별 예산 소진 현황
        current_hour = datetime.now().hour
        hourly_progress = {
            "current_hour": current_hour,
            "hours_elapsed": current_hour + 1,
            "hours_remaining": 24 - current_hour - 1,
            "expected_progress": ((current_hour + 1) / 24) * 100
        }

        return {
            "success": True,
            "summary": summary,
            "hourly_progress": hourly_progress,
            "strategies": [s.value for s in PacingStrategy],
            "statuses": [s.value for s in PacingStatus]
        }
    except Exception as e:
        logger.error(f"Failed to get pacing summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/campaigns")
async def get_campaigns(
    user_id: int = Depends(get_user_id_with_fallback),
    platform: str = Query(None)
):
    """캠페인 예산 목록 조회"""
    try:
        db_campaigns = get_campaign_budgets(user_id, platform)

        if not db_campaigns:
            # 샘플 데이터 반환
            sample = _generate_sample_campaigns(user_id)
            campaigns = []
            for c in sample:
                analysis = budget_pacing_optimizer.analyze_pacing(c)
                campaigns.append({
                    "campaign_id": c.campaign_id,
                    "campaign_name": c.campaign_name,
                    "platform": c.platform,
                    "daily_budget": c.daily_budget,
                    "monthly_budget": c.monthly_budget,
                    "spent_today": c.spent_today,
                    "spent_this_month": c.spent_this_month,
                    "remaining_today": c.remaining_today,
                    "pacing_strategy": c.pacing_strategy.value,
                    "pacing_status": analysis.pacing_status.value,
                    "budget_utilization": analysis.budget_utilization,
                    "burn_rate_per_hour": analysis.burn_rate_per_hour,
                    "projected_eod_spend": analysis.projected_end_of_day_spend
                })
            return {"success": True, "campaigns": campaigns, "sample_data": True}

        # 실제 데이터 분석
        campaigns = []
        for c in db_campaigns:
            campaign_obj = CampaignBudget(
                campaign_id=c['campaign_id'],
                campaign_name=c['campaign_name'],
                platform=c['platform'],
                daily_budget=c['daily_budget'],
                monthly_budget=c.get('monthly_budget', 0),
                spent_today=c.get('spent_today', 0),
                spent_this_month=c.get('spent_this_month', 0),
                pacing_strategy=PacingStrategy(c.get('pacing_strategy', 'standard'))
            )
            analysis = budget_pacing_optimizer.analyze_pacing(campaign_obj)
            campaigns.append({
                **c,
                "remaining_today": campaign_obj.remaining_today,
                "pacing_status": analysis.pacing_status.value,
                "budget_utilization": analysis.budget_utilization,
                "burn_rate_per_hour": analysis.burn_rate_per_hour,
                "projected_eod_spend": analysis.projected_end_of_day_spend
            })

        return {"success": True, "campaigns": campaigns}
    except Exception as e:
        logger.error(f"Failed to get campaigns: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/campaigns")
async def add_campaign(
    request: CampaignBudgetRequest,
    user_id: int = Depends(get_user_id_with_fallback)
):
    """캠페인 예산 추가/수정"""
    try:
        budget_id = save_campaign_budget(
            user_id=user_id,
            campaign_id=request.campaign_id,
            campaign_name=request.campaign_name,
            platform=request.platform,
            daily_budget=request.daily_budget,
            monthly_budget=request.monthly_budget,
            pacing_strategy=request.pacing_strategy
        )

        return {
            "success": True,
            "budget_id": budget_id,
            "message": "캠페인 예산이 저장되었습니다."
        }
    except Exception as e:
        logger.error(f"Failed to save campaign budget: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/campaigns/update-spend")
async def update_spend(
    request: SpendUpdateRequest,
    user_id: int = Depends(get_user_id_with_fallback)
):
    """캠페인 지출 업데이트"""
    try:
        success = update_campaign_spend(
            user_id=user_id,
            campaign_id=request.campaign_id,
            spent_today=request.spent_today,
            spent_this_month=request.spent_this_month
        )

        return {
            "success": success,
            "message": "지출이 업데이트되었습니다." if success else "업데이트 실패"
        }
    except Exception as e:
        logger.error(f"Failed to update spend: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analysis")
async def get_analysis(
    user_id: int = Depends(get_user_id_with_fallback),
    campaign_id: str = Query(None)
):
    """페이싱 분석 결과 조회"""
    try:
        # DB에서 기존 분석 결과 조회
        analyses = get_pacing_analyses(user_id, campaign_id)

        if not analyses:
            # 실시간 분석 수행
            db_campaigns = get_campaign_budgets(user_id)
            if not db_campaigns:
                sample = _generate_sample_campaigns(user_id)
                campaigns = sample
            else:
                campaigns = [
                    CampaignBudget(
                        campaign_id=c['campaign_id'],
                        campaign_name=c['campaign_name'],
                        platform=c['platform'],
                        daily_budget=c['daily_budget'],
                        monthly_budget=c.get('monthly_budget', 0),
                        spent_today=c.get('spent_today', 0),
                        spent_this_month=c.get('spent_this_month', 0),
                        pacing_strategy=PacingStrategy(c.get('pacing_strategy', 'standard'))
                    )
                    for c in db_campaigns
                ]

            analyses = []
            for c in campaigns:
                analysis = budget_pacing_optimizer.analyze_pacing(c)
                analyses.append({
                    "campaign_id": analysis.campaign_id,
                    "analysis_time": analysis.analysis_time.isoformat(),
                    "current_hour": analysis.current_hour,
                    "hours_elapsed": analysis.hours_elapsed,
                    "hours_remaining": analysis.hours_remaining,
                    "daily_budget": analysis.daily_budget,
                    "spent_so_far": analysis.spent_so_far,
                    "expected_spend": analysis.expected_spend,
                    "actual_vs_expected": analysis.actual_vs_expected,
                    "pacing_status": analysis.pacing_status.value,
                    "burn_rate_per_hour": analysis.burn_rate_per_hour,
                    "projected_eod_spend": analysis.projected_end_of_day_spend,
                    "budget_utilization": analysis.budget_utilization,
                    "recommended_adjustment": analysis.recommended_adjustment,
                    "recommended_hourly_budget": analysis.recommended_hourly_budget,
                    "confidence_score": analysis.confidence_score
                })

        return {"success": True, "analyses": analyses}
    except Exception as e:
        logger.error(f"Failed to get analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze")
async def run_analysis(
    request: AnalyzeRequest,
    user_id: int = Depends(get_user_id_with_fallback)
):
    """페이싱 분석 실행"""
    try:
        db_campaigns = get_campaign_budgets(user_id)

        if not db_campaigns:
            sample = _generate_sample_campaigns(user_id)
            campaigns = sample
        else:
            campaigns = [
                CampaignBudget(
                    campaign_id=c['campaign_id'],
                    campaign_name=c['campaign_name'],
                    platform=c['platform'],
                    daily_budget=c['daily_budget'],
                    monthly_budget=c.get('monthly_budget', 0),
                    spent_today=c.get('spent_today', 0),
                    spent_this_month=c.get('spent_this_month', 0),
                    pacing_strategy=PacingStrategy(c.get('pacing_strategy', 'standard'))
                )
                for c in db_campaigns
            ]

        # 특정 캠페인만 분석
        if request.campaign_ids:
            campaigns = [c for c in campaigns if c.campaign_id in request.campaign_ids]

        analyses = []
        alerts = []
        recommendations = []

        for campaign in campaigns:
            # 분석 실행
            analysis = budget_pacing_optimizer.analyze_pacing(campaign)
            analyses.append({
                "campaign_id": analysis.campaign_id,
                "pacing_status": analysis.pacing_status.value,
                "budget_utilization": analysis.budget_utilization,
                "actual_vs_expected": analysis.actual_vs_expected,
                "projected_eod_spend": analysis.projected_end_of_day_spend,
                "recommended_hourly_budget": analysis.recommended_hourly_budget
            })

            # 분석 결과 저장
            today = date.today().isoformat()
            save_pacing_analysis(
                user_id=user_id,
                campaign_id=campaign.campaign_id,
                analysis_date=today,
                analysis_hour=analysis.current_hour,
                daily_budget=analysis.daily_budget,
                spent_so_far=analysis.spent_so_far,
                expected_spend=analysis.expected_spend,
                actual_vs_expected=analysis.actual_vs_expected,
                pacing_status=analysis.pacing_status.value,
                burn_rate_per_hour=analysis.burn_rate_per_hour,
                projected_eod_spend=analysis.projected_end_of_day_spend,
                budget_utilization=analysis.budget_utilization,
                recommended_adjustment=analysis.recommended_adjustment,
                recommended_hourly_budget=analysis.recommended_hourly_budget,
                confidence_score=analysis.confidence_score
            )

        # 이슈 감지
        detected_alerts = budget_pacing_optimizer.detect_pacing_issues(campaigns)
        for alert in detected_alerts:
            alerts.append({
                "campaign_id": alert.campaign_id,
                "alert_type": alert.alert_type,
                "severity": alert.severity.value,
                "message": alert.message
            })
            # 알림 저장
            save_pacing_alert(
                user_id=user_id,
                campaign_id=alert.campaign_id,
                campaign_name=alert.campaign_name,
                platform=alert.platform,
                alert_type=alert.alert_type,
                severity=alert.severity.value,
                message=alert.message,
                current_value=alert.current_value,
                threshold_value=alert.threshold_value,
                recommended_action=alert.recommended_action
            )

        # 권장사항 생성
        generated_recs = budget_pacing_optimizer.generate_recommendations(campaigns)
        for rec in generated_recs:
            recommendations.append({
                "campaign_id": rec.campaign_id,
                "type": rec.recommendation_type,
                "title": rec.title,
                "priority": rec.priority
            })
            # 권장사항 저장
            save_pacing_recommendation(
                user_id=user_id,
                campaign_id=rec.campaign_id,
                recommendation_type=rec.recommendation_type,
                title=rec.title,
                description=rec.description,
                current_strategy=rec.current_strategy.value,
                recommended_strategy=rec.recommended_strategy.value,
                expected_improvement=rec.expected_improvement,
                priority=rec.priority,
                hourly_adjustments=rec.hourly_adjustments if rec.hourly_adjustments else None
            )

        return {
            "success": True,
            "analyzed_count": len(analyses),
            "analyses": analyses,
            "alerts_count": len(alerts),
            "alerts": alerts,
            "recommendations_count": len(recommendations),
            "recommendations": recommendations
        }
    except Exception as e:
        logger.error(f"Failed to run analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/alerts")
async def get_alerts(
    user_id: int = Depends(get_user_id_with_fallback),
    include_resolved: bool = Query(False)
):
    """페이싱 알림 조회"""
    try:
        alerts = get_pacing_alerts(user_id, include_resolved)
        return {"success": True, "alerts": alerts}
    except Exception as e:
        logger.error(f"Failed to get alerts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/alerts/{alert_id}/resolve")
async def resolve_alert(
    alert_id: int,
    user_id: int = Depends(get_user_id_with_fallback)
):
    """알림 해결 처리"""
    try:
        success = resolve_pacing_alert(user_id, alert_id)
        return {
            "success": success,
            "message": "알림이 해결 처리되었습니다." if success else "처리 실패"
        }
    except Exception as e:
        logger.error(f"Failed to resolve alert: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/recommendations")
async def get_recommendations(
    user_id: int = Depends(get_user_id_with_fallback),
    include_applied: bool = Query(False)
):
    """페이싱 권장사항 조회"""
    try:
        recommendations = get_pacing_recommendations(user_id, include_applied)
        return {"success": True, "recommendations": recommendations}
    except Exception as e:
        logger.error(f"Failed to get recommendations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/recommendations/{recommendation_id}/apply")
async def apply_recommendation(
    recommendation_id: int,
    user_id: int = Depends(get_user_id_with_fallback)
):
    """권장사항 적용"""
    try:
        success = apply_pacing_recommendation(user_id, recommendation_id)
        return {
            "success": success,
            "message": "권장사항이 적용되었습니다." if success else "적용 실패"
        }
    except Exception as e:
        logger.error(f"Failed to apply recommendation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/hourly-distribution")
async def get_hourly_distribution(
    user_id: int = Depends(get_user_id_with_fallback),
    campaign_id: str = Query(None),
    strategy: str = Query("standard")
):
    """시간대별 예산 배분 조회"""
    try:
        # 전략별 예산 배분 계산
        sample_budget = 100000  # 샘플 예산

        try:
            strategy_enum = PacingStrategy(strategy)
        except ValueError:
            strategy_enum = PacingStrategy.STANDARD

        hourly_budgets = budget_pacing_optimizer.calculate_hourly_budget(
            sample_budget,
            strategy_enum
        )

        # 퍼센트로 변환
        distribution = []
        for hour in range(24):
            budget = hourly_budgets.get(hour, 0)
            distribution.append({
                "hour": hour,
                "hour_label": f"{hour:02d}:00",
                "budget": budget,
                "percentage": (budget / sample_budget) * 100
            })

        return {
            "success": True,
            "strategy": strategy,
            "total_budget": sample_budget,
            "distribution": distribution
        }
    except Exception as e:
        logger.error(f"Failed to get hourly distribution: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/strategy/change")
async def change_strategy(
    request: StrategyChangeRequest,
    user_id: int = Depends(get_user_id_with_fallback)
):
    """페이싱 전략 변경"""
    try:
        # 전략 유효성 검사
        try:
            new_strategy = PacingStrategy(request.new_strategy)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid strategy. Valid options: {[s.value for s in PacingStrategy]}"
            )

        # DB 업데이트 (save_campaign_budget 사용)
        db_campaigns = get_campaign_budgets(user_id)
        campaign = next((c for c in db_campaigns if c['campaign_id'] == request.campaign_id), None)

        if campaign:
            save_campaign_budget(
                user_id=user_id,
                campaign_id=request.campaign_id,
                campaign_name=campaign['campaign_name'],
                platform=campaign['platform'],
                daily_budget=campaign['daily_budget'],
                monthly_budget=campaign.get('monthly_budget', 0),
                pacing_strategy=request.new_strategy
            )

        return {
            "success": True,
            "campaign_id": request.campaign_id,
            "new_strategy": request.new_strategy,
            "message": f"페이싱 전략이 '{request.new_strategy}'(으)로 변경되었습니다."
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to change strategy: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/monthly-projection")
async def get_monthly_projection(
    user_id: int = Depends(get_user_id_with_fallback),
    campaign_id: str = Query(None)
):
    """월간 예산 예측 조회"""
    try:
        if campaign_id:
            projections = get_monthly_projections(user_id, campaign_id)
        else:
            projections = get_monthly_projections(user_id)

        if not projections:
            # 샘플 데이터로 예측 생성
            sample = _generate_sample_campaigns(user_id)
            projections = []

            for campaign in sample:
                proj = budget_pacing_optimizer.project_monthly_spend(campaign)
                projections.append(proj)

        return {"success": True, "projections": projections}
    except Exception as e:
        logger.error(f"Failed to get monthly projection: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/strategies")
async def get_strategies():
    """사용 가능한 페이싱 전략 목록"""
    strategies = [
        {
            "id": "standard",
            "name": "표준 (Standard)",
            "description": "하루 동안 균등하게 예산을 분배합니다.",
            "best_for": "안정적인 노출이 필요한 브랜딩 캠페인"
        },
        {
            "id": "accelerated",
            "name": "가속 (Accelerated)",
            "description": "가능한 빠르게 예산을 소진합니다. 오전에 집중됩니다.",
            "best_for": "시간 제한 프로모션, 빠른 결과가 필요한 경우"
        },
        {
            "id": "front_loaded",
            "name": "전반 집중 (Front-loaded)",
            "description": "오전 시간대에 예산을 집중합니다.",
            "best_for": "B2B 캠페인, 업무 시간대 타겟팅"
        },
        {
            "id": "back_loaded",
            "name": "후반 집중 (Back-loaded)",
            "description": "오후/저녁 시간대에 예산을 집중합니다.",
            "best_for": "B2C 캠페인, 퇴근 후 쇼핑 타겟팅"
        },
        {
            "id": "performance",
            "name": "성과 기반 (Performance)",
            "description": "CTR/ROAS가 높은 시간대에 예산을 자동 집중합니다.",
            "best_for": "충분한 데이터가 있는 성숙한 캠페인"
        },
        {
            "id": "dayparting",
            "name": "시간대별 맞춤 (Dayparting)",
            "description": "사용자가 정의한 시간대별 가중치로 배분합니다.",
            "best_for": "특정 시간대 타겟팅이 필요한 경우"
        }
    ]

    return {"success": True, "strategies": strategies}


@router.get("/statuses")
async def get_statuses():
    """페이싱 상태 목록"""
    statuses = [
        {
            "id": "on_track",
            "name": "정상",
            "description": "예산 소진이 계획대로 진행 중",
            "color": "green"
        },
        {
            "id": "underspending",
            "name": "미소진",
            "description": "예상보다 예산 소진이 느림",
            "color": "yellow"
        },
        {
            "id": "overspending",
            "name": "과소진",
            "description": "예상보다 예산 소진이 빠름",
            "color": "orange"
        },
        {
            "id": "depleted",
            "name": "소진 완료",
            "description": "일일 예산이 모두 소진됨",
            "color": "red"
        },
        {
            "id": "paused",
            "name": "일시 중지",
            "description": "캠페인이 일시 중지됨",
            "color": "gray"
        }
    ]

    return {"success": True, "statuses": statuses}


# ============ Helper Functions ============

def _generate_sample_campaigns(user_id: int) -> List[CampaignBudget]:
    """샘플 캠페인 데이터 생성"""
    import random

    current_hour = datetime.now().hour
    hours_elapsed = current_hour + 1

    campaigns = [
        CampaignBudget(
            campaign_id="naver_brand_01",
            campaign_name="네이버 브랜드 검색",
            platform="naver",
            daily_budget=500000,
            monthly_budget=15000000,
            spent_today=int(500000 * (hours_elapsed / 24) * random.uniform(0.8, 1.1)),
            spent_this_month=7500000 + random.randint(-500000, 500000),
            pacing_strategy=PacingStrategy.STANDARD
        ),
        CampaignBudget(
            campaign_id="naver_power_01",
            campaign_name="네이버 파워링크",
            platform="naver",
            daily_budget=300000,
            monthly_budget=9000000,
            spent_today=int(300000 * (hours_elapsed / 24) * random.uniform(0.6, 0.9)),
            spent_this_month=4000000 + random.randint(-300000, 300000),
            pacing_strategy=PacingStrategy.FRONT_LOADED
        ),
        CampaignBudget(
            campaign_id="google_search_01",
            campaign_name="Google 검색 - 핵심 키워드",
            platform="google",
            daily_budget=400000,
            monthly_budget=12000000,
            spent_today=int(400000 * (hours_elapsed / 24) * random.uniform(1.1, 1.4)),
            spent_this_month=6500000 + random.randint(-400000, 400000),
            pacing_strategy=PacingStrategy.ACCELERATED
        ),
        CampaignBudget(
            campaign_id="meta_conversion_01",
            campaign_name="Meta 전환 캠페인",
            platform="meta",
            daily_budget=250000,
            monthly_budget=7500000,
            spent_today=int(250000 * (hours_elapsed / 24) * random.uniform(0.9, 1.05)),
            spent_this_month=3800000 + random.randint(-200000, 200000),
            pacing_strategy=PacingStrategy.BACK_LOADED
        ),
        CampaignBudget(
            campaign_id="kakao_moment_01",
            campaign_name="카카오 모먼트",
            platform="kakao",
            daily_budget=150000,
            monthly_budget=4500000,
            spent_today=int(150000 * (hours_elapsed / 24) * random.uniform(0.4, 0.7)),
            spent_this_month=2000000 + random.randint(-100000, 100000),
            pacing_strategy=PacingStrategy.STANDARD
        )
    ]

    return campaigns
