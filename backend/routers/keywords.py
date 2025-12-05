"""
키워드 관련 API 라우터
연관 검색어, 검색량 정보 제공
"""
from fastapi import APIRouter, HTTPException, Query
from typing import Optional
import logging

from services.naver_ad_api import get_naver_ad_api

router = APIRouter(prefix="/api/keywords", tags=["keywords"])
logger = logging.getLogger(__name__)


@router.get("/related")
async def get_related_keywords(
    keyword: str = Query(..., description="검색할 키워드"),
    show_detail: int = Query(1, description="상세 정보 표시 (0: 간단, 1: 상세)")
):
    """
    연관 검색어 및 검색량 정보 조회

    - **keyword**: 검색할 키워드
    - **show_detail**: 상세 정보 표시 여부 (0 또는 1)

    Returns:
        - keyword: 검색한 키워드
        - total_count: 연관 키워드 개수
        - related_keywords: 연관 키워드 리스트
            - keyword: 키워드
            - monthly_pc_search: PC 월간 검색수
            - monthly_mobile_search: 모바일 월간 검색수
            - monthly_total_search: 총 월간 검색수
            - monthly_avg_pc_click: PC 월간 평균 클릭수
            - monthly_avg_mobile_click: 모바일 월간 평균 클릭수
            - monthly_avg_pc_ctr: PC 월간 평균 클릭률
            - monthly_avg_mobile_ctr: 모바일 월간 평균 클릭률
            - competition_level: 광고 경쟁 정도
            - competition_index: 경쟁 지수
    """
    try:
        logger.info(f"연관 키워드 조회 요청: {keyword}")

        naver_ad = get_naver_ad_api()

        if not naver_ad.enabled:
            raise HTTPException(
                status_code=503,
                detail="네이버 광고 API가 설정되지 않았습니다. NAVER_AD_API_KEY, NAVER_AD_SECRET_KEY, NAVER_AD_CUSTOMER_ID를 환경변수에 설정하세요."
            )

        result = await naver_ad.get_related_keywords(keyword, show_detail)

        if not result:
            raise HTTPException(
                status_code=404,
                detail="연관 키워드를 찾을 수 없습니다."
            )

        return {
            "success": True,
            "data": result
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"연관 키워드 조회 중 오류: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"연관 키워드 조회 중 오류가 발생했습니다: {str(e)}"
        )


@router.get("/stats")
async def get_keyword_stats(
    keyword: str = Query(..., description="검색할 키워드")
):
    """
    특정 키워드의 검색량 통계 조회

    - **keyword**: 검색할 키워드

    Returns:
        - keyword: 검색한 키워드
        - stats: 키워드 통계 정보
        - exact_match: 정확히 일치하는 키워드인지 여부
    """
    try:
        logger.info(f"키워드 통계 조회 요청: {keyword}")

        naver_ad = get_naver_ad_api()

        if not naver_ad.enabled:
            raise HTTPException(
                status_code=503,
                detail="네이버 광고 API가 설정되지 않았습니다."
            )

        result = await naver_ad.get_keyword_stats(keyword)

        if not result:
            raise HTTPException(
                status_code=404,
                detail="키워드 통계를 찾을 수 없습니다."
            )

        return {
            "success": True,
            "data": result
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"키워드 통계 조회 중 오류: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"키워드 통계 조회 중 오류가 발생했습니다: {str(e)}"
        )
