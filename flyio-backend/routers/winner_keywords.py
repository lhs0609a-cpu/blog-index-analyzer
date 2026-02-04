"""
Winner Keywords Router - 1위 보장 키워드 API

핵심 엔드포인트:
- GET /daily-winners: 오늘의 1위 가능 키워드 (Pro 전용)
- GET /quick-winners: 빠른 추천 (대시보드 위젯용)
- POST /analyze: 특정 키워드의 1위 확률 분석
"""

from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field

from services.winner_keyword_service import (
    get_winner_keyword_service,
    WinnerKeyword,
    DailyWinnerAnalysis,
    WinProbability,
    GoldenTime,
    GoldenTimeSlot
)
from database.subscription_db import check_feature_access

router = APIRouter(prefix="/winner-keywords", tags=["Winner Keywords"])


# ========== Response Models ==========

class GoldenTimeResponse(BaseModel):
    """골든타임 응답"""
    slot: str
    start_hour: int
    end_hour: int
    day_of_week: Optional[str] = None
    reason: str
    confidence: float

    @classmethod
    def from_golden_time(cls, gt: GoldenTime) -> "GoldenTimeResponse":
        return cls(
            slot=gt.slot.value,
            start_hour=gt.start_hour,
            end_hour=gt.end_hour,
            day_of_week=gt.day_of_week,
            reason=gt.reason,
            confidence=gt.confidence
        )


class WinnerKeywordResponse(BaseModel):
    """1위 가능 키워드 응답"""
    keyword: str

    # 1위 확률
    win_probability: int = Field(..., ge=0, le=100, description="1위 확률 (%)")
    win_grade: str = Field(..., description="확률 등급 (guaranteed, very_high, high, moderate, low)")

    # 기본 정보
    search_volume: int = Field(..., description="월간 검색량")
    current_rank1_level: int = Field(..., description="현재 1위 블로그 레벨")
    my_level: int = Field(..., description="내 블로그 레벨")
    level_gap: int = Field(..., description="레벨 차이 (양수면 내가 높음)")

    # 경쟁 정보
    top10_avg_score: float
    top10_min_score: float
    influencer_count: int
    high_scorer_count: int

    # 골든타임
    golden_time: Optional[GoldenTimeResponse] = None

    # 점수
    bos_score: float
    safety_score: float

    # 팁
    tips: List[str]
    why_winnable: List[str] = Field(..., description="왜 1위 가능한지 이유")

    @classmethod
    def from_winner_keyword(cls, wk: WinnerKeyword) -> "WinnerKeywordResponse":
        return cls(
            keyword=wk.keyword,
            win_probability=wk.win_probability,
            win_grade=wk.win_grade.value,
            search_volume=wk.search_volume,
            current_rank1_level=wk.current_rank1_level,
            my_level=wk.my_level,
            level_gap=wk.level_gap,
            top10_avg_score=wk.top10_avg_score,
            top10_min_score=wk.top10_min_score,
            influencer_count=wk.influencer_count,
            high_scorer_count=wk.high_scorer_count,
            golden_time=GoldenTimeResponse.from_golden_time(wk.golden_time) if wk.golden_time else None,
            bos_score=wk.bos_score,
            safety_score=wk.safety_score,
            tips=wk.tips,
            why_winnable=wk.why_winnable
        )


class DailyWinnersResponse(BaseModel):
    """일일 1위 가능 키워드 분석 응답"""
    success: bool = True
    my_blog_id: str
    my_level: int
    my_score: float
    analysis_date: datetime

    # 키워드 목록
    guaranteed_keywords: List[WinnerKeywordResponse] = Field(..., description="95%+ 확률 키워드")
    high_chance_keywords: List[WinnerKeywordResponse] = Field(..., description="70-94% 확률 키워드")
    moderate_keywords: List[WinnerKeywordResponse] = Field(..., description="50-69% 확률 키워드")

    # 요약
    total_analyzed: int
    total_winnable: int
    best_keyword: Optional[WinnerKeywordResponse] = None

    # 메시지
    message: str = ""


class QuickWinnersResponse(BaseModel):
    """빠른 추천 응답 (대시보드 위젯용)"""
    success: bool = True
    my_blog_id: str
    my_level: int
    keywords: List[WinnerKeywordResponse]
    message: str = ""


# ========== API Endpoints ==========

@router.get("/daily-winners", response_model=DailyWinnersResponse)
async def get_daily_winners(
    my_blog_id: str = Query(..., description="내 블로그 ID"),
    user_id: Optional[int] = Query(None, description="사용자 ID (플랜 확인용)"),
    categories: Optional[str] = Query(None, description="분석할 카테고리 (쉼표 구분)"),
    min_search_volume: int = Query(500, ge=100, le=10000, description="최소 월간 검색량"),
    max_keywords: int = Query(10, ge=1, le=30, description="카테고리당 최대 키워드 수")
):
    """
    오늘의 1위 가능 키워드 분석

    Pro 플랜 이상에서 사용 가능합니다.

    - **my_blog_id**: 분석 대상 블로그 ID
    - **categories**: 분석할 카테고리 키워드 (기본: 맛집, 카페, 여행, 리뷰, 뷰티)
    - **min_search_volume**: 최소 월간 검색량 (기본: 500)
    - **max_keywords**: 반환할 최대 키워드 수 (기본: 10)

    Returns:
        - guaranteed_keywords: 95%+ 확률로 1위 가능한 키워드
        - high_chance_keywords: 70-94% 확률 키워드
        - moderate_keywords: 50-69% 확률 키워드
    """

    # 플랜 확인 (Pro 이상)
    if user_id:
        access = await check_feature_access(user_id, "winner_keywords")
        if not access.get("allowed", False):
            raise HTTPException(
                status_code=403,
                detail="이 기능은 Pro 플랜 이상에서 사용 가능합니다."
            )

    # 카테고리 파싱
    if categories:
        category_list = [c.strip() for c in categories.split(",") if c.strip()]
    else:
        category_list = ["맛집", "카페", "여행", "리뷰", "뷰티"]

    try:
        service = get_winner_keyword_service()
        result = await service.find_winner_keywords(
            my_blog_id=my_blog_id,
            category_keywords=category_list,
            min_search_volume=min_search_volume,
            max_keywords=max_keywords,
            min_win_probability=50
        )

        # 응답 변환
        return DailyWinnersResponse(
            my_blog_id=result.my_blog_id,
            my_level=result.my_level,
            my_score=result.my_score,
            analysis_date=result.analysis_date,
            guaranteed_keywords=[WinnerKeywordResponse.from_winner_keyword(k) for k in result.guaranteed_keywords],
            high_chance_keywords=[WinnerKeywordResponse.from_winner_keyword(k) for k in result.high_chance_keywords],
            moderate_keywords=[WinnerKeywordResponse.from_winner_keyword(k) for k in result.moderate_keywords],
            total_analyzed=result.total_analyzed,
            total_winnable=result.total_winnable,
            best_keyword=WinnerKeywordResponse.from_winner_keyword(result.best_keyword) if result.best_keyword else None,
            message=f"총 {result.total_analyzed}개 키워드 분석, {result.total_winnable}개 1위 가능"
        )

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"분석 중 오류 발생: {str(e)}")


@router.get("/quick-winners", response_model=QuickWinnersResponse)
async def get_quick_winners(
    my_blog_id: str = Query(..., description="내 블로그 ID"),
    limit: int = Query(5, ge=1, le=10, description="반환할 키워드 수")
):
    """
    빠른 1위 가능 키워드 추천 (대시보드 위젯용)

    무료 플랜: 주 1개
    Pro 플랜: 매일 5개

    - **my_blog_id**: 분석 대상 블로그 ID
    - **limit**: 반환할 키워드 수 (기본: 5)
    """
    try:
        service = get_winner_keyword_service()
        keywords = await service.get_quick_winners(
            my_blog_id=my_blog_id,
            limit=limit
        )

        # 블로그 레벨 (첫 번째 키워드에서 추출)
        my_level = keywords[0].my_level if keywords else 0

        return QuickWinnersResponse(
            my_blog_id=my_blog_id,
            my_level=my_level,
            keywords=[WinnerKeywordResponse.from_winner_keyword(k) for k in keywords],
            message=f"{len(keywords)}개 1위 가능 키워드 발견" if keywords else "1위 가능 키워드를 찾지 못했습니다"
        )

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"분석 중 오류 발생: {str(e)}")


@router.get("/analyze-win-chance")
async def analyze_win_chance(
    keyword: str = Query(..., description="분석할 키워드"),
    my_blog_id: str = Query(..., description="내 블로그 ID")
):
    """
    특정 키워드의 1위 확률 분석

    - **keyword**: 분석할 키워드
    - **my_blog_id**: 내 블로그 ID

    Returns:
        - win_probability: 1위 확률 (%)
        - win_grade: 확률 등급
        - golden_time: 최적 발행 시간
        - tips: 공략 팁
    """
    try:
        service = get_winner_keyword_service()

        # 단일 키워드 분석
        result = await service.find_winner_keywords(
            my_blog_id=my_blog_id,
            category_keywords=[keyword],
            min_search_volume=0,  # 검색량 제한 없음
            max_keywords=1,
            min_win_probability=0  # 확률 제한 없음
        )

        # 결과에서 해당 키워드 찾기
        all_keywords = (
            result.guaranteed_keywords +
            result.high_chance_keywords +
            result.moderate_keywords
        )

        target_keyword = None
        for k in all_keywords:
            if k.keyword.lower() == keyword.lower():
                target_keyword = k
                break

        if not target_keyword:
            # 키워드를 찾지 못한 경우 기본 응답
            return {
                "success": False,
                "keyword": keyword,
                "message": "해당 키워드의 상위 노출 분석에 실패했습니다. 다른 키워드를 시도해보세요."
            }

        return {
            "success": True,
            "keyword": target_keyword.keyword,
            "win_probability": target_keyword.win_probability,
            "win_grade": target_keyword.win_grade.value,
            "search_volume": target_keyword.search_volume,
            "current_rank1_level": target_keyword.current_rank1_level,
            "my_level": target_keyword.my_level,
            "level_gap": target_keyword.level_gap,
            "golden_time": {
                "slot": target_keyword.golden_time.slot.value,
                "start_hour": target_keyword.golden_time.start_hour,
                "end_hour": target_keyword.golden_time.end_hour,
                "day_of_week": target_keyword.golden_time.day_of_week,
                "reason": target_keyword.golden_time.reason
            } if target_keyword.golden_time else None,
            "tips": target_keyword.tips,
            "why_winnable": target_keyword.why_winnable,
            "message": f"1위 확률 {target_keyword.win_probability}% - {target_keyword.win_grade.value}"
        }

    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"분석 중 오류 발생: {str(e)}")
