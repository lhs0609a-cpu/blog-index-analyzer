"""
크리에이티브 피로도 감지 API 라우터

Meta(Facebook/Instagram) 광고의 크리에이티브 피로도를 분석하고
교체 추천을 제공하는 API입니다.
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
import logging

from services.creative_fatigue_service import (
    get_fatigue_detector,
    CreativePerformance,
    CreativeType,
    FatigueLevel
)
from database.ad_optimization_db import (
    save_creative_performance,
    get_latest_creative_performance,
    get_fatigue_analysis,
    get_latest_fatigue_analysis,
    get_fatigue_summary,
    save_refresh_recommendation,
    get_refresh_recommendations,
    apply_refresh_recommendation
)
from routers.auth import get_current_user

router = APIRouter(prefix="/api/ads/creative-fatigue", tags=["크리에이티브피로도"])
logger = logging.getLogger(__name__)


# ============ Pydantic 모델 ============

class CreativeDataInput(BaseModel):
    """크리에이티브 데이터 입력"""
    creative_id: str = Field(..., description="크리에이티브 ID")
    creative_name: str = Field("", description="크리에이티브 이름")
    creative_type: str = Field("image", description="크리에이티브 유형")
    impressions: int = Field(0, ge=0)
    reach: int = Field(0, ge=0)
    clicks: int = Field(0, ge=0)
    conversions: int = Field(0, ge=0)
    spend: float = Field(0, ge=0)
    ctr: float = Field(0, ge=0)
    cpm: float = Field(0, ge=0)
    cpc: float = Field(0, ge=0)
    cvr: float = Field(0, ge=0)
    frequency: float = Field(0, ge=0)
    likes: int = Field(0, ge=0)
    comments: int = Field(0, ge=0)
    shares: int = Field(0, ge=0)
    saves: int = Field(0, ge=0)
    engagement_rate: float = Field(0, ge=0)
    start_date: Optional[str] = None
    days_running: int = Field(0, ge=0)
    historical_ctr: List[float] = Field(default_factory=list)
    historical_cpm: List[float] = Field(default_factory=list)
    historical_frequency: List[float] = Field(default_factory=list)


class BulkCreativeInput(BaseModel):
    """대량 크리에이티브 입력"""
    ad_account_id: str = Field(..., description="광고 계정 ID")
    creatives: List[CreativeDataInput]


class AnalyzeRequest(BaseModel):
    """피로도 분석 요청"""
    ad_account_id: str = Field(..., description="광고 계정 ID")
    creative_id: Optional[str] = Field(None, description="특정 크리에이티브 ID (선택)")


class RefreshActionRequest(BaseModel):
    """교체 추천 적용 요청"""
    recommendation_id: int


# ============ API 엔드포인트 ============

@router.get("/summary")
async def get_creative_fatigue_summary(
    ad_account_id: str = Query(..., description="광고 계정 ID"),
    current_user: dict = Depends(get_current_user)
):
    """크리에이티브 피로도 요약 조회"""
    try:
        user_id = current_user["id"]
        summary = get_fatigue_summary(user_id, ad_account_id)

        # 건강 상태 판단
        total = summary.get("total_creatives", 0)
        tired = summary.get("tired_count", 0)
        exhausted = summary.get("exhausted_count", 0)

        if total == 0:
            health_status = "no_data"
        elif (tired + exhausted) / total > 0.5:
            health_status = "critical"
        elif (tired + exhausted) / total > 0.3:
            health_status = "warning"
        elif (tired + exhausted) / total > 0.1:
            health_status = "moderate"
        else:
            health_status = "healthy"

        return {
            "status": "success",
            "summary": {
                **summary,
                "health_status": health_status
            }
        }

    except Exception as e:
        logger.error(f"Failed to get fatigue summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analysis")
async def get_fatigue_analysis_list(
    ad_account_id: str = Query(..., description="광고 계정 ID"),
    creative_id: Optional[str] = Query(None, description="특정 크리에이티브 ID"),
    current_user: dict = Depends(get_current_user)
):
    """크리에이티브 피로도 분석 결과 조회"""
    try:
        user_id = current_user["id"]

        if creative_id:
            analyses = get_fatigue_analysis(user_id, ad_account_id, creative_id)
        else:
            analyses = get_latest_fatigue_analysis(user_id, ad_account_id)

        return {
            "status": "success",
            "analyses": analyses,
            "total": len(analyses)
        }

    except Exception as e:
        logger.error(f"Failed to get fatigue analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze")
async def analyze_creatives(
    request: AnalyzeRequest,
    current_user: dict = Depends(get_current_user)
):
    """크리에이티브 피로도 분석 실행"""
    try:
        user_id = current_user["id"]
        detector = get_fatigue_detector()

        result = detector.analyze_account_creatives(
            user_id=user_id,
            ad_account_id=request.ad_account_id
        )

        return result

    except Exception as e:
        logger.error(f"Failed to analyze creatives: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/creatives")
async def save_creative_data(
    request: BulkCreativeInput,
    current_user: dict = Depends(get_current_user)
):
    """크리에이티브 성과 데이터 저장"""
    try:
        user_id = current_user["id"]
        saved_count = 0

        for creative in request.creatives:
            save_creative_performance(
                user_id=user_id,
                ad_account_id=request.ad_account_id,
                creative_data=creative.model_dump()
            )
            saved_count += 1

        return {
            "status": "success",
            "saved_count": saved_count,
            "message": f"{saved_count}개의 크리에이티브 데이터가 저장되었습니다"
        }

    except Exception as e:
        logger.error(f"Failed to save creative data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/creatives")
async def get_creative_data(
    ad_account_id: str = Query(..., description="광고 계정 ID"),
    current_user: dict = Depends(get_current_user)
):
    """저장된 크리에이티브 성과 데이터 조회"""
    try:
        user_id = current_user["id"]
        creatives = get_latest_creative_performance(user_id, ad_account_id)

        return {
            "status": "success",
            "creatives": creatives,
            "total": len(creatives)
        }

    except Exception as e:
        logger.error(f"Failed to get creative data: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/recommendations")
async def get_recommendations(
    ad_account_id: str = Query(..., description="광고 계정 ID"),
    urgency: Optional[str] = Query(None, description="긴급도 필터"),
    include_applied: bool = Query(False, description="적용된 추천 포함"),
    current_user: dict = Depends(get_current_user)
):
    """크리에이티브 교체 추천 조회"""
    try:
        user_id = current_user["id"]
        recommendations = get_refresh_recommendations(
            user_id=user_id,
            ad_account_id=ad_account_id,
            urgency=urgency,
            include_applied=include_applied
        )

        return {
            "status": "success",
            "recommendations": recommendations,
            "total": len(recommendations)
        }

    except Exception as e:
        logger.error(f"Failed to get recommendations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/recommendations/apply")
async def apply_recommendation(
    request: RefreshActionRequest,
    current_user: dict = Depends(get_current_user)
):
    """교체 추천 적용 처리"""
    try:
        user_id = current_user["id"]
        success = apply_refresh_recommendation(
            recommendation_id=request.recommendation_id,
            user_id=user_id
        )

        if not success:
            raise HTTPException(status_code=404, detail="추천을 찾을 수 없습니다")

        return {
            "status": "success",
            "message": "교체 추천이 적용 처리되었습니다"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to apply recommendation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze-single")
async def analyze_single_creative(
    creative: CreativeDataInput,
    current_user: dict = Depends(get_current_user)
):
    """단일 크리에이티브 피로도 분석"""
    try:
        detector = get_fatigue_detector()

        # CreativeDataInput을 CreativePerformance로 변환
        performance = CreativePerformance(
            creative_id=creative.creative_id,
            creative_name=creative.creative_name,
            creative_type=CreativeType(creative.creative_type),
            impressions=creative.impressions,
            reach=creative.reach,
            clicks=creative.clicks,
            conversions=creative.conversions,
            spend=creative.spend,
            ctr=creative.ctr,
            cpm=creative.cpm,
            cpc=creative.cpc,
            cvr=creative.cvr,
            frequency=creative.frequency,
            likes=creative.likes,
            comments=creative.comments,
            shares=creative.shares,
            saves=creative.saves,
            engagement_rate=creative.engagement_rate,
            start_date=datetime.fromisoformat(creative.start_date) if creative.start_date else None,
            days_running=creative.days_running,
            historical_ctr=creative.historical_ctr,
            historical_cpm=creative.historical_cpm,
            historical_frequency=creative.historical_frequency,
        )

        analysis = detector.analyze_creative(performance)

        # 교체 추천 생성
        recommendation = detector.generate_refresh_recommendation(
            analysis=analysis,
            creative_type=CreativeType(creative.creative_type)
        )

        return {
            "status": "success",
            "analysis": {
                "creative_id": analysis.creative_id,
                "creative_name": analysis.creative_name,
                "fatigue_level": analysis.fatigue_level.value,
                "fatigue_score": analysis.fatigue_score,
                "indicator_scores": {
                    k.value: v for k, v in analysis.indicator_scores.items()
                },
                "issues": analysis.issues,
                "recommendations": analysis.recommendations,
                "estimated_days_remaining": analysis.estimated_days_remaining,
                "replacement_priority": analysis.replacement_priority
            },
            "refresh_recommendation": {
                "recommended_action": recommendation.recommended_action,
                "urgency": recommendation.urgency,
                "suggested_variations": recommendation.suggested_variations,
                "expected_improvement": recommendation.expected_improvement,
                "budget_impact": recommendation.budget_impact
            }
        }

    except Exception as e:
        logger.error(f"Failed to analyze single creative: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/creative-types")
async def get_creative_types():
    """지원되는 크리에이티브 유형 목록"""
    return {
        "types": [
            {"value": "image", "label": "이미지", "avg_lifespan_days": 14},
            {"value": "video", "label": "동영상", "avg_lifespan_days": 21},
            {"value": "carousel", "label": "캐러셀", "avg_lifespan_days": 18},
            {"value": "collection", "label": "컬렉션", "avg_lifespan_days": 21},
            {"value": "instant_experience", "label": "인스턴트 경험", "avg_lifespan_days": 28}
        ]
    }


@router.get("/fatigue-levels")
async def get_fatigue_levels():
    """피로도 레벨 설명"""
    return {
        "levels": [
            {
                "value": "fresh",
                "label": "신선함",
                "score_range": "0-20",
                "color": "#22c55e",
                "description": "크리에이티브가 새롭고 성과가 좋습니다"
            },
            {
                "value": "good",
                "label": "양호",
                "score_range": "20-40",
                "color": "#84cc16",
                "description": "아직 효과적이며 모니터링만 필요합니다"
            },
            {
                "value": "moderate",
                "label": "보통",
                "score_range": "40-60",
                "color": "#eab308",
                "description": "성과가 감소하기 시작했습니다. A/B 테스트를 권장합니다"
            },
            {
                "value": "tired",
                "label": "피로",
                "score_range": "60-80",
                "color": "#f97316",
                "description": "크리에이티브 교체가 필요합니다"
            },
            {
                "value": "exhausted",
                "label": "고갈",
                "score_range": "80-100",
                "color": "#ef4444",
                "description": "즉시 교체가 필요합니다. 성과가 크게 저하되었습니다"
            }
        ]
    }


@router.get("/indicators")
async def get_fatigue_indicators():
    """피로도 지표 설명"""
    return {
        "indicators": [
            {
                "value": "ctr_decline",
                "label": "CTR 하락",
                "description": "클릭률이 초기 대비 하락한 정도"
            },
            {
                "value": "frequency_high",
                "label": "빈도 과다",
                "description": "동일 사용자에게 광고가 노출된 평균 횟수"
            },
            {
                "value": "cpm_increase",
                "label": "CPM 상승",
                "description": "1000회 노출 비용의 상승 정도"
            },
            {
                "value": "engagement_drop",
                "label": "참여도 하락",
                "description": "좋아요, 댓글, 공유 등 참여율 감소"
            },
            {
                "value": "conversion_drop",
                "label": "전환율 하락",
                "description": "전환율(CVR)의 감소 정도"
            },
            {
                "value": "reach_saturation",
                "label": "도달 포화",
                "description": "타겟 오디언스 도달이 포화된 정도"
            }
        ]
    }
