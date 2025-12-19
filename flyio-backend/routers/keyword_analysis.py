"""
키워드 분석 시스템 - API 라우터
"""
import logging
from typing import Optional
from fastapi import APIRouter, Query, HTTPException

from models.keyword_analysis import (
    KeywordAnalysisRequest, KeywordClassifyRequest, KeywordExpandRequest,
    KeywordAnalysisResponse, TabRatioResponse, KeywordClassifyResponse,
    KeywordExpandResponse, CompetitionResponse, KeywordHierarchy, SubKeyword
)
from services.keyword_analysis_service import keyword_analysis_service
from database.keyword_analysis_db import (
    get_sub_keywords, save_keyword_hierarchy,
    get_competition_trend, clear_expired_cache
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/analyze", response_model=KeywordAnalysisResponse)
async def analyze_keyword(request: KeywordAnalysisRequest):
    """
    키워드 종합 분석

    - 연관 키워드 조회 및 확장
    - 검색량/경쟁도 데이터
    - 키워드 유형 자동 분류
    - 상위 블로그 경쟁도 분석
    - 탭별 비율 조회
    """
    logger.info(f"Analyzing keyword: {request.keyword}")

    result = await keyword_analysis_service.analyze_keyword(
        keyword=request.keyword,
        expand_related=request.expand_related,
        min_search_volume=request.min_search_volume,
        max_keywords=request.max_keywords,
        my_blog_id=request.my_blog_id
    )

    return result


@router.get("/{keyword}/tab-ratio", response_model=TabRatioResponse)
async def get_tab_ratio(keyword: str):
    """
    네이버 탭별 검색 비율 조회

    - 블로그, 카페, 지식인, 웹문서 비율
    - 각 탭별 검색 결과 수
    """
    logger.info(f"Fetching tab ratio for: {keyword}")

    try:
        tab_ratio = await keyword_analysis_service.get_tab_ratio(keyword)

        total = tab_ratio.blog_count + tab_ratio.cafe_count + tab_ratio.kin_count + tab_ratio.web_count

        return TabRatioResponse(
            success=True,
            keyword=keyword,
            total_results=total,
            tab_ratio=tab_ratio
        )
    except Exception as e:
        logger.error(f"Error fetching tab ratio: {e}")
        return TabRatioResponse(
            success=False,
            keyword=keyword,
            error=str(e)
        )


@router.post("/classify", response_model=KeywordClassifyResponse)
async def classify_keywords(request: KeywordClassifyRequest):
    """
    키워드 유형 분류

    유형:
    - 정보형: ~란, 원인, 증상, 효과
    - 증상형: 아프다, 통증, 저림
    - 병원탐색형: 병원, 추천, 잘하는
    - 비용검사형: 비용, 가격, 보험
    - 지역형: 강남, 분당 + 병원
    - 광역형: 서울, 부산 + 병원
    """
    logger.info(f"Classifying {len(request.keywords)} keywords")

    try:
        classified = keyword_analysis_service.classifier.classify_batch(request.keywords)

        # 유형별 분포
        type_dist = {}
        for kw in classified:
            type_name = kw.keyword_type.value
            type_dist[type_name] = type_dist.get(type_name, 0) + 1

        return KeywordClassifyResponse(
            success=True,
            classified=classified,
            type_distribution=type_dist
        )
    except Exception as e:
        logger.error(f"Error classifying keywords: {e}")
        return KeywordClassifyResponse(
            success=False,
            error=str(e)
        )


@router.post("/expand", response_model=KeywordExpandResponse)
async def expand_keywords(request: KeywordExpandRequest):
    """
    키워드 확장 (메인 → 세부 구조)

    - 네이버 광고 API 연관 키워드 조회
    - DB에 저장된 계층 구조 활용
    - 새로운 키워드 자동 학습
    """
    logger.info(f"Expanding keyword: {request.main_keyword}, depth: {request.depth}")

    try:
        # 1. 연관 키워드 조회
        related = await keyword_analysis_service._fetch_related_keywords(request.main_keyword)

        # 2. 필터링
        filtered = [
            kw for kw in related
            if kw.monthly_total_search >= request.min_search_volume
        ]

        # 3. 분류 및 계층 구조 생성
        sub_keywords = []
        for kw in filtered:
            kw_type, confidence = keyword_analysis_service.classifier.classify(kw.keyword)

            sub_keywords.append(SubKeyword(
                keyword=kw.keyword,
                search_volume=kw.monthly_total_search,
                keyword_type=kw_type,
                related=[]  # 깊이 2 이상일 때 재귀적으로 확장 가능
            ))

            # DB에 저장 (학습)
            save_keyword_hierarchy(
                main_keyword=request.main_keyword,
                sub_keyword=kw.keyword,
                search_volume=kw.monthly_total_search,
                keyword_type=kw_type.value,
                depth=1
            )

        # 4. 기존 DB에서 추가 세부 키워드 조회
        db_subs = get_sub_keywords(request.main_keyword)
        existing_keywords = {s.keyword for s in sub_keywords}

        for db_sub in db_subs:
            if db_sub['sub_keyword'] not in existing_keywords:
                sub_keywords.append(SubKeyword(
                    keyword=db_sub['sub_keyword'],
                    search_volume=db_sub.get('search_volume', 0),
                    keyword_type=db_sub.get('keyword_type', '미분류'),
                    related=[]
                ))

        # 검색량 순 정렬
        sub_keywords.sort(key=lambda x: x.search_volume, reverse=True)

        hierarchy = KeywordHierarchy(
            main_keyword=request.main_keyword,
            sub_keywords=sub_keywords[:50],  # 최대 50개
            total_search_volume=sum(s.search_volume for s in sub_keywords)
        )

        return KeywordExpandResponse(
            success=True,
            hierarchy=hierarchy,
            total_keywords=len(sub_keywords)
        )

    except Exception as e:
        logger.error(f"Error expanding keywords: {e}")
        return KeywordExpandResponse(
            success=False,
            error=str(e)
        )


@router.get("/{keyword}/competition", response_model=CompetitionResponse)
async def get_competition(
    keyword: str,
    my_blog_id: Optional[str] = Query(None, description="내 블로그 ID (비교용)")
):
    """
    키워드 경쟁도 분석

    - 상위 10개 블로그 평균 지수 (C-Rank, D.I.A.)
    - 진입 난이도 (쉬움/도전가능/어려움/매우어려움)
    - 권장 블로그 점수
    - 내 블로그 비교 (선택적)
    """
    logger.info(f"Analyzing competition for: {keyword}")

    try:
        analysis = await keyword_analysis_service._analyze_competition(keyword, my_blog_id)

        return CompetitionResponse(
            success=True,
            analysis=analysis
        )
    except Exception as e:
        logger.error(f"Error analyzing competition: {e}")
        return CompetitionResponse(
            success=False,
            error=str(e)
        )


@router.get("/{keyword}/trend")
async def get_competition_trend(
    keyword: str,
    days: int = Query(30, ge=7, le=90, description="조회 기간 (일)")
):
    """
    키워드 경쟁도 트렌드 조회

    - 최근 N일간의 경쟁도 변화
    - 상위 블로그 점수 추이
    """
    logger.info(f"Fetching trend for: {keyword}, days: {days}")

    try:
        trend = get_competition_trend(keyword, days)

        return {
            "success": True,
            "keyword": keyword,
            "days": days,
            "data_points": len(trend),
            "trend": trend
        }
    except Exception as e:
        logger.error(f"Error fetching trend: {e}")
        return {
            "success": False,
            "keyword": keyword,
            "error": str(e)
        }


@router.post("/cache/clear")
async def clear_cache():
    """만료된 캐시 삭제"""
    try:
        deleted = clear_expired_cache()
        return {
            "success": True,
            "deleted_entries": deleted
        }
    except Exception as e:
        logger.error(f"Error clearing cache: {e}")
        return {
            "success": False,
            "error": str(e)
        }


@router.get("/health")
async def health_check():
    """헬스 체크"""
    return {
        "status": "healthy",
        "service": "keyword-analysis"
    }
