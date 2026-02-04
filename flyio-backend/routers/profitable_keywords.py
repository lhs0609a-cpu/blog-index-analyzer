"""
Profitable Keywords Router - 수익성 키워드 API

내 블로그 레벨로 1위 가능한 돈되는 키워드 조회
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime

from services.profitable_keyword_service import (
    get_profitable_keyword_service,
    ProfitableKeyword,
    WinnableKeywordsResponse
)
from database.subscription_db import get_user_subscription
from services.blog_analyzer import get_blog_level_from_score

router = APIRouter(prefix="/profitable-keywords", tags=["Profitable Keywords"])


# ========== Response Models ==========

class KeywordResponse(BaseModel):
    """키워드 응답"""
    id: int
    keyword: str
    category: str

    # 검색 데이터
    monthly_search_volume: int
    search_trend: float

    # 경쟁 데이터
    rank1_blog_level: int
    competition_score: int

    # 내 블로그 기준
    my_level: int
    level_gap: int
    win_probability: int

    # 수익 데이터
    estimated_monthly_revenue: int
    ad_revenue: int
    sponsorship_revenue: int

    # 기회
    opportunity_score: float
    opportunity_tags: List[str]
    golden_time: Optional[str]

    last_updated: Optional[str]


class CategorySummary(BaseModel):
    """카테고리 요약"""
    category: str
    count: int
    total_revenue: int
    avg_competition: Optional[float]
    locked: bool = False


class WinnableKeywordsApiResponse(BaseModel):
    """1위 가능 키워드 API 응답"""
    success: bool = True
    blog_id: str
    blog_level: int

    # 요약
    total_winnable: int = Field(..., description="전체 1위 가능 키워드 수")
    total_potential_revenue: int = Field(..., description="전체 잠재 수익")
    showing: int = Field(..., description="현재 보여주는 개수")
    plan_limit: int = Field(..., description="플랜 제한")
    upgrade_to_see: int = Field(..., description="업그레이드하면 볼 수 있는 추가 개수")

    # 키워드 목록
    keywords: List[KeywordResponse]

    # 카테고리 요약
    categories: List[CategorySummary]

    message: str = ""


class OpportunityKeyword(BaseModel):
    """기회 키워드"""
    keyword: str
    category: str
    opportunity_type: str
    opportunity_reason: str
    win_probability: int
    estimated_monthly_revenue: int
    urgency: str


class OpportunitiesResponse(BaseModel):
    """실시간 기회 응답"""
    success: bool = True
    blog_level: int
    opportunities: List[OpportunityKeyword]


# ========== API Endpoints ==========

@router.get("/my-keywords", response_model=WinnableKeywordsApiResponse)
async def get_my_winnable_keywords(
    blog_id: str = Query(..., description="블로그 ID"),
    user_id: Optional[int] = Query(None, description="사용자 ID (플랜 확인용)"),
    category: Optional[str] = Query(None, description="카테고리 필터"),
    sort_by: str = Query("revenue", description="정렬 기준: revenue, probability, search_volume, opportunity"),
    min_search_volume: int = Query(500, ge=100, description="최소 검색량"),
    min_win_probability: int = Query(70, ge=0, le=100, description="최소 1위 확률"),
    offset: int = Query(0, ge=0, description="페이지 오프셋")
):
    """
    내 블로그로 1위 가능한 돈되는 키워드 조회

    플랜별 제한:
    - Free: 10개/월
    - Basic: 50개/월
    - Pro: 200개/월
    - Business: 무제한

    정렬 옵션:
    - revenue: 예상 수익순 (기본)
    - probability: 1위 확률순
    - search_volume: 검색량순
    - opportunity: 기회 점수순
    """
    try:
        # 블로그 레벨 조회 (실제로는 blog_analyzer에서 가져와야 함)
        # 여기서는 간단히 처리
        from services.blog_analyzer import analyze_blog
        blog_data = await analyze_blog(blog_id)

        if not blog_data:
            raise HTTPException(status_code=404, detail="블로그를 찾을 수 없습니다")

        blog_level = blog_data.get('level', 5)

        # 사용자 플랜 조회
        user_plan = 'free'
        if user_id:
            subscription = await get_user_subscription(user_id)
            if subscription:
                user_plan = subscription.get('plan', 'free')

        # 서비스 호출
        service = get_profitable_keyword_service()
        result = await service.get_winnable_keywords_for_user(
            blog_id=blog_id,
            blog_level=blog_level,
            user_id=user_id,
            user_plan=user_plan,
            category=category,
            sort_by=sort_by,
            min_search_volume=min_search_volume,
            min_win_probability=min_win_probability,
            offset=offset
        )

        # 응답 변환
        keywords = [
            KeywordResponse(
                id=kw.id,
                keyword=kw.keyword,
                category=kw.category,
                monthly_search_volume=kw.monthly_search_volume,
                search_trend=kw.search_trend,
                rank1_blog_level=kw.rank1_blog_level,
                competition_score=kw.competition_score,
                my_level=kw.my_level,
                level_gap=kw.level_gap,
                win_probability=kw.win_probability,
                estimated_monthly_revenue=kw.estimated_monthly_revenue,
                ad_revenue=kw.ad_revenue,
                sponsorship_revenue=kw.sponsorship_revenue,
                opportunity_score=kw.opportunity_score,
                opportunity_tags=kw.opportunity_tags,
                golden_time=kw.golden_time,
                last_updated=kw.last_updated
            )
            for kw in result.keywords
        ]

        categories = [
            CategorySummary(
                category=cat['category'],
                count=cat['count'],
                total_revenue=cat['total_revenue'] or 0,
                avg_competition=cat.get('avg_competition'),
                locked=(user_plan == 'free' and cat['category'] != (category or keywords[0].category if keywords else None))
            )
            for cat in result.categories
        ]

        return WinnableKeywordsApiResponse(
            blog_id=result.blog_id,
            blog_level=result.blog_level,
            total_winnable=result.total_winnable,
            total_potential_revenue=result.total_potential_revenue,
            showing=result.showing,
            plan_limit=result.plan_limit,
            upgrade_to_see=result.upgrade_to_see,
            keywords=keywords,
            categories=categories,
            message=f"레벨 {blog_level} 블로그로 {result.total_winnable}개 키워드에서 1위 가능"
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"키워드 조회 중 오류: {str(e)}")


@router.get("/opportunities", response_model=OpportunitiesResponse)
async def get_opportunity_keywords(
    blog_id: str = Query(..., description="블로그 ID"),
    limit: int = Query(10, ge=1, le=20, description="조회 개수")
):
    """
    실시간 기회 키워드 조회

    다음 조건의 키워드를 반환:
    - 현재 1위 블로그가 48시간+ 비활성
    - 검색량 급상승 (+50% 이상)
    """
    try:
        # 블로그 레벨 조회
        from services.blog_analyzer import analyze_blog
        blog_data = await analyze_blog(blog_id)

        if not blog_data:
            raise HTTPException(status_code=404, detail="블로그를 찾을 수 없습니다")

        blog_level = blog_data.get('level', 5)

        service = get_profitable_keyword_service()
        opportunities = await service.get_opportunity_keywords(
            blog_id=blog_id,
            blog_level=blog_level,
            limit=limit
        )

        return OpportunitiesResponse(
            blog_level=blog_level,
            opportunities=[
                OpportunityKeyword(**opp) for opp in opportunities
            ]
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"기회 키워드 조회 중 오류: {str(e)}")


@router.get("/categories", response_model=List[CategorySummary])
async def get_category_summary(
    blog_id: str = Query(..., description="블로그 ID")
):
    """
    카테고리별 1위 가능 키워드 요약
    """
    try:
        from services.blog_analyzer import analyze_blog
        blog_data = await analyze_blog(blog_id)

        if not blog_data:
            raise HTTPException(status_code=404, detail="블로그를 찾을 수 없습니다")

        blog_level = blog_data.get('level', 5)

        service = get_profitable_keyword_service()
        categories = await service.get_category_opportunities(blog_level)

        return [
            CategorySummary(
                category=cat['category'],
                count=cat['count'],
                total_revenue=cat['total_revenue'] or 0,
                avg_competition=cat.get('avg_competition')
            )
            for cat in categories
        ]

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"카테고리 조회 중 오류: {str(e)}")


@router.post("/sync-from-search")
async def sync_keyword_from_search(
    keyword: str = Query(..., description="키워드"),
    category: str = Query(..., description="카테고리"),
    search_volume: int = Query(..., description="월간 검색량"),
    rank1_level: int = Query(..., description="현재 1위 레벨"),
    rank1_score: float = Query(0, description="현재 1위 점수")
):
    """
    검색 결과에서 키워드 데이터 동기화

    사용자가 키워드 검색할 때 자동으로 호출되어 키워드 풀 업데이트
    """
    try:
        service = get_profitable_keyword_service()
        await service.sync_keyword_from_search(
            keyword=keyword,
            category=category,
            search_volume=search_volume,
            rank1_level=rank1_level,
            rank1_score=rank1_score
        )

        return {"success": True, "message": f"키워드 '{keyword}' 동기화 완료"}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"동기화 중 오류: {str(e)}")


@router.post("/import-batch")
async def import_keywords_batch(
    keywords: List[dict]
):
    """
    키워드 대량 임포트 (관리자용)

    Body:
    ```json
    [
        {"keyword": "강남맛집", "category": "맛집", "search_volume": 12000},
        {"keyword": "홍대카페", "category": "카페", "search_volume": 8500}
    ]
    ```
    """
    try:
        service = get_profitable_keyword_service()
        result = await service.import_keywords_batch(keywords)

        return {
            "success": True,
            "imported": result['imported'],
            "total": result['total'],
            "failed": result['failed'],
            "message": f"{result['imported']}개 키워드 임포트 완료"
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"임포트 중 오류: {str(e)}")
