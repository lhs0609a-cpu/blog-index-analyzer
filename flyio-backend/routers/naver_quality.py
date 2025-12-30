"""
네이버 품질지수 최적화 API 라우터

네이버 검색광고의 품질지수를 분석하고 개선 방안을 제시하는 API입니다.
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
import logging

from services.naver_quality_service import (
    get_quality_optimizer,
    KeywordQuality,
    QualityLevel,
    QualityFactor,
    OptimizationType
)
from database.ad_optimization_db import (
    save_keyword_quality,
    get_keyword_quality_list,
    save_quality_analysis,
    get_quality_analysis_list,
    get_quality_summary,
    save_quality_recommendation,
    get_quality_recommendations,
    apply_quality_recommendation,
    save_quality_history,
    get_quality_history
)
from routers.auth import get_current_user

router = APIRouter(prefix="/api/ads/naver-quality", tags=["네이버품질지수"])
logger = logging.getLogger(__name__)


# ============ Pydantic 모델 ============

class KeywordQualityInput(BaseModel):
    """키워드 품질 데이터 입력"""
    keyword_id: str = Field(..., description="키워드 ID")
    keyword_text: str = Field(..., description="키워드 텍스트")
    ad_group_id: str = Field("", description="광고그룹 ID")
    ad_group_name: str = Field("", description="광고그룹 이름")
    campaign_id: str = Field("", description="캠페인 ID")
    campaign_name: str = Field("", description="캠페인 이름")
    quality_index: int = Field(5, ge=1, le=10, description="품질지수 (1-10)")
    ad_relevance_score: int = Field(5, ge=1, le=10)
    landing_page_score: int = Field(5, ge=1, le=10)
    expected_ctr_score: int = Field(5, ge=1, le=10)
    impressions: int = Field(0, ge=0)
    clicks: int = Field(0, ge=0)
    conversions: int = Field(0, ge=0)
    cost: float = Field(0, ge=0)
    ctr: float = Field(0, ge=0)
    cvr: float = Field(0, ge=0)
    cpc: float = Field(0, ge=0)
    ad_title: str = Field("", description="광고 제목")
    ad_description: str = Field("", description="광고 설명")
    display_url: str = Field("", description="표시 URL")
    has_sitelinks: bool = Field(False)
    has_callouts: bool = Field(False)
    has_phone: bool = Field(False)
    match_type: str = Field("exact", description="매치 타입")
    status: str = Field("active")


class BulkKeywordInput(BaseModel):
    """대량 키워드 입력"""
    keywords: List[KeywordQualityInput]


class AnalyzeRequest(BaseModel):
    """분석 요청"""
    campaign_id: Optional[str] = Field(None, description="캠페인 ID (선택)")


class RecommendationApplyRequest(BaseModel):
    """추천 적용 요청"""
    recommendation_id: int


# ============ API 엔드포인트 ============

@router.get("/summary")
async def get_naver_quality_summary(
    current_user: dict = Depends(get_current_user)
):
    """품질지수 요약 조회"""
    try:
        user_id = current_user["id"]
        summary = get_quality_summary(user_id)

        # 건강 상태 판단
        total = summary.get("total_keywords", 0)
        poor = summary.get("poor_count", 0)
        excellent = summary.get("excellent_count", 0)

        if total == 0:
            health_status = "no_data"
        elif poor / total > 0.3 if total > 0 else False:
            health_status = "critical"
        elif poor / total > 0.1 if total > 0 else False:
            health_status = "warning"
        elif excellent / total > 0.5 if total > 0 else False:
            health_status = "excellent"
        else:
            health_status = "good"

        return {
            "status": "success",
            "summary": {
                **summary,
                "health_status": health_status
            }
        }

    except Exception as e:
        logger.error(f"Failed to get quality summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/keywords")
async def get_keywords(
    campaign_id: Optional[str] = Query(None, description="캠페인 ID"),
    limit: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(get_current_user)
):
    """키워드 목록 조회"""
    try:
        user_id = current_user["id"]
        keywords = get_keyword_quality_list(user_id, campaign_id, limit)

        return {
            "status": "success",
            "keywords": keywords,
            "total": len(keywords)
        }

    except Exception as e:
        logger.error(f"Failed to get keywords: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/keywords")
async def save_keywords(
    request: BulkKeywordInput,
    current_user: dict = Depends(get_current_user)
):
    """키워드 품질 데이터 저장"""
    try:
        user_id = current_user["id"]
        saved_count = 0

        for keyword in request.keywords:
            save_keyword_quality(user_id, keyword.model_dump())
            saved_count += 1

        return {
            "status": "success",
            "saved_count": saved_count,
            "message": f"{saved_count}개의 키워드 데이터가 저장되었습니다"
        }

    except Exception as e:
        logger.error(f"Failed to save keywords: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/analysis")
async def get_analysis_list(
    keyword_id: Optional[str] = Query(None, description="키워드 ID"),
    limit: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(get_current_user)
):
    """품질지수 분석 결과 조회"""
    try:
        user_id = current_user["id"]
        analyses = get_quality_analysis_list(user_id, keyword_id, limit)

        return {
            "status": "success",
            "analyses": analyses,
            "total": len(analyses)
        }

    except Exception as e:
        logger.error(f"Failed to get analysis: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze")
async def analyze_keywords(
    request: AnalyzeRequest,
    current_user: dict = Depends(get_current_user)
):
    """품질지수 분석 실행"""
    try:
        user_id = current_user["id"]
        optimizer = get_quality_optimizer()

        # 저장된 키워드 데이터 조회
        keyword_data_list = get_keyword_quality_list(user_id, request.campaign_id)

        if not keyword_data_list:
            return {
                "status": "no_data",
                "message": "분석할 키워드 데이터가 없습니다. 네이버 검색광고 데이터를 먼저 동기화해주세요.",
                "analyses": [],
                "recommendations": [],
                "summary": {}
            }

        # KeywordQuality 객체로 변환
        keywords = []
        for data in keyword_data_list:
            kw = KeywordQuality(
                keyword_id=data.get("keyword_id", ""),
                keyword_text=data.get("keyword_text", ""),
                ad_group_id=data.get("ad_group_id", ""),
                ad_group_name=data.get("ad_group_name", ""),
                campaign_id=data.get("campaign_id", ""),
                campaign_name=data.get("campaign_name", ""),
                quality_index=data.get("quality_index", 5),
                ad_relevance_score=data.get("ad_relevance_score", 5),
                landing_page_score=data.get("landing_page_score", 5),
                expected_ctr_score=data.get("expected_ctr_score", 5),
                impressions=data.get("impressions", 0),
                clicks=data.get("clicks", 0),
                conversions=data.get("conversions", 0),
                cost=data.get("cost", 0),
                ctr=data.get("ctr", 0),
                cvr=data.get("cvr", 0),
                cpc=data.get("cpc", 0),
                ad_title=data.get("ad_title", ""),
                ad_description=data.get("ad_description", ""),
                display_url=data.get("display_url", ""),
                has_sitelinks=data.get("has_sitelinks", False),
                has_callouts=data.get("has_callouts", False),
                has_phone=data.get("has_phone", False),
                match_type=data.get("match_type", "exact"),
                status=data.get("status", "active"),
            )
            keywords.append(kw)

        # 분석 실행
        result = optimizer.analyze_campaign(user_id, request.campaign_id or "", keywords)

        # 분석 결과 저장
        if result["status"] == "success":
            for analysis in result.get("analyses", []):
                save_quality_analysis(user_id, analysis)

            for rec in result.get("recommendations", []):
                save_quality_recommendation(user_id, rec)

        return result

    except Exception as e:
        logger.error(f"Failed to analyze keywords: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analyze-single")
async def analyze_single_keyword(
    keyword: KeywordQualityInput,
    current_user: dict = Depends(get_current_user)
):
    """단일 키워드 품질 분석"""
    try:
        optimizer = get_quality_optimizer()

        # KeywordQuality 객체로 변환
        kw = KeywordQuality(
            keyword_id=keyword.keyword_id,
            keyword_text=keyword.keyword_text,
            ad_group_id=keyword.ad_group_id,
            ad_group_name=keyword.ad_group_name,
            campaign_id=keyword.campaign_id,
            campaign_name=keyword.campaign_name,
            quality_index=keyword.quality_index,
            ad_relevance_score=keyword.ad_relevance_score,
            landing_page_score=keyword.landing_page_score,
            expected_ctr_score=keyword.expected_ctr_score,
            impressions=keyword.impressions,
            clicks=keyword.clicks,
            conversions=keyword.conversions,
            cost=keyword.cost,
            ctr=keyword.ctr,
            cvr=keyword.cvr,
            cpc=keyword.cpc,
            ad_title=keyword.ad_title,
            ad_description=keyword.ad_description,
            display_url=keyword.display_url,
            has_sitelinks=keyword.has_sitelinks,
            has_callouts=keyword.has_callouts,
            has_phone=keyword.has_phone,
            match_type=keyword.match_type,
            status=keyword.status,
        )

        analysis = optimizer.analyze_keyword(kw)
        recommendations = optimizer.generate_recommendations(analysis, kw)

        return {
            "status": "success",
            "analysis": optimizer._analysis_to_dict(analysis),
            "recommendations": [optimizer._recommendation_to_dict(r) for r in recommendations]
        }

    except Exception as e:
        logger.error(f"Failed to analyze single keyword: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/recommendations")
async def get_recommendations_list(
    keyword_id: Optional[str] = Query(None, description="키워드 ID"),
    include_applied: bool = Query(False, description="적용된 추천 포함"),
    limit: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user)
):
    """품질지수 개선 추천 조회"""
    try:
        user_id = current_user["id"]
        recommendations = get_quality_recommendations(
            user_id, keyword_id, include_applied, limit
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
    request: RecommendationApplyRequest,
    current_user: dict = Depends(get_current_user)
):
    """추천 적용 처리"""
    try:
        user_id = current_user["id"]
        success = apply_quality_recommendation(request.recommendation_id, user_id)

        if not success:
            raise HTTPException(status_code=404, detail="추천을 찾을 수 없습니다")

        return {
            "status": "success",
            "message": "추천이 적용 처리되었습니다"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to apply recommendation: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/{keyword_id}")
async def get_keyword_history(
    keyword_id: str,
    days: int = Query(30, ge=1, le=90),
    current_user: dict = Depends(get_current_user)
):
    """키워드 품질지수 히스토리 조회"""
    try:
        user_id = current_user["id"]
        history = get_quality_history(user_id, keyword_id, days)

        return {
            "status": "success",
            "history": history,
            "total": len(history)
        }

    except Exception as e:
        logger.error(f"Failed to get history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/quality-levels")
async def get_quality_levels():
    """품질지수 레벨 설명"""
    return {
        "levels": [
            {
                "value": "excellent",
                "label": "우수",
                "score_range": "7-10",
                "color": "#22c55e",
                "cpc_impact": "-15~30%",
                "description": "매우 좋은 품질입니다. 낮은 비용으로 상위 노출이 가능합니다."
            },
            {
                "value": "good",
                "label": "양호",
                "score_range": "5-6",
                "color": "#84cc16",
                "cpc_impact": "-5~10%",
                "description": "평균 이상의 품질입니다. 추가 개선 여지가 있습니다."
            },
            {
                "value": "average",
                "label": "보통",
                "score_range": "3-4",
                "color": "#eab308",
                "cpc_impact": "0~-10%",
                "description": "개선이 필요합니다. 광고문구와 랜딩페이지를 점검하세요."
            },
            {
                "value": "poor",
                "label": "낮음",
                "score_range": "1-2",
                "color": "#ef4444",
                "cpc_impact": "-20~30%",
                "description": "품질이 매우 낮습니다. 즉시 개선이 필요합니다."
            }
        ]
    }


@router.get("/factors")
async def get_quality_factors():
    """품질지수 영향 요소 설명"""
    return {
        "factors": [
            {
                "value": "ad_relevance",
                "label": "광고 관련성",
                "weight": "25%",
                "description": "키워드와 광고문구의 관련성. 키워드를 광고 제목/설명에 포함하세요."
            },
            {
                "value": "landing_page",
                "label": "랜딩페이지 품질",
                "weight": "20%",
                "description": "랜딩페이지의 관련성과 사용자 경험. 키워드 관련 콘텐츠를 제공하세요."
            },
            {
                "value": "expected_ctr",
                "label": "예상 클릭률",
                "weight": "20%",
                "description": "과거 실적 기반 예상 CTR. 매력적인 광고문구로 클릭률을 높이세요."
            },
            {
                "value": "keyword_match",
                "label": "키워드 일치도",
                "weight": "15%",
                "description": "키워드와 광고문구의 단어 일치. 핵심 키워드를 정확히 포함하세요."
            },
            {
                "value": "ad_extensions",
                "label": "광고확장 사용",
                "weight": "10%",
                "description": "사이트링크, 콜아웃 등 광고확장 활용. 최소 2개 이상 사용하세요."
            },
            {
                "value": "historical_ctr",
                "label": "과거 CTR 실적",
                "weight": "10%",
                "description": "지금까지의 CTR 실적. 꾸준한 성과 관리가 중요합니다."
            }
        ]
    }


@router.get("/optimization-types")
async def get_optimization_types():
    """최적화 유형 설명"""
    return {
        "types": [
            {
                "value": "ad_text",
                "label": "광고문구 개선",
                "difficulty": "easy",
                "impact": "high",
                "description": "광고 제목과 설명을 개선합니다"
            },
            {
                "value": "extension",
                "label": "광고확장 추가",
                "difficulty": "easy",
                "impact": "medium",
                "description": "사이트링크, 콜아웃 등을 추가합니다"
            },
            {
                "value": "keyword_addition",
                "label": "키워드 추가/수정",
                "difficulty": "easy",
                "impact": "medium",
                "description": "매치 타입 변경 또는 새 키워드 추가"
            },
            {
                "value": "negative_keyword",
                "label": "제외 키워드 추가",
                "difficulty": "medium",
                "impact": "medium",
                "description": "관련 없는 검색에 광고가 표시되지 않도록 합니다"
            },
            {
                "value": "landing_page",
                "label": "랜딩페이지 개선",
                "difficulty": "hard",
                "impact": "high",
                "description": "랜딩페이지 콘텐츠와 사용자 경험을 개선합니다"
            },
            {
                "value": "bid_adjustment",
                "label": "입찰가 조정",
                "difficulty": "easy",
                "impact": "low",
                "description": "품질지수 개선 후 입찰가를 최적화합니다"
            }
        ]
    }
