"""
블루오션 키워드 발굴 API 라우터

프리미엄 기능: 블루오션 키워드 분석

2024-12 업데이트:
- 안전 키워드 선별 시스템 추가
- 전국/지역 키워드 차별화
- 안전 마진 적용
"""
import asyncio
import logging
from typing import Optional, List
from fastapi import APIRouter, Query, HTTPException, Depends
from pydantic import BaseModel, Field

from services.keyword_analysis_service import keyword_analysis_service

from services.blue_ocean_service import (
    blue_ocean_service,
    BlueOceanAnalysis,
    BlueOceanKeyword,
    BOSRating,
    EntryChance
)
from services.safe_keyword_selector import (
    safe_keyword_selector,
    analyze_keyword_for_blog,
    SafetyGrade,
    RecommendationType,
    KeywordScope
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

    # 2024-12 추가: 안전 분석
    keyword_scope: str = Field("전국", description="키워드 범위 (지역/광역/전국)")
    raw_predicted_rank: int = Field(10, description="원본 예측 순위")
    safety_margin: int = Field(0, description="적용된 안전 마진")
    adjusted_rank: int = Field(10, description="보정된 순위 (실제 예측)")
    safety_score: float = Field(0.0, description="안전 지수 (0-100)")
    safety_grade: str = Field("보통", description="안전 등급")
    recommendation_type: str = Field("조건부추천", description="추천 유형")
    warnings: List[str] = Field(default_factory=list, description="경고 메시지")

    class Config:
        from_attributes = True


class SafetyAnalysisResponse(BaseModel):
    """안전 분석 응답"""
    keyword: str
    scope: str = Field(description="키워드 범위 (지역/광역/전국)")
    predicted_rank: dict = Field(description="예측 순위 정보")
    scores: dict = Field(description="점수 분석")
    competition: dict = Field(description="경쟁 분석")
    safety: dict = Field(description="안전 지수")
    recommendation: dict = Field(description="추천 정보")
    search_volume: int = 0
    warnings: List[str] = Field(default_factory=list)


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

        # dataclass를 dict로 변환 (안전 분석 결과 포함)
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
                "tips": kw.tips,
                # 2024-12: 안전 분석 결과
                "keyword_scope": kw.keyword_scope,
                "raw_predicted_rank": kw.raw_predicted_rank,
                "safety_margin": kw.safety_margin,
                "adjusted_rank": kw.adjusted_rank,
                "safety_score": kw.safety_score,
                "safety_grade": kw.safety_grade,
                "recommendation_type": kw.recommendation_type,
                "warnings": kw.warnings
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


@router.get("/safety-analyze")
async def analyze_keyword_safety(
    keyword: str = Query(..., description="분석할 키워드"),
    my_blog_id: str = Query(..., description="내 블로그 ID"),
    user: dict = Depends(get_current_user_optional)
):
    """
    🛡️ 키워드 안전성 분석

    키워드가 내 블로그에 "안전하게 상위노출"될 수 있는지 분석합니다.

    **분석 항목:**
    - 키워드 범위: 지역/광역/전국 분류
    - 예측 순위: 원본 예측 + 안전 마진 적용
    - 안전 지수: 종합 안전 점수 (0-100)
    - 추천 유형: 강력추천/추천/조건부추천/비추천/회피권장

    **핵심 규칙 (피드백 반영):**
    - 전국 키워드 7위 이하 예측 → 실제 상위노출 불가능
    - 지역 키워드는 8위까지 허용
    - 안전 마진을 적용하여 보수적으로 판정
    """
    from routers.blogs import search_keyword_with_tabs, analyze_blog

    logger.info(f"Safety analysis: keyword={keyword}, blog={my_blog_id}")

    try:
        # 1. 내 블로그 점수 조회
        my_blog_data = await analyze_blog(my_blog_id)
        if not my_blog_data or not my_blog_data.index:
            raise HTTPException(status_code=400, detail="블로그 정보를 가져올 수 없습니다")

        my_blog_score = my_blog_data.index.total_score

        # 2. 상위 블로그 분석
        search_result = await search_keyword_with_tabs(keyword, limit=10, analyze_content=True)

        if not search_result or not search_result.results:
            raise HTTPException(status_code=400, detail="검색 결과를 가져올 수 없습니다")

        # 3. 상위 10개 통계 수집
        scores = []
        influencer_count = 0

        for blog in search_result.results[:10]:
            if blog.index:
                scores.append(blog.index.total_score)
            if blog.is_influencer:
                influencer_count += 1

        if not scores:
            raise HTTPException(status_code=400, detail="블로그 점수 정보가 없습니다")

        # 4. 검색량 조회 (옵션)
        search_volume = 0
        try:
            analysis_result = await keyword_analysis_service.analyze_keyword(
                keyword=keyword,
                expand_related=False,
                max_keywords=1
            )
            if analysis_result.keywords:
                search_volume = analysis_result.keywords[0].monthly_total_search
        except Exception as e:
            logger.warning(f"Failed to get search volume: {e}")

        # 5. 안전성 분석
        analysis_dict = analyze_keyword_for_blog(
            keyword=keyword,
            blog_score=my_blog_score,
            top10_scores=scores,
            search_volume=search_volume,
            influencer_count=influencer_count
        )

        return {
            "success": True,
            "my_blog_score": my_blog_score,
            **analysis_dict
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in safety analysis: {e}")
        return {
            "success": False,
            "error": str(e)
        }


@router.get("/safe-keywords")
async def get_safe_keywords(
    category: str = Query(..., description="카테고리 키워드 (예: 다이어트)"),
    my_blog_id: str = Query(..., description="내 블로그 ID"),
    min_safety_score: float = Query(60.0, ge=0, le=100, description="최소 안전 점수"),
    limit: int = Query(10, ge=1, le=30, description="반환할 키워드 수"),
    user: dict = Depends(get_current_user_optional)
):
    """
    🎯 안전한 키워드 추천

    내 블로그 점수 기준으로 "안전하게 상위노출"될 수 있는 키워드만 선별합니다.

    **선별 기준:**
    - 안전 지수 60점 이상
    - 추천 유형: 강력추천 또는 추천
    - 전국 키워드는 6위 이내 예측만 포함

    **반환 정보:**
    - 안전 점수 높은 순으로 정렬
    - 각 키워드별 안전성 분석 결과 포함
    """
    from routers.blogs import search_keyword_with_tabs, analyze_blog

    logger.info(f"Safe keywords: category={category}, blog={my_blog_id}")

    try:
        # 1. 내 블로그 점수 조회
        my_blog_data = await analyze_blog(my_blog_id)
        if not my_blog_data or not my_blog_data.index:
            raise HTTPException(status_code=400, detail="블로그 정보를 가져올 수 없습니다")

        my_blog_score = my_blog_data.index.total_score

        # 2. 키워드 확장
        analysis_result = await keyword_analysis_service.analyze_keyword(
            keyword=category,
            expand_related=True,
            min_search_volume=100,
            max_keywords=50
        )

        if not analysis_result.keywords:
            return {
                "success": True,
                "my_blog_score": my_blog_score,
                "category": category,
                "total_found": 0,
                "safe_keywords": [],
                "message": "해당 카테고리에서 키워드를 찾지 못했습니다."
            }

        # 3. 각 키워드 안전성 분석
        keywords_data = []
        semaphore = asyncio.Semaphore(3)

        async def analyze_single(kw_data):
            async with semaphore:
                try:
                    search_result = await search_keyword_with_tabs(
                        kw_data.keyword, limit=10, analyze_content=True
                    )

                    if not search_result or not search_result.results:
                        return None

                    scores = []
                    influencer_count = 0

                    for blog in search_result.results[:10]:
                        if blog.index:
                            scores.append(blog.index.total_score)
                        if blog.is_influencer:
                            influencer_count += 1

                    if not scores:
                        return None

                    return {
                        'keyword': kw_data.keyword,
                        'top10_scores': scores,
                        'search_volume': kw_data.monthly_total_search,
                        'influencer_count': influencer_count
                    }
                except Exception as e:
                    logger.warning(f"Failed to analyze {kw_data.keyword}: {e}")
                    return None

        # 병렬 분석
        import asyncio
        tasks = [analyze_single(kw) for kw in analysis_result.keywords[:30]]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, dict):
                keywords_data.append(result)

        # 4. 안전한 키워드 필터링
        safe_keywords = safe_keyword_selector.filter_safe_keywords(
            keywords_data=keywords_data,
            my_score=my_blog_score,
            min_safety_score=min_safety_score,
            min_search_volume=100
        )

        # 5. 추천 유형 필터 (강력추천/추천만)
        recommended = [
            kw for kw in safe_keywords
            if kw.recommendation in [RecommendationType.STRONGLY_RECOMMEND, RecommendationType.RECOMMEND]
        ][:limit]

        # 6. 응답 구성
        safe_keywords_response = [
            {
                "keyword": kw.keyword,
                "scope": kw.scope.value,
                "safety_score": kw.safety_score,
                "safety_grade": kw.safety_grade.value,
                "recommendation": kw.recommendation.value,
                "predicted_rank": {
                    "raw": kw.raw_predicted_rank,
                    "adjusted": kw.adjusted_rank,
                    "safety_margin": kw.safety_margin
                },
                "search_volume": kw.search_volume,
                "score_gap": kw.score_gap,
                "tips": kw.tips[:2],
                "warnings": kw.warnings,
                # 5위 보장 여부
                "is_guaranteed_top5": kw.is_guaranteed_top5,
                "guaranteed_top5_reasons": kw.guaranteed_top5_reasons
            }
            for kw in recommended
        ]

        return {
            "success": True,
            "my_blog_score": my_blog_score,
            "category": category,
            "total_analyzed": len(keywords_data),
            "total_found": len(recommended),
            "safe_keywords": safe_keywords_response,
            "message": (
                f"🎯 {len(recommended)}개의 안전한 키워드를 찾았습니다!"
                if recommended
                else "😢 현재 점수에 맞는 안전한 키워드를 찾지 못했습니다. 지역 키워드를 시도해보세요."
            )
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting safe keywords: {e}")
        return {
            "success": False,
            "error": str(e)
        }


@router.get("/guaranteed-top5")
async def get_guaranteed_top5_keywords(
    category: str = Query(..., description="카테고리 키워드 (예: 다이어트)"),
    my_blog_id: str = Query(..., description="내 블로그 ID"),
    min_search_volume: int = Query(100, ge=0, description="최소 검색량"),
    limit: int = Query(10, ge=1, le=30, description="반환할 키워드 수"),
    user: dict = Depends(get_current_user_optional)
):
    """
    🏆 5위 이내 보장 키워드 추천

    매우 보수적인 조건으로 **확실히 상위 5위 안에 들어갈** 키워드만 선별합니다.

    **5위 보장 조건 (모두 만족해야 함):**
    - 지역 키워드: 보정 순위 3위 이내 또는 원본 순위 1-2위
    - 광역 키워드: 보정 순위 2위 이내 또는 원본 순위 1위
    - 전국 키워드: 보정 순위 1위만 (가장 보수적)
    - 안전 점수 75점 이상
    - 점수 여유 +5점 이상
    - 인플루언서 2명 이하
    - 70점 이상 고점자 5명 이하

    **사용 시나리오:**
    - 확실한 성과가 필요할 때
    - 시간 투자 대비 효율을 극대화하고 싶을 때
    - 블로그 초기에 자신감 있는 시작이 필요할 때
    """
    from routers.blogs import search_keyword_with_tabs, analyze_blog

    logger.info(f"Guaranteed top5 keywords: category={category}, blog={my_blog_id}")

    try:
        # 1. 내 블로그 점수 조회
        my_blog_data = await analyze_blog(my_blog_id)
        if not my_blog_data or not my_blog_data.index:
            raise HTTPException(status_code=400, detail="블로그 정보를 가져올 수 없습니다")

        my_blog_score = my_blog_data.index.total_score

        # 2. 키워드 확장
        from services.keyword_analysis_service import keyword_analysis_service
        analysis_result = await keyword_analysis_service.analyze_keyword(
            keyword=category,
            expand_related=True,
            min_search_volume=min_search_volume,
            max_keywords=50
        )

        if not analysis_result.keywords:
            return {
                "success": True,
                "my_blog_score": my_blog_score,
                "category": category,
                "total_analyzed": 0,
                "total_found": 0,
                "guaranteed_keywords": [],
                "message": "해당 카테고리에서 키워드를 찾지 못했습니다."
            }

        # 3. 각 키워드 분석 (병렬)
        keywords_data = []
        semaphore = asyncio.Semaphore(3)

        async def analyze_single(kw_data):
            async with semaphore:
                try:
                    search_result = await search_keyword_with_tabs(
                        kw_data.keyword, limit=10, analyze_content=True
                    )

                    if not search_result or not search_result.results:
                        return None

                    scores = []
                    influencer_count = 0

                    for blog in search_result.results[:10]:
                        if blog.index:
                            scores.append(blog.index.total_score)
                        if blog.is_influencer:
                            influencer_count += 1

                    if not scores:
                        return None

                    return {
                        'keyword': kw_data.keyword,
                        'top10_scores': scores,
                        'search_volume': kw_data.monthly_total_search,
                        'influencer_count': influencer_count
                    }
                except Exception as e:
                    logger.warning(f"Failed to analyze {kw_data.keyword}: {e}")
                    return None

        tasks = [analyze_single(kw) for kw in analysis_result.keywords[:30]]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        for result in results:
            if isinstance(result, dict):
                keywords_data.append(result)

        # 4. 5위 보장 키워드 필터링
        guaranteed_keywords = safe_keyword_selector.get_guaranteed_top5_keywords(
            keywords_data=keywords_data,
            my_score=my_blog_score,
            min_search_volume=min_search_volume
        )

        # 5. 응답 구성
        guaranteed_response = [
            {
                "keyword": kw.keyword,
                "scope": kw.scope.value,
                "is_guaranteed_top5": kw.is_guaranteed_top5,
                "guaranteed_reasons": kw.guaranteed_top5_reasons,
                "safety_score": kw.safety_score,
                "safety_grade": kw.safety_grade.value,
                "predicted_rank": {
                    "raw": kw.raw_predicted_rank,
                    "adjusted": kw.adjusted_rank,
                    "safety_margin": kw.safety_margin
                },
                "search_volume": kw.search_volume,
                "score_gap": kw.score_gap,
                "competition": {
                    "influencer_count": kw.influencer_count,
                    "high_scorer_count": kw.high_scorer_count,
                    "top10_std": kw.top10_std
                },
                "tips": kw.tips[:2],
                "warnings": kw.warnings
            }
            for kw in guaranteed_keywords[:limit]
        ]

        return {
            "success": True,
            "my_blog_score": my_blog_score,
            "category": category,
            "total_analyzed": len(keywords_data),
            "total_found": len(guaranteed_keywords),
            "guaranteed_keywords": guaranteed_response,
            "conditions": {
                "description": "5위 이내 보장을 위한 조건",
                "items": [
                    "지역: 보정 3위 이내 또는 원본 1-2위",
                    "광역: 보정 2위 이내 또는 원본 1위",
                    "전국: 보정 1위만",
                    "안전 점수 75점 이상",
                    "점수 여유 +5점 이상",
                    "인플루언서 2명 이하",
                    "고점자(70+) 5명 이하"
                ]
            },
            "message": (
                f"🏆 {len(guaranteed_keywords)}개의 5위 보장 키워드를 찾았습니다!"
                if guaranteed_keywords
                else "😢 현재 점수에 맞는 5위 보장 키워드를 찾지 못했습니다. 지역 키워드나 더 세부적인 키워드를 시도해보세요."
            )
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting guaranteed top5 keywords: {e}")
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
