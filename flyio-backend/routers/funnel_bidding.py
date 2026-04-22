"""
Funnel-Based Bidding API Router - 퍼널 기반 입찰 최적화 API

마케팅 퍼널 단계(TOFU/MOFU/BOFU)에 따른 입찰 전략 최적화
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import date
import logging

from routers.auth_deps import get_user_id_with_fallback

from services.funnel_bidding_service import (
    funnel_bidding_optimizer,
    FunnelStage,
    CampaignObjective,
    BiddingStrategy,
    FunnelCampaign
)
from database.ad_optimization_db import (
    get_funnel_campaigns,
    save_funnel_campaign,
    get_funnel_stage_metrics,
    save_funnel_stage_metrics,
    get_funnel_flow_analysis,
    save_funnel_flow_analysis,
    get_funnel_recommendations,
    save_funnel_recommendation,
    apply_funnel_recommendation,
    get_funnel_budget_allocation,
    save_funnel_budget_allocation
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ads/funnel-bidding", tags=["퍼널입찰"])


# ============ Request/Response Models ============

class FunnelCampaignRequest(BaseModel):
    campaign_id: str
    campaign_name: str
    platform: str
    objective: str
    bidding_strategy: str
    daily_budget: float = Field(..., gt=0)
    impressions: int = Field(default=0, ge=0)
    reach: int = Field(default=0, ge=0)
    clicks: int = Field(default=0, ge=0)
    conversions: int = Field(default=0, ge=0)
    spend: float = Field(default=0, ge=0)
    revenue: float = Field(default=0, ge=0)


class BudgetAllocationRequest(BaseModel):
    strategy: str = Field(default="balanced", description="awareness_focus, balanced, conversion_focus, retargeting_heavy")


class AnalyzeRequest(BaseModel):
    campaign_ids: Optional[List[str]] = None


# ============ Helper: 캠페인 로딩 공통 함수 ============

def _load_campaigns(user_id: int, stage: str = None, platform: str = None) -> tuple[List[FunnelCampaign], bool]:
    """DB에서 캠페인 로드. 없으면 샘플 데이터 반환. Returns (campaigns, is_sample)"""
    db_campaigns = get_funnel_campaigns(user_id, stage, platform)

    if not db_campaigns:
        return _generate_sample_campaigns(user_id), True

    campaigns = [
        FunnelCampaign(
            campaign_id=c['campaign_id'],
            campaign_name=c['campaign_name'],
            platform=c['platform'],
            objective=CampaignObjective(c['objective']) if c.get('objective') else CampaignObjective.TRAFFIC,
            funnel_stage=FunnelStage(c['funnel_stage']),
            bidding_strategy=BiddingStrategy(c['bidding_strategy']) if c.get('bidding_strategy') else BiddingStrategy.LOWEST_COST_CLICK,
            daily_budget=c['daily_budget'],
            impressions=c.get('impressions', 0),
            reach=c.get('reach', 0),
            clicks=c.get('clicks', 0),
            conversions=c.get('conversions', 0),
            spend=c.get('spend', 0),
            revenue=c.get('revenue', 0)
        )
        for c in db_campaigns
    ]
    return campaigns, False


# ============ API Endpoints ============

@router.get("/summary")
async def get_funnel_summary(user_id: int = Depends(get_user_id_with_fallback)):
    """퍼널 전체 요약"""
    try:
        campaigns, is_sample = _load_campaigns(user_id)
        summary = funnel_bidding_optimizer.get_summary(campaigns)

        return {
            "success": True,
            "summary": summary,
            "sample_data": is_sample,
            "stages": [s.value for s in FunnelStage],
            "objectives": [o.value for o in CampaignObjective],
            "strategies": [s.value for s in BiddingStrategy]
        }
    except Exception as e:
        logger.error(f"Failed to get funnel summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/campaigns")
async def get_campaigns(
    user_id: int = Depends(get_user_id_with_fallback),
    stage: str = Query(None),
    platform: str = Query(None)
):
    """퍼널 캠페인 목록 조회"""
    try:
        campaigns, is_sample = _load_campaigns(user_id, stage, platform)

        if is_sample:
            if stage:
                campaigns = [c for c in campaigns if c.funnel_stage.value == stage]
            if platform:
                campaigns = [c for c in campaigns if c.platform == platform]

            campaign_dicts = [{
                "campaign_id": c.campaign_id,
                "campaign_name": c.campaign_name,
                "platform": c.platform,
                "objective": c.objective.value,
                "funnel_stage": c.funnel_stage.value,
                "bidding_strategy": c.bidding_strategy.value,
                "daily_budget": c.daily_budget,
                "impressions": c.impressions,
                "reach": c.reach,
                "clicks": c.clicks,
                "conversions": c.conversions,
                "spend": c.spend,
                "revenue": c.revenue,
                "cpm": c.cpm,
                "cpc": c.cpc,
                "ctr": c.ctr,
                "cpa": c.cpa,
                "roas": c.roas,
                "conversion_rate": c.conversion_rate
            } for c in campaigns]
            return {"success": True, "campaigns": campaign_dicts, "sample_data": True}

        db_campaigns = get_funnel_campaigns(user_id, stage, platform)
        return {"success": True, "campaigns": db_campaigns, "sample_data": False}
    except Exception as e:
        logger.error(f"Failed to get campaigns: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/campaigns")
async def add_campaign(
    request: FunnelCampaignRequest,
    user_id: int = Depends(get_user_id_with_fallback)
):
    """퍼널 캠페인 추가/수정"""
    try:
        # 퍼널 단계 자동 분류
        funnel_stage = funnel_bidding_optimizer.classify_campaign(request.objective)

        campaign_id = save_funnel_campaign(
            user_id=user_id,
            campaign_id=request.campaign_id,
            campaign_name=request.campaign_name,
            platform=request.platform,
            objective=request.objective,
            funnel_stage=funnel_stage.value,
            bidding_strategy=request.bidding_strategy,
            daily_budget=request.daily_budget,
            impressions=request.impressions,
            reach=request.reach,
            clicks=request.clicks,
            conversions=request.conversions,
            spend=request.spend,
            revenue=request.revenue
        )

        return {
            "success": True,
            "campaign_id": campaign_id,
            "funnel_stage": funnel_stage.value,
            "message": f"캠페인이 {funnel_stage.value.upper()} 단계로 분류되어 저장되었습니다."
        }
    except Exception as e:
        logger.error(f"Failed to save campaign: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stage-metrics")
async def get_stage_metrics(
    user_id: int = Depends(get_user_id_with_fallback),
    stage: str = Query(None)
):
    """퍼널 단계별 성과 조회"""
    try:
        campaigns, is_sample = _load_campaigns(user_id)
        stage_metrics = funnel_bidding_optimizer.calculate_stage_metrics(campaigns)

        result = {}
        for s, metrics in stage_metrics.items():
            if stage and s.value != stage:
                continue
            result[s.value] = {
                "stage": s.value,
                "campaign_count": metrics.campaign_count,
                "total_budget": metrics.total_budget,
                "total_spend": metrics.total_spend,
                "total_impressions": metrics.total_impressions,
                "total_reach": metrics.total_reach,
                "total_clicks": metrics.total_clicks,
                "total_conversions": metrics.total_conversions,
                "total_revenue": metrics.total_revenue,
                "avg_cpm": metrics.avg_cpm,
                "avg_cpc": metrics.avg_cpc,
                "avg_ctr": metrics.avg_ctr,
                "avg_cpa": metrics.avg_cpa,
                "avg_roas": metrics.avg_roas,
                "cpm_vs_benchmark": metrics.cpm_vs_benchmark,
                "cpc_vs_benchmark": metrics.cpc_vs_benchmark,
                "cpa_vs_benchmark": metrics.cpa_vs_benchmark
            }

        return {"success": True, "stage_metrics": result, "sample_data": is_sample}
    except Exception as e:
        logger.error(f"Failed to get stage metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/funnel-flow")
async def get_funnel_flow(user_id: int = Depends(get_user_id_with_fallback)):
    """퍼널 흐름 분석"""
    try:
        campaigns, is_sample = _load_campaigns(user_id)
        flow = funnel_bidding_optimizer.analyze_funnel_flow(campaigns)

        return {
            "success": True,
            "sample_data": is_sample,
            "funnel_flow": {
                "tofu_reach": flow.tofu_reach,
                "mofu_clicks": flow.mofu_clicks,
                "bofu_conversions": flow.bofu_conversions,
                "tofu_to_mofu_rate": flow.tofu_to_mofu_rate,
                "mofu_to_bofu_rate": flow.mofu_to_bofu_rate,
                "overall_conversion_rate": flow.overall_conversion_rate,
                "cost_per_tofu": flow.cost_per_tofu,
                "cost_per_mofu": flow.cost_per_mofu,
                "cost_per_bofu": flow.cost_per_bofu
            }
        }
    except Exception as e:
        logger.error(f"Failed to get funnel flow: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze")
async def run_analysis(
    request: AnalyzeRequest,
    user_id: int = Depends(get_user_id_with_fallback)
):
    """퍼널 분석 실행"""
    try:
        campaigns, is_sample = _load_campaigns(user_id)

        # 특정 캠페인만 분석
        if request.campaign_ids:
            campaigns = [c for c in campaigns if c.campaign_id in request.campaign_ids]

        # 단계별 분석
        stage_metrics = funnel_bidding_optimizer.calculate_stage_metrics(campaigns)

        # 흐름 분석
        flow = funnel_bidding_optimizer.analyze_funnel_flow(campaigns)

        # 권장사항 생성
        recommendations = funnel_bidding_optimizer.generate_bidding_recommendations(campaigns)

        # 분석 결과 저장
        today = date.today().isoformat()
        for stage, metrics in stage_metrics.items():
            save_funnel_stage_metrics(
                user_id=user_id,
                stage=stage.value,
                analysis_date=today,
                campaign_count=metrics.campaign_count,
                total_budget=metrics.total_budget,
                total_spend=metrics.total_spend,
                total_impressions=metrics.total_impressions,
                total_reach=metrics.total_reach,
                total_clicks=metrics.total_clicks,
                total_conversions=metrics.total_conversions,
                total_revenue=metrics.total_revenue,
                avg_cpm=metrics.avg_cpm,
                avg_cpc=metrics.avg_cpc,
                avg_ctr=metrics.avg_ctr,
                avg_cpa=metrics.avg_cpa,
                avg_roas=metrics.avg_roas,
                cpm_vs_benchmark=metrics.cpm_vs_benchmark,
                cpc_vs_benchmark=metrics.cpc_vs_benchmark,
                cpa_vs_benchmark=metrics.cpa_vs_benchmark
            )

        # 흐름 분석 저장
        save_funnel_flow_analysis(
            user_id=user_id,
            analysis_date=today,
            tofu_reach=flow.tofu_reach,
            mofu_clicks=flow.mofu_clicks,
            bofu_conversions=flow.bofu_conversions,
            tofu_to_mofu_rate=flow.tofu_to_mofu_rate,
            mofu_to_bofu_rate=flow.mofu_to_bofu_rate,
            overall_conversion_rate=flow.overall_conversion_rate,
            cost_per_tofu=flow.cost_per_tofu,
            cost_per_mofu=flow.cost_per_mofu,
            cost_per_bofu=flow.cost_per_bofu
        )

        # 권장사항 저장
        for rec in recommendations:
            save_funnel_recommendation(
                user_id=user_id,
                campaign_id=rec.campaign_id,
                campaign_name=rec.campaign_name,
                funnel_stage=rec.funnel_stage.value,
                current_strategy=rec.current_strategy.value,
                recommended_strategy=rec.recommended_strategy.value,
                reason=rec.reason,
                expected_improvement=rec.expected_improvement,
                priority=rec.priority,
                recommended_bid=rec.recommended_bid,
                recommended_budget=rec.recommended_budget
            )

        return {
            "success": True,
            "analyzed_count": len(campaigns),
            "stage_metrics": {s.value: {
                "campaign_count": m.campaign_count,
                "total_spend": m.total_spend
            } for s, m in stage_metrics.items()},
            "funnel_flow": {
                "tofu_to_mofu_rate": flow.tofu_to_mofu_rate,
                "mofu_to_bofu_rate": flow.mofu_to_bofu_rate,
                "overall_conversion_rate": flow.overall_conversion_rate
            },
            "recommendations_count": len(recommendations)
        }
    except Exception as e:
        logger.error(f"Failed to run analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/recommendations")
async def get_recommendations(
    user_id: int = Depends(get_user_id_with_fallback),
    include_applied: bool = Query(False)
):
    """퍼널 입찰 권장사항 조회"""
    try:
        recommendations = get_funnel_recommendations(user_id, include_applied)
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
        success = apply_funnel_recommendation(user_id, recommendation_id)
        return {
            "success": success,
            "message": "권장사항이 적용되었습니다." if success else "적용 실패"
        }
    except Exception as e:
        logger.error(f"Failed to apply recommendation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/budget-allocation")
async def get_budget_allocation(
    user_id: int = Depends(get_user_id_with_fallback),
    strategy: str = Query("balanced")
):
    """퍼널별 예산 배분 조회"""
    try:
        campaigns, is_sample = _load_campaigns(user_id)
        allocation = funnel_bidding_optimizer.recommend_budget_allocation(campaigns, strategy)

        return {
            "success": True,
            "allocation": {
                "total_budget": allocation.total_budget,
                "tofu": {
                    "budget": allocation.tofu_budget,
                    "percentage": allocation.tofu_percentage,
                    "current_pct": allocation.current_tofu_pct
                },
                "mofu": {
                    "budget": allocation.mofu_budget,
                    "percentage": allocation.mofu_percentage,
                    "current_pct": allocation.current_mofu_pct
                },
                "bofu": {
                    "budget": allocation.bofu_budget,
                    "percentage": allocation.bofu_percentage,
                    "current_pct": allocation.current_bofu_pct
                },
                "adjustment_needed": allocation.adjustment_needed,
                "recommendation": allocation.recommendation
            },
            "sample_data": is_sample
        }
    except Exception as e:
        logger.error(f"Failed to get budget allocation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/budget-allocation/apply")
async def apply_budget_allocation(
    request: BudgetAllocationRequest,
    user_id: int = Depends(get_user_id_with_fallback)
):
    """예산 배분 계획 저장 (실제 광고 플랫폼 예산 변경 아님)"""
    try:
        campaigns, _ = _load_campaigns(user_id)
        allocation = funnel_bidding_optimizer.recommend_budget_allocation(campaigns, request.strategy)

        # 저장
        today = date.today().isoformat()
        save_funnel_budget_allocation(
            user_id=user_id,
            allocation_date=today,
            strategy=request.strategy,
            total_budget=allocation.total_budget,
            tofu_budget=allocation.tofu_budget,
            tofu_percentage=allocation.tofu_percentage,
            mofu_budget=allocation.mofu_budget,
            mofu_percentage=allocation.mofu_percentage,
            bofu_budget=allocation.bofu_budget,
            bofu_percentage=allocation.bofu_percentage,
            current_tofu_pct=allocation.current_tofu_pct,
            current_mofu_pct=allocation.current_mofu_pct,
            current_bofu_pct=allocation.current_bofu_pct,
            adjustment_needed=allocation.adjustment_needed,
            recommendation=allocation.recommendation
        )

        return {
            "success": True,
            "message": f"'{request.strategy}' 전략으로 예산 배분이 적용되었습니다.",
            "allocation": {
                "tofu": f"{allocation.tofu_percentage:.0f}%",
                "mofu": f"{allocation.mofu_percentage:.0f}%",
                "bofu": f"{allocation.bofu_percentage:.0f}%"
            }
        }
    except Exception as e:
        logger.error(f"Failed to apply budget allocation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stage-guide/{stage}")
async def get_stage_guide(stage: str):
    """퍼널 단계별 가이드"""
    try:
        stage_enum = FunnelStage(stage)
        guide = funnel_bidding_optimizer.get_stage_recommendations(stage_enum)
        return {"success": True, "guide": guide}
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid stage. Valid options: {[s.value for s in FunnelStage]}")
    except Exception as e:
        logger.error(f"Failed to get stage guide: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stages")
async def get_stages():
    """퍼널 단계 목록"""
    stages = [
        {
            "id": "tofu",
            "name": "TOFU (인지)",
            "full_name": "Top of Funnel",
            "description": "브랜드 인지도 향상 및 잠재 고객 도달",
            "objectives": ["브랜드 인지도", "도달", "동영상 조회"],
            "primary_kpi": "CPM / 도달률",
            "color": "blue"
        },
        {
            "id": "mofu",
            "name": "MOFU (고려)",
            "full_name": "Middle of Funnel",
            "description": "관심 유도 및 참여 촉진",
            "objectives": ["트래픽", "참여", "앱 설치", "리드 생성"],
            "primary_kpi": "CPC / CTR",
            "color": "yellow"
        },
        {
            "id": "bofu",
            "name": "BOFU (전환)",
            "full_name": "Bottom of Funnel",
            "description": "구매/전환 유도",
            "objectives": ["전환", "카탈로그 판매", "매장 방문"],
            "primary_kpi": "CPA / ROAS",
            "color": "green"
        }
    ]

    return {"success": True, "stages": stages}


@router.get("/allocation-strategies")
async def get_allocation_strategies():
    """예산 배분 전략 목록"""
    strategies = [
        {
            "id": "awareness_focus",
            "name": "인지도 중심",
            "description": "신규 브랜드, 제품 출시 시 권장",
            "split": {"tofu": 50, "mofu": 30, "bofu": 20}
        },
        {
            "id": "balanced",
            "name": "균형",
            "description": "안정적인 브랜드의 일반적인 배분",
            "split": {"tofu": 30, "mofu": 40, "bofu": 30}
        },
        {
            "id": "conversion_focus",
            "name": "전환 중심",
            "description": "성숙한 브랜드, 매출 목표 달성 시 권장",
            "split": {"tofu": 20, "mofu": 30, "bofu": 50}
        },
        {
            "id": "retargeting_heavy",
            "name": "리타겟팅 중심",
            "description": "기존 고객 재구매 유도, 장바구니 이탈 복구",
            "split": {"tofu": 15, "mofu": 25, "bofu": 60}
        }
    ]

    return {"success": True, "strategies": strategies}


# ============ Helper Functions ============

def _generate_sample_campaigns(user_id: int) -> List[FunnelCampaign]:
    """샘플 캠페인 데이터 생성 (user_id 기반 고정 시드로 일관된 데이터)"""
    import random
    rng = random.Random(user_id)  # user_id별 고정 시드

    campaigns = [
        # TOFU 캠페인
        FunnelCampaign(
            campaign_id="tofu_brand_01",
            campaign_name="브랜드 인지도 - 동영상",
            platform="meta",
            objective=CampaignObjective.BRAND_AWARENESS,
            funnel_stage=FunnelStage.TOFU,
            bidding_strategy=BiddingStrategy.LOWEST_COST_REACH,
            daily_budget=300000,
            impressions=150000 + rng.randint(-10000, 10000),
            reach=120000 + rng.randint(-5000, 5000),
            clicks=750 + rng.randint(-50, 50),
            conversions=0,
            spend=280000 + rng.randint(-10000, 10000),
            revenue=0
        ),
        FunnelCampaign(
            campaign_id="tofu_reach_01",
            campaign_name="도달 캠페인 - 이미지",
            platform="meta",
            objective=CampaignObjective.REACH,
            funnel_stage=FunnelStage.TOFU,
            bidding_strategy=BiddingStrategy.TARGET_CPM,
            daily_budget=200000,
            impressions=100000 + rng.randint(-5000, 5000),
            reach=85000 + rng.randint(-3000, 3000),
            clicks=500 + rng.randint(-30, 30),
            conversions=0,
            spend=190000 + rng.randint(-8000, 8000),
            revenue=0
        ),

        # MOFU 캠페인
        FunnelCampaign(
            campaign_id="mofu_traffic_01",
            campaign_name="트래픽 캠페인 - 검색",
            platform="google",
            objective=CampaignObjective.TRAFFIC,
            funnel_stage=FunnelStage.MOFU,
            bidding_strategy=BiddingStrategy.MAXIMIZE_CLICKS,
            daily_budget=400000,
            impressions=80000 + rng.randint(-4000, 4000),
            reach=60000 + rng.randint(-2000, 2000),
            clicks=2400 + rng.randint(-100, 100),
            conversions=48 + rng.randint(-5, 5),
            spend=380000 + rng.randint(-15000, 15000),
            revenue=960000 + rng.randint(-50000, 50000)
        ),
        FunnelCampaign(
            campaign_id="mofu_engagement_01",
            campaign_name="참여 캠페인",
            platform="meta",
            objective=CampaignObjective.ENGAGEMENT,
            funnel_stage=FunnelStage.MOFU,
            bidding_strategy=BiddingStrategy.LOWEST_COST_CLICK,
            daily_budget=250000,
            impressions=60000 + rng.randint(-3000, 3000),
            reach=45000 + rng.randint(-2000, 2000),
            clicks=1800 + rng.randint(-80, 80),
            conversions=27 + rng.randint(-3, 3),
            spend=240000 + rng.randint(-10000, 10000),
            revenue=540000 + rng.randint(-30000, 30000)
        ),
        FunnelCampaign(
            campaign_id="mofu_lead_01",
            campaign_name="리드 생성 캠페인",
            platform="naver",
            objective=CampaignObjective.LEAD_GENERATION,
            funnel_stage=FunnelStage.MOFU,
            bidding_strategy=BiddingStrategy.TARGET_CPC,
            daily_budget=350000,
            impressions=70000 + rng.randint(-3500, 3500),
            reach=55000 + rng.randint(-2500, 2500),
            clicks=2100 + rng.randint(-100, 100),
            conversions=63 + rng.randint(-5, 5),
            spend=340000 + rng.randint(-12000, 12000),
            revenue=1260000 + rng.randint(-60000, 60000)
        ),

        # BOFU 캠페인
        FunnelCampaign(
            campaign_id="bofu_conversion_01",
            campaign_name="전환 캠페인 - 리타겟팅",
            platform="meta",
            objective=CampaignObjective.CONVERSIONS,
            funnel_stage=FunnelStage.BOFU,
            bidding_strategy=BiddingStrategy.TARGET_CPA,
            daily_budget=500000,
            impressions=25000 + rng.randint(-1500, 1500),
            reach=20000 + rng.randint(-1000, 1000),
            clicks=1500 + rng.randint(-75, 75),
            conversions=75 + rng.randint(-8, 8),
            spend=480000 + rng.randint(-20000, 20000),
            revenue=2250000 + rng.randint(-100000, 100000)
        ),
        FunnelCampaign(
            campaign_id="bofu_sales_01",
            campaign_name="쇼핑 광고 - 카탈로그",
            platform="google",
            objective=CampaignObjective.CATALOG_SALES,
            funnel_stage=FunnelStage.BOFU,
            bidding_strategy=BiddingStrategy.TARGET_ROAS,
            daily_budget=600000,
            impressions=40000 + rng.randint(-2000, 2000),
            reach=32000 + rng.randint(-1500, 1500),
            clicks=2000 + rng.randint(-100, 100),
            conversions=100 + rng.randint(-10, 10),
            spend=580000 + rng.randint(-25000, 25000),
            revenue=2900000 + rng.randint(-150000, 150000)
        ),
        FunnelCampaign(
            campaign_id="bofu_purchase_01",
            campaign_name="구매 유도 - 네이버 쇼핑",
            platform="naver",
            objective=CampaignObjective.CONVERSIONS,
            funnel_stage=FunnelStage.BOFU,
            bidding_strategy=BiddingStrategy.MAXIMIZE_CONVERSIONS,
            daily_budget=450000,
            impressions=35000 + rng.randint(-1800, 1800),
            reach=28000 + rng.randint(-1200, 1200),
            clicks=1750 + rng.randint(-90, 90),
            conversions=87 + rng.randint(-9, 9),
            spend=430000 + rng.randint(-18000, 18000),
            revenue=2610000 + rng.randint(-130000, 130000)
        )
    ]

    return campaigns
