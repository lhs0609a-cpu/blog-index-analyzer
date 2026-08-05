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

router = APIRouter(tags=["Winner Keywords"])

# 2026-08-05 재작업: 실시간 SERP 수집 경로를 걷어내고 worker 사전계산 캐시를 읽는다.
# (이전 구조는 요청 1건이 /health 조차 30초로 밀어 서비스를 마비시켰다)
import logging
logger = logging.getLogger(__name__)


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
        # quick-winners 와 같은 캐시 경로를 쓴다. 확률 구간으로만 나눠 담는다.
        service = get_winner_keyword_service()
        result = await service.match_from_cache(
            my_blog_id=my_blog_id,
            limit=max_keywords * 3,
            min_win_probability=50,
            min_search_volume=min_search_volume,
        )

        if result["status"] == "no_blog":
            raise HTTPException(
                status_code=404,
                detail="먼저 블로그를 분석해 주세요. 내 레벨을 알아야 1위 가능 여부를 계산할 수 있습니다.",
            )

        winners = result.get("keywords", [])
        guaranteed = [k for k in winners if k.win_probability >= 95][:max_keywords]
        high = [k for k in winners if 70 <= k.win_probability < 95][:max_keywords]
        moderate = [k for k in winners if 50 <= k.win_probability < 70][:max_keywords]

        if result["status"] in ("cache_empty", "no_topic_match"):
            message = "이 블로그 주제의 키워드를 수집하는 중입니다. 잠시 후 다시 확인해 주세요."
        else:
            message = f"총 {result.get('analyzed', 0)}개 키워드 분석, {len(winners)}개 1위 가능"

        return DailyWinnersResponse(
            my_blog_id=my_blog_id,
            my_level=result.get("my_level", 0),
            my_score=result.get("my_score", 0.0),
            analysis_date=datetime.now(),
            guaranteed_keywords=[WinnerKeywordResponse.from_winner_keyword(k) for k in guaranteed],
            high_chance_keywords=[WinnerKeywordResponse.from_winner_keyword(k) for k in high],
            moderate_keywords=[WinnerKeywordResponse.from_winner_keyword(k) for k in moderate],
            total_analyzed=result.get("analyzed", 0),
            total_winnable=len(winners),
            best_keyword=WinnerKeywordResponse.from_winner_keyword(winners[0]) if winners else None,
            message=message,
        )

    except HTTPException:
        # 위에서 낸 404 를 아래 광범위 except 가 삼키면 500 으로 둔갑한다
        raise
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("daily-winners 실패")
        raise HTTPException(status_code=500, detail=f"분석 중 오류 발생: {str(e)}")


@router.get("/cache-status")
async def get_cache_status():
    """추천 캐시 상태 — '준비 중'과 '결과 없음'을 구분하는 근거"""
    import asyncio as _asyncio
    from database.winner_keyword_cache_db import cache_summary
    try:
        return await _asyncio.to_thread(cache_summary)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/precompute-now")
async def trigger_precompute(
    categories: int = Query(1, ge=1, le=3, description="이번에 갱신할 카테고리 수"),
    category: Optional[str] = Query(None, description="이 주제 하나만 강제 측정"),
):
    """측정을 지금 한 번 돌린다 (별도 프로세스). 운영/검증용.

    API 프로세스에서 직접 돌리지 않는다 — 그게 2026-08-05 장애의 원인이었다.
    """
    import asyncio as _asyncio
    import os as _os
    import sys as _sys

    root = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
    cmd = [_sys.executable, "-m", "scripts.precompute_winner_keywords"]
    if category:
        cmd += ["--category", category]
    else:
        cmd += ["--categories", str(categories)]
    try:
        proc = await _asyncio.create_subprocess_exec(
            *cmd, cwd=root,
            stdout=_asyncio.subprocess.DEVNULL,
            stderr=_asyncio.subprocess.DEVNULL,
            env={**_os.environ, "SCHEDULERS_DISABLED": "1"},
        )
        return {"started": True, "pid": proc.pid,
                "target": category or f"{categories}개 자동 선택",
                "note": "진행 상황은 /cache-status 의 runs 로 확인"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"실행 실패: {e}")


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
    # 2026-08-05 재작업: SERP 측정은 worker 가 미리 해 둔 캐시에서 읽고,
    # 여기서는 '내 레벨로 이길 수 있나'만 계산한다. 네트워크 호출 0회.
    # (이전 구조는 요청 때마다 5개 카테고리를 실시간으로 긁어 API 전체를 마비시켰다)
    try:
        service = get_winner_keyword_service()
        result = await service.match_from_cache(my_blog_id=my_blog_id, limit=limit)

        if result["status"] == "no_blog":
            raise HTTPException(
                status_code=404,
                detail="먼저 블로그를 분석해 주세요. 내 레벨을 알아야 1위 가능 여부를 계산할 수 있습니다.",
            )

        if result["status"] in ("cache_empty", "no_topic_match"):
            # '못 찾았다'가 아니라 '아직 재는 중'이다. 두 가지를 같은 문장으로
            # 말하면 사용자는 자기 블로그가 가망 없다고 오해한다.
            if result["status"] == "no_topic_match":
                terms = ", ".join(result.get("topic_terms", [])[:3])
                msg = (f"'{terms}' 주제의 키워드를 아직 측정하지 못했습니다. "
                       "수집 목록에 넣었으니 잠시 후 다시 확인해 주세요.")
            else:
                msg = "키워드 경쟁 데이터를 수집하는 중입니다. 잠시 후 다시 확인해 주세요."
            return QuickWinnersResponse(
                my_blog_id=my_blog_id,
                my_level=result.get("my_level", 0),
                keywords=[],
                message=msg,
            )

        keywords = result["keywords"]
        return QuickWinnersResponse(
            my_blog_id=my_blog_id,
            my_level=result.get("my_level", 0),
            keywords=[WinnerKeywordResponse.from_winner_keyword(k) for k in keywords],
            message=(
                f"{len(keywords)}개 1위 가능 키워드 발견"
                if keywords
                else f"분석한 {result.get('analyzed', 0)}개 키워드 중 지금 1위가 가능한 것은 없었습니다"
            ),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("quick-winners 실패")
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
