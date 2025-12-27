"""
블루오션 키워드 발굴 API 라우터

프리미엄 기능: 블루오션 키워드 분석
"""
import logging
from typing import Optional, List
from fastapi import APIRouter, Query, HTTPException, Depends
from pydantic import BaseModel, Field

from services.blue_ocean_service import (
    blue_ocean_service,
    BlueOceanAnalysis,
    BlueOceanKeyword,
    BOSRating,
    EntryChance
)
from routers.auth import get_current_user_optional

logger = logging.getLogger(__name__)

router = APIRouter()


# Pydantic 모델 (API 응답용)
class BlueOceanKeywordResponse(BaseModel):
    """블루오션 키워드 응답"""
    keyword: str
    search_volume: int = Field(description="월간 검색량")
    blog_ratio: float = Field(description="블로그탭 비율 (0-1)")
    top10_avg_score: float = Field(description="상위10 평균 점수")
    top10_min_score: float = Field(description="상위10 최저 점수")
    influencer_count: int = Field(description="상위10 중 인플루언서 수")
    bos_score: float = Field(description="블루오션 스코어 (0-100)")
    bos_rating: str = Field(description="블루오션 등급 (gold/silver/bronze/iron/blocked)")
    entry_chance: str = Field(description="진입 가능성")
    entry_percentage: int = Field(description="진입 확률 (%)")
    my_score_gap: Optional[float] = Field(None, description="내 블로그와의 점수 차이")
    recommended_content_length: int = Field(description="권장 글자수")
    recommended_image_count: int = Field(description="권장 사진수")
    tips: List[str] = Field(description="공략 팁")

    class Config:
        from_attributes = True


class BlueOceanAnalysisResponse(BaseModel):
    """블루오션 분석 응답"""
    success: bool = True
    main_keyword: str
    my_blog_score: Optional[float] = None
    my_blog_level: Optional[int] = None
    keywords: List[BlueOceanKeywordResponse]
    gold_keywords: List[BlueOceanKeywordResponse] = Field(description="황금 키워드 (BOS 80+)")
    silver_keywords: List[BlueOceanKeywordResponse] = Field(description="좋은 기회 (BOS 60-79)")
    total_analyzed: int
    analysis_summary: dict
    error: Optional[str] = None


class QuickBOSRequest(BaseModel):
    """빠른 BOS 계산 요청"""
    keywords: List[str] = Field(description="분석할 키워드 목록", max_length=10)
    my_blog_id: Optional[str] = None


class QuickBOSResponse(BaseModel):
    """빠른 BOS 계산 응답"""
    success: bool = True
    results: List[dict]
    error: Optional[str] = None


@router.post("/analyze", response_model=BlueOceanAnalysisResponse)
async def analyze_blue_ocean_keywords(
    keyword: str = Query(..., description="메인 키워드"),
    my_blog_id: Optional[str] = Query(None, description="내 블로그 ID (맞춤 분석용)"),
    expand: bool = Query(True, description="연관 키워드 확장 여부"),
    min_search_volume: int = Query(100, ge=0, description="최소 검색량"),
    max_keywords: int = Query(20, ge=1, le=50, description="최대 키워드 수"),
    user: dict = Depends(get_current_user_optional)
):
    """
    🌊 블루오션 키워드 종합 분석

    검색량이 높고 경쟁이 낮은 블루오션 키워드를 발굴합니다.

    **블루오션 스코어(BOS) 계산:**
    - 검색량 점수 × 블로그 노출 비율 / 경쟁도

    **등급:**
    - 🏆 Gold (80+): 황금 키워드 - 빠른 선점 추천
    - 💎 Silver (60-79): 좋은 기회 - 적극 도전
    - 🥉 Bronze (40-59): 도전 가능 - 콘텐츠 품질로 승부
    - ⚫ Iron (20-39): 경쟁 있음 - 차별화 필요
    - 🚫 Blocked (0-19): 레드오션 - 피하는 것 추천

    **내 블로그 맞춤 분석:**
    - my_blog_id를 제공하면 진입 가능성 계산
    - 상위 진입까지 필요한 점수 안내
    - 맞춤 공략 팁 제공
    """
    logger.info(f"Blue ocean analysis: keyword={keyword}, my_blog={my_blog_id}")

    try:
        result = await blue_ocean_service.analyze_blue_ocean(
            main_keyword=keyword,
            my_blog_id=my_blog_id,
            expand=expand,
            min_search_volume=min_search_volume,
            max_keywords=max_keywords
        )

        # dataclass를 dict로 변환
        keywords_dict = []
        for kw in result.keywords:
            keywords_dict.append({
                "keyword": kw.keyword,
                "search_volume": kw.search_volume,
                "blog_ratio": kw.blog_ratio,
                "top10_avg_score": kw.top10_avg_score,
                "top10_min_score": kw.top10_min_score,
                "influencer_count": kw.influencer_count,
                "bos_score": kw.bos_score,
                "bos_rating": kw.bos_rating.value,
                "entry_chance": kw.entry_chance.value,
                "entry_percentage": kw.entry_percentage,
                "my_score_gap": kw.my_score_gap,
                "recommended_content_length": kw.recommended_content_length,
                "recommended_image_count": kw.recommended_image_count,
                "tips": kw.tips
            })

        gold_dict = [d for d in keywords_dict if d["bos_rating"] == "gold"]
        silver_dict = [d for d in keywords_dict if d["bos_rating"] == "silver"]

        return BlueOceanAnalysisResponse(
            success=True,
            main_keyword=result.main_keyword,
            my_blog_score=result.my_blog_score,
            my_blog_level=result.my_blog_level,
            keywords=keywords_dict,
            gold_keywords=gold_dict,
            silver_keywords=silver_dict,
            total_analyzed=result.total_analyzed,
            analysis_summary=result.analysis_summary
        )

    except Exception as e:
        logger.error(f"Error in blue ocean analysis: {e}")
        return BlueOceanAnalysisResponse(
            success=False,
            main_keyword=keyword,
            keywords=[],
            gold_keywords=[],
            silver_keywords=[],
            total_analyzed=0,
            analysis_summary={},
            error=str(e)
        )


@router.get("/quick-score")
async def quick_bos_score(
    keyword: str = Query(..., description="키워드"),
    search_volume: int = Query(..., ge=0, description="월간 검색량"),
    top10_avg_score: float = Query(..., ge=0, le=100, description="상위10 평균 점수"),
    blog_ratio: float = Query(0.5, ge=0, le=1, description="블로그탭 비율"),
    influencer_ratio: float = Query(0.0, ge=0, le=1, description="인플루언서 비율")
):
    """
    ⚡ 빠른 BOS 스코어 계산

    이미 데이터가 있는 경우 빠르게 BOS만 계산합니다.
    """
    bos_score = blue_ocean_service.calculate_bos(
        search_volume=search_volume,
        blog_ratio=blog_ratio,
        top10_avg_score=top10_avg_score,
        influencer_ratio=influencer_ratio
    )

    bos_rating = blue_ocean_service.get_bos_rating(bos_score)

    return {
        "success": True,
        "keyword": keyword,
        "bos_score": bos_score,
        "bos_rating": bos_rating.value,
        "rating_emoji": {
            "gold": "🏆",
            "silver": "💎",
            "bronze": "🥉",
            "iron": "⚫",
            "blocked": "🚫"
        }.get(bos_rating.value, "❓")
    }


@router.get("/entry-chance")
async def calculate_entry_chance(
    my_score: float = Query(..., ge=0, le=100, description="내 블로그 점수"),
    top10_avg_score: float = Query(..., ge=0, le=100, description="상위10 평균 점수"),
    top10_min_score: float = Query(..., ge=0, le=100, description="상위10 최저 점수"),
    influencer_count: int = Query(0, ge=0, le=10, description="상위10 중 인플루언서 수")
):
    """
    📊 진입 가능성 계산

    내 블로그 점수와 경쟁 상황을 기반으로 상위 진입 가능성을 계산합니다.
    """
    entry_chance, entry_percentage = blue_ocean_service.calculate_entry_chance(
        my_score=my_score,
        top10_avg_score=top10_avg_score,
        top10_min_score=top10_min_score,
        influencer_count=influencer_count
    )

    score_gap = my_score - top10_min_score

    return {
        "success": True,
        "entry_chance": entry_chance.value,
        "entry_percentage": entry_percentage,
        "score_gap": round(score_gap, 1),
        "recommendation": (
            "✅ 상위 진입 가능성이 높습니다!" if entry_percentage >= 70
            else "🎯 도전해볼 만 합니다." if entry_percentage >= 50
            else "⚠️ 블로그 점수를 높인 후 도전하세요." if entry_percentage >= 20
            else "❌ 경쟁이 너무 치열합니다."
        )
    }


@router.get("/recommend")
async def recommend_keywords_for_me(
    category: str = Query(..., description="카테고리 키워드 (예: 다이어트, 피부과)"),
    my_blog_id: str = Query(..., description="내 블로그 ID"),
    limit: int = Query(10, ge=1, le=30, description="추천 키워드 수")
):
    """
    🎯 내 블로그 맞춤 키워드 추천

    내 블로그 점수에 맞는 블루오션 키워드를 추천합니다.
    - 진입 가능성 70% 이상인 키워드만 추천
    - BOS 점수가 높은 순서로 정렬
    """
    logger.info(f"Recommend keywords for blog: {my_blog_id}, category: {category}")

    try:
        result = await blue_ocean_service.analyze_blue_ocean(
            main_keyword=category,
            my_blog_id=my_blog_id,
            expand=True,
            min_search_volume=100,
            max_keywords=50
        )

        # 진입 가능성 70% 이상인 키워드만 필터링
        recommended = [
            {
                "keyword": kw.keyword,
                "search_volume": kw.search_volume,
                "bos_score": kw.bos_score,
                "bos_rating": kw.bos_rating.value,
                "entry_percentage": kw.entry_percentage,
                "tips": kw.tips[:2]  # 팁 2개만
            }
            for kw in result.keywords
            if kw.entry_percentage >= 50  # 50% 이상만 추천
        ][:limit]

        return {
            "success": True,
            "my_blog_score": result.my_blog_score,
            "my_blog_level": result.my_blog_level,
            "category": category,
            "total_found": len(recommended),
            "recommended_keywords": recommended,
            "message": (
                f"🎯 {len(recommended)}개의 추천 키워드를 찾았습니다!"
                if recommended
                else "😢 현재 점수에 맞는 키워드를 찾지 못했습니다. 블로그 점수를 높여보세요."
            )
        }

    except Exception as e:
        logger.error(f"Error recommending keywords: {e}")
        return {
            "success": False,
            "error": str(e)
        }


@router.get("/health")
async def health_check():
    """헬스 체크"""
    return {
        "status": "healthy",
        "service": "blue-ocean-keywords"
    }
