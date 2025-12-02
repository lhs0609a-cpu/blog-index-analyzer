"""
종합 분석 API 라우터
모든 고급 분석 기능을 제공하는 엔드포인트
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
import logging
from datetime import datetime
from pydantic import BaseModel

from services.comprehensive_blog_analyzer import get_comprehensive_blog_analyzer

logger = logging.getLogger(__name__)

router = APIRouter()


class ComprehensiveAnalysisRequest(BaseModel):
    """종합 분석 요청"""
    blog_id: str
    include_post_details: bool = True
    include_search_ranking: bool = True
    include_visual_analysis: bool = False  # Selenium은 선택적
    include_ai_analysis: bool = True
    track_engagement: bool = True
    max_posts_to_analyze: int = 5


@router.post("/analyze-comprehensive")
async def analyze_blog_comprehensive(request: ComprehensiveAnalysisRequest):
    """
    블로그 종합 분석 (모든 고급 기능 활용)

    **기능:**
    - 기본 RSS 크롤링
    - 고급 통계 수집 (이웃, 방문자, 개설일)
    - 포스트 상세 분석 (이미지, 동영상, 텍스트, 광고)
    - 검색 순위 추적 (VIEW 탭 진입 여부)
    - 시각적 레이아웃 분석 (Selenium, 선택적)
    - AI 콘텐츠 품질 분석 (문법, 독창성, 경험 정보)
    - 참여도 추적 기록
    - 개선된 점수 계산 (보너스 점수 포함)
    """
    try:
        logger.info(f"종합 분석 요청: {request.blog_id}")

        # 분석 옵션
        options = {
            "include_post_details": request.include_post_details,
            "include_search_ranking": request.include_search_ranking,
            "include_visual_analysis": request.include_visual_analysis,
            "include_ai_analysis": request.include_ai_analysis,
            "track_engagement": request.track_engagement,
            "max_posts_to_analyze": request.max_posts_to_analyze
        }

        # 종합 분석 실행
        analyzer = get_comprehensive_blog_analyzer(
            use_selenium=request.include_visual_analysis,
            ai_api_key=None  # 환경변수에서 자동 로드
        )

        result = analyzer.analyze_blog_comprehensive(request.blog_id, options)

        if result.get("error"):
            raise HTTPException(status_code=500, detail=result.get("message", "분석 실패"))

        return {
            "success": True,
            "blog_id": request.blog_id,
            "result": result,
            "timestamp": datetime.utcnow().isoformat()
        }

    except ValueError as e:
        logger.warning(f"종합 분석 실패 (ValueError): {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"종합 분석 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"분석 실패: {str(e)}")


@router.get("/engagement-trend/{blog_id}")
async def get_engagement_trend(
    blog_id: str,
    days: int = Query(default=30, ge=1, le=365, description="조회할 일수 (1-365)")
):
    """
    블로그 참여도 추이 조회

    **반환 데이터:**
    - 일별 방문자, 이웃, 포스트, 좋아요, 댓글
    - 증감률 통계
    - 추세 방향
    """
    try:
        from services.engagement_tracker import get_engagement_tracker

        tracker = get_engagement_tracker()
        trend_data = tracker.get_engagement_trend(blog_id, days=days)

        if trend_data.get("error"):
            raise HTTPException(status_code=500, detail=trend_data.get("error"))

        return trend_data

    except Exception as e:
        logger.error(f"참여도 추이 조회 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"조회 실패: {str(e)}")


@router.get("/engagement-compare/{blog_id}")
async def compare_engagement(
    blog_id: str,
    compare_days: int = Query(default=7, ge=1, le=30, description="비교 기간 (일)")
):
    """
    기간별 참여도 비교

    **비교 내용:**
    - 최근 N일 vs 이전 N일
    - 방문자, 참여도 점수 증감률
    """
    try:
        from services.engagement_tracker import get_engagement_tracker

        tracker = get_engagement_tracker()
        comparison = tracker.compare_engagement(blog_id, compare_days=compare_days)

        if comparison.get("error"):
            raise HTTPException(status_code=500, detail=comparison.get("error"))

        return comparison

    except Exception as e:
        logger.error(f"참여도 비교 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"비교 실패: {str(e)}")


@router.get("/search-rankings/{blog_id}")
async def get_search_rankings(blog_id: str):
    """
    블로그의 주요 키워드 검색 순위 확인

    **기능:**
    - 자동 키워드 추출
    - VIEW 탭, 통합검색, 블로그 탭 순위
    - 노출도 점수 계산
    """
    try:
        from services.search_rank_tracker import get_search_rank_tracker
        from services.naver_blog_crawler import get_naver_blog_crawler

        # 블로그 크롤링하여 키워드 추출
        crawler = get_naver_blog_crawler()
        blog_data = crawler.crawl_blog(blog_id)
        posts = blog_data.get("posts", [])

        # 키워드 추출
        tracker = get_search_rank_tracker()
        keywords = tracker.extract_main_keywords_from_posts(posts, top_n=10)

        if not keywords:
            return {
                "message": "키워드를 추출할 수 없습니다",
                "blog_id": blog_id
            }

        # 순위 추적
        ranking_result = tracker.track_keyword_rankings(blog_id, keywords, max_check_rank=50)

        # 노출도 분석
        visibility = tracker.analyze_search_visibility(ranking_result)

        return {
            "blog_id": blog_id,
            "keywords": ranking_result.get("keywords", {}),
            "summary": ranking_result.get("summary", {}),
            "visibility_analysis": visibility
        }

    except Exception as e:
        logger.error(f"검색 순위 조회 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"조회 실패: {str(e)}")


@router.get("/ai-content-quality/{blog_id}")
async def get_ai_content_quality(
    blog_id: str,
    max_posts: int = Query(default=5, ge=1, le=10, description="분석할 포스트 수")
):
    """
    AI 기반 콘텐츠 품질 분석

    **분석 항목:**
    - 문법 정확성
    - 독창성
    - 경험 정보 포함 여부
    - 신뢰성 (출처 명시)
    - 가독성
    """
    try:
        from services.ai_content_analyzer import get_ai_content_analyzer
        from services.naver_blog_crawler import get_naver_blog_crawler

        # 포스트 가져오기
        crawler = get_naver_blog_crawler()
        blog_data = crawler.crawl_blog(blog_id)
        posts = blog_data.get("posts", [])[:max_posts]

        # AI 분석
        analyzer = get_ai_content_analyzer()
        post_data = [
            {"title": p.get("title", ""), "content": p.get("content", "")}
            for p in posts
        ]

        result = analyzer.analyze_multiple_posts(post_data, max_posts=max_posts)

        return {
            "blog_id": blog_id,
            **result
        }

    except Exception as e:
        logger.error(f"AI 콘텐츠 분석 오류: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"분석 실패: {str(e)}")


@router.get("/test/comprehensive")
async def test_comprehensive_endpoint():
    """테스트 엔드포인트"""
    return {
        "message": "종합 분석 API가 정상 작동 중입니다!",
        "version": "3.0.0 (Comprehensive)",
        "features": [
            "포스트 상세 분석",
            "검색 순위 추적",
            "Selenium 시각적 분석",
            "AI 콘텐츠 품질 분석",
            "참여도 추적",
            "개선된 점수 계산"
        ],
        "timestamp": datetime.utcnow().isoformat()
    }
