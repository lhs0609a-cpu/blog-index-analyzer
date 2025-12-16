"""
네이버 광고 자동 최적화 API 라우터
"""
from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import logging
import asyncio

from services.naver_ad_service import (
    NaverAdOptimizer,
    BidStrategy,
    get_optimizer
)
from database.naver_ad_db import (
    init_naver_ad_tables,
    get_optimization_settings,
    save_optimization_settings,
    get_bid_history,
    get_bid_changes_summary,
    get_keyword_performance,
    get_performance_summary,
    get_excluded_keywords,
    restore_excluded_keyword,
    get_discovered_keywords,
    update_discovered_keyword_status,
    get_daily_reports,
    get_optimization_logs,
    get_dashboard_stats,
    save_bid_change,
    save_excluded_keyword,
    save_discovered_keywords,
    save_optimization_log
)

logger = logging.getLogger(__name__)
router = APIRouter()

# 테이블 초기화
try:
    init_naver_ad_tables()
except Exception as e:
    logger.error(f"Failed to initialize naver ad tables: {e}")


# ============ Pydantic 모델 ============

class OptimizationSettingsRequest(BaseModel):
    strategy: str = Field(default="balanced", description="입찰 전략")
    target_roas: float = Field(default=300, description="목표 ROAS (%)")
    target_position: int = Field(default=3, description="목표 순위")
    max_bid_change_ratio: float = Field(default=0.2, description="최대 입찰 변경폭")
    min_bid: int = Field(default=70, description="최소 입찰가")
    max_bid: int = Field(default=100000, description="최대 입찰가")
    min_ctr: float = Field(default=0.01, description="최소 CTR")
    max_cost_no_conv: int = Field(default=50000, description="전환없이 최대 비용")
    min_quality_score: int = Field(default=4, description="최소 품질지수")
    evaluation_days: int = Field(default=7, description="평가 기간 (일)")
    optimization_interval: int = Field(default=60, description="최적화 주기 (초)")
    is_auto_optimization: bool = Field(default=False, description="자동 최적화 활성화")
    blacklist_keywords: List[str] = Field(default=[], description="제외할 키워드 패턴")
    core_terms: List[str] = Field(default=[], description="핵심 키워드")


class KeywordDiscoveryRequest(BaseModel):
    seed_keywords: List[str] = Field(..., description="시드 키워드 목록")
    ad_group_id: Optional[str] = Field(None, description="추가할 광고그룹 ID")
    max_keywords: int = Field(default=50, description="최대 키워드 수")
    min_search_volume: int = Field(default=100, description="최소 검색량")
    max_competition: float = Field(default=0.85, description="최대 경쟁도")
    auto_add: bool = Field(default=False, description="자동 추가 여부")


class ManualBidUpdateRequest(BaseModel):
    keyword_id: str = Field(..., description="키워드 ID")
    new_bid: int = Field(..., description="새 입찰가")
    reason: Optional[str] = Field(default="수동 변경", description="변경 사유")


class BulkKeywordAddRequest(BaseModel):
    ad_group_id: str = Field(..., description="광고그룹 ID")
    keywords: List[str] = Field(..., description="키워드 목록")
    default_bid: int = Field(default=100, description="기본 입찰가")


# ============ 대시보드 ============

@router.get("/dashboard")
async def get_dashboard(user_id: int = Query(..., description="사용자 ID")):
    """대시보드 통계 조회"""
    try:
        stats = get_dashboard_stats(user_id)
        return {
            "success": True,
            "data": stats
        }
    except Exception as e:
        logger.error(f"Dashboard error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/dashboard/realtime")
async def get_realtime_status(user_id: int = Query(..., description="사용자 ID")):
    """실시간 최적화 상태"""
    try:
        optimizer = get_optimizer()
        status = await optimizer.get_optimization_status()

        # 최근 입찰 변경
        recent_changes = get_bid_history(user_id, limit=10)

        return {
            "success": True,
            "data": {
                **status,
                "recent_changes": recent_changes
            }
        }
    except Exception as e:
        logger.error(f"Realtime status error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ 최적화 설정 ============

@router.get("/settings")
async def get_settings(user_id: int = Query(..., description="사용자 ID")):
    """최적화 설정 조회"""
    settings = get_optimization_settings(user_id)

    if not settings:
        # 기본 설정 생성
        settings = save_optimization_settings(user_id, {})

    return {
        "success": True,
        "data": settings
    }


@router.post("/settings")
async def update_settings(
    request: OptimizationSettingsRequest,
    user_id: int = Query(..., description="사용자 ID")
):
    """최적화 설정 저장"""
    try:
        # 전략 유효성 검사
        valid_strategies = [s.value for s in BidStrategy]
        if request.strategy not in valid_strategies:
            raise HTTPException(
                status_code=400,
                detail=f"유효하지 않은 전략입니다. 가능한 값: {valid_strategies}"
            )

        settings = save_optimization_settings(user_id, request.dict())

        # 옵티마이저 설정 업데이트
        optimizer = get_optimizer()
        optimizer.bid_optimizer.set_strategy(
            strategy=BidStrategy(request.strategy),
            target_roas=request.target_roas,
            target_position=request.target_position,
            max_bid_change_ratio=request.max_bid_change_ratio,
            min_bid=request.min_bid,
            max_bid=request.max_bid
        )

        optimizer.exclusion.set_thresholds(
            min_ctr=request.min_ctr,
            max_cost_no_conv=request.max_cost_no_conv,
            min_quality_score=request.min_quality_score,
            evaluation_days=request.evaluation_days
        )

        optimizer.discovery.set_filters(
            blacklist=request.blacklist_keywords,
            core_terms=request.core_terms
        )

        save_optimization_log(user_id, "settings_update", "최적화 설정이 변경되었습니다", request.dict())

        return {
            "success": True,
            "message": "설정이 저장되었습니다",
            "data": settings
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Settings update error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ 자동 최적화 제어 ============

@router.post("/optimization/start")
async def start_optimization(
    background_tasks: BackgroundTasks,
    user_id: int = Query(..., description="사용자 ID"),
    ad_group_ids: Optional[List[str]] = Query(None, description="광고그룹 ID 목록")
):
    """자동 최적화 시작"""
    try:
        optimizer = get_optimizer()

        if optimizer.is_running:
            return {
                "success": False,
                "message": "이미 최적화가 실행 중입니다"
            }

        # 설정 업데이트
        save_optimization_settings(user_id, {"is_auto_optimization": True})

        # 백그라운드에서 최적화 실행
        background_tasks.add_task(optimizer.start_auto_optimization, ad_group_ids)

        save_optimization_log(user_id, "optimization_start", "자동 최적화가 시작되었습니다")

        return {
            "success": True,
            "message": "자동 최적화가 시작되었습니다",
            "interval_seconds": optimizer.optimization_interval
        }
    except Exception as e:
        logger.error(f"Start optimization error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/optimization/stop")
async def stop_optimization(user_id: int = Query(..., description="사용자 ID")):
    """자동 최적화 중지"""
    try:
        optimizer = get_optimizer()
        optimizer.stop_auto_optimization()

        save_optimization_settings(user_id, {"is_auto_optimization": False})
        save_optimization_log(user_id, "optimization_stop", "자동 최적화가 중지되었습니다")

        return {
            "success": True,
            "message": "자동 최적화가 중지되었습니다"
        }
    except Exception as e:
        logger.error(f"Stop optimization error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/optimization/run-once")
async def run_optimization_once(
    user_id: int = Query(..., description="사용자 ID"),
    ad_group_ids: Optional[List[str]] = Query(None, description="광고그룹 ID 목록")
):
    """입찰 최적화 1회 실행"""
    try:
        optimizer = get_optimizer()

        # 설정 로드 및 적용
        settings = get_optimization_settings(user_id)
        if settings:
            optimizer.bid_optimizer.set_strategy(
                strategy=BidStrategy(settings.get("strategy", "balanced")),
                target_roas=settings.get("target_roas", 300),
                target_position=settings.get("target_position", 3)
            )

        # 최적화 실행
        changes = await optimizer.bid_optimizer.optimize_all_keywords(ad_group_ids)

        # 변경 내역 저장
        for change in changes:
            save_bid_change(
                user_id=user_id,
                keyword_id=change.keyword_id,
                keyword_text=change.keyword,
                old_bid=change.old_bid,
                new_bid=change.new_bid,
                reason=change.reason,
                strategy=settings.get("strategy", "balanced") if settings else "balanced"
            )

        save_optimization_log(
            user_id, "optimization_run",
            f"입찰 최적화 완료: {len(changes)}개 키워드 변경",
            {"changes_count": len(changes)}
        )

        return {
            "success": True,
            "message": f"{len(changes)}개 키워드의 입찰가가 최적화되었습니다",
            "changes": [
                {
                    "keyword_id": c.keyword_id,
                    "keyword": c.keyword,
                    "old_bid": c.old_bid,
                    "new_bid": c.new_bid,
                    "reason": c.reason
                }
                for c in changes
            ]
        }
    except Exception as e:
        logger.error(f"Run optimization error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ 키워드 발굴 ============

@router.post("/keywords/discover")
async def discover_keywords(
    request: KeywordDiscoveryRequest,
    user_id: int = Query(..., description="사용자 ID")
):
    """연관 키워드 발굴"""
    try:
        optimizer = get_optimizer()

        # 필터 설정
        settings = get_optimization_settings(user_id)
        optimizer.discovery.set_filters(
            min_search_volume=request.min_search_volume,
            max_competition=request.max_competition,
            blacklist=settings.get("blacklist_keywords", []) if settings else [],
            core_terms=settings.get("core_terms", []) if settings else []
        )

        # 키워드 발굴
        suggestions = await optimizer.discovery.discover_keywords(
            request.seed_keywords,
            request.max_keywords
        )

        # 발굴 결과 저장
        save_discovered_keywords(
            user_id,
            [
                {
                    "keyword": s.keyword,
                    "monthly_search_count": s.monthly_search_count,
                    "monthly_pc_search_count": s.monthly_pc_search_count,
                    "monthly_mobile_search_count": s.monthly_mobile_search_count,
                    "competition_level": s.competition_level,
                    "competition_index": s.competition_index,
                    "suggested_bid": s.suggested_bid,
                    "relevance_score": s.relevance_score,
                    "potential_score": s.potential_score
                }
                for s in suggestions
            ],
            seed_keyword=", ".join(request.seed_keywords)
        )

        # 자동 추가
        added_count = 0
        if request.auto_add and request.ad_group_id:
            added = await optimizer.bulk_manager.bulk_add_keywords(
                request.ad_group_id,
                suggestions
            )
            added_count = len(added)

            # 상태 업데이트
            for s in suggestions:
                update_discovered_keyword_status(
                    user_id, s.keyword, "added", request.ad_group_id
                )

        save_optimization_log(
            user_id, "keyword_discovery",
            f"키워드 발굴 완료: {len(suggestions)}개 발굴, {added_count}개 추가",
            {"discovered": len(suggestions), "added": added_count}
        )

        return {
            "success": True,
            "discovered": len(suggestions),
            "added": added_count,
            "keywords": [
                {
                    "keyword": s.keyword,
                    "monthly_search_count": s.monthly_search_count,
                    "competition_level": s.competition_level,
                    "suggested_bid": s.suggested_bid,
                    "relevance_score": round(s.relevance_score, 2),
                    "potential_score": round(s.potential_score, 2)
                }
                for s in suggestions
            ]
        }
    except Exception as e:
        logger.error(f"Keyword discovery error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/keywords/discovered")
async def get_discovered(
    user_id: int = Query(..., description="사용자 ID"),
    status: Optional[str] = Query(None, description="상태 필터"),
    limit: int = Query(100, description="조회 개수")
):
    """발굴된 키워드 목록 조회"""
    keywords = get_discovered_keywords(user_id, status, limit)
    return {
        "success": True,
        "count": len(keywords),
        "keywords": keywords
    }


@router.post("/keywords/bulk-add")
async def bulk_add_keywords(
    request: BulkKeywordAddRequest,
    user_id: int = Query(..., description="사용자 ID")
):
    """키워드 대량 추가"""
    try:
        optimizer = get_optimizer()

        # KeywordSuggestion 객체로 변환
        from services.naver_ad_service import KeywordSuggestion
        suggestions = [
            KeywordSuggestion(keyword=kw, suggested_bid=request.default_bid)
            for kw in request.keywords
        ]

        # 대량 추가
        added = await optimizer.bulk_manager.bulk_add_keywords(
            request.ad_group_id,
            suggestions,
            request.default_bid
        )

        save_optimization_log(
            user_id, "bulk_add",
            f"키워드 대량 추가: {len(added)}개",
            {"count": len(added), "ad_group_id": request.ad_group_id}
        )

        return {
            "success": True,
            "message": f"{len(added)}개 키워드가 추가되었습니다",
            "added_count": len(added)
        }
    except Exception as e:
        logger.error(f"Bulk add error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ 입찰가 관리 ============

@router.get("/bids/history")
async def get_bids_history(
    user_id: int = Query(..., description="사용자 ID"),
    keyword_id: Optional[str] = Query(None, description="키워드 ID"),
    limit: int = Query(100, description="조회 개수")
):
    """입찰 변경 이력 조회"""
    history = get_bid_history(user_id, limit, keyword_id)
    return {
        "success": True,
        "count": len(history),
        "history": history
    }


@router.get("/bids/summary")
async def get_bids_summary(
    user_id: int = Query(..., description="사용자 ID"),
    days: int = Query(7, description="조회 기간 (일)")
):
    """입찰 변경 요약"""
    summary = get_bid_changes_summary(user_id, days)
    return {
        "success": True,
        "data": summary
    }


@router.post("/bids/update")
async def update_bid_manual(
    request: ManualBidUpdateRequest,
    user_id: int = Query(..., description="사용자 ID")
):
    """수동 입찰가 변경"""
    try:
        optimizer = get_optimizer()

        # 현재 키워드 정보 조회
        keyword_info = await optimizer.api.get_keyword(request.keyword_id)
        old_bid = keyword_info.get("bidAmt", 0)

        # 입찰가 변경
        await optimizer.api.update_keyword_bid(request.keyword_id, request.new_bid)

        # 변경 기록 저장
        save_bid_change(
            user_id=user_id,
            keyword_id=request.keyword_id,
            keyword_text=keyword_info.get("keyword", ""),
            old_bid=old_bid,
            new_bid=request.new_bid,
            reason=request.reason,
            strategy="manual"
        )

        return {
            "success": True,
            "message": f"입찰가가 {old_bid}원에서 {request.new_bid}원으로 변경되었습니다",
            "old_bid": old_bid,
            "new_bid": request.new_bid
        }
    except Exception as e:
        logger.error(f"Manual bid update error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ 키워드 제외 ============

@router.post("/keywords/evaluate")
async def evaluate_keywords(
    user_id: int = Query(..., description="사용자 ID"),
    ad_group_ids: Optional[List[str]] = Query(None, description="광고그룹 ID 목록")
):
    """비효율 키워드 평가 및 제외"""
    try:
        optimizer = get_optimizer()

        # 설정 로드
        settings = get_optimization_settings(user_id)
        if settings:
            optimizer.exclusion.set_thresholds(
                min_ctr=settings.get("min_ctr", 0.01),
                max_cost_no_conv=settings.get("max_cost_no_conv", 50000),
                min_quality_score=settings.get("min_quality_score", 4),
                evaluation_days=settings.get("evaluation_days", 7)
            )

        # 평가 실행
        excluded = await optimizer.exclusion.evaluate_and_exclude(ad_group_ids)

        # 제외 기록 저장
        for item in excluded:
            save_excluded_keyword(
                user_id=user_id,
                keyword_id=item.get("keyword_id"),
                keyword_text=item.get("keyword"),
                ad_group_id=item.get("ad_group_id", ""),
                reason=item.get("reason")
            )

        save_optimization_log(
            user_id, "keyword_evaluation",
            f"키워드 평가 완료: {len(excluded)}개 제외",
            {"excluded_count": len(excluded)}
        )

        return {
            "success": True,
            "message": f"{len(excluded)}개 키워드가 제외되었습니다",
            "excluded": excluded
        }
    except Exception as e:
        logger.error(f"Keyword evaluation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/keywords/excluded")
async def get_excluded_list(
    user_id: int = Query(..., description="사용자 ID"),
    include_restored: bool = Query(False, description="복원된 키워드 포함")
):
    """제외된 키워드 목록"""
    excluded = get_excluded_keywords(user_id, include_restored)
    return {
        "success": True,
        "count": len(excluded),
        "keywords": excluded
    }


@router.post("/keywords/restore/{keyword_id}")
async def restore_keyword(
    keyword_id: str,
    user_id: int = Query(..., description="사용자 ID")
):
    """제외된 키워드 복원"""
    try:
        optimizer = get_optimizer()

        # 키워드 활성화
        await optimizer.api.activate_keyword(keyword_id)

        # DB 업데이트
        restore_excluded_keyword(user_id, keyword_id)

        save_optimization_log(
            user_id, "keyword_restore",
            f"키워드 복원: {keyword_id}"
        )

        return {
            "success": True,
            "message": "키워드가 복원되었습니다"
        }
    except Exception as e:
        logger.error(f"Keyword restore error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ 성과 조회 ============

@router.get("/performance")
async def get_performance(
    user_id: int = Query(..., description="사용자 ID"),
    start_date: Optional[str] = Query(None, description="시작일 (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="종료일 (YYYY-MM-DD)"),
    keyword_id: Optional[str] = Query(None, description="키워드 ID")
):
    """키워드 성과 조회"""
    if not end_date:
        end_date = datetime.now().strftime("%Y-%m-%d")
    if not start_date:
        start_date = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")

    performance = get_keyword_performance(user_id, start_date, end_date, keyword_id)
    return {
        "success": True,
        "count": len(performance),
        "data": performance
    }


@router.get("/performance/summary")
async def get_perf_summary(
    user_id: int = Query(..., description="사용자 ID"),
    days: int = Query(7, description="조회 기간 (일)")
):
    """성과 요약 조회"""
    summary = get_performance_summary(user_id, days)
    return {
        "success": True,
        "data": summary
    }


# ============ 리포트 ============

@router.get("/reports/daily")
async def get_daily_report(
    user_id: int = Query(..., description="사용자 ID"),
    days: int = Query(30, description="조회 기간 (일)")
):
    """일일 리포트 조회"""
    reports = get_daily_reports(user_id, days)
    return {
        "success": True,
        "count": len(reports),
        "reports": reports
    }


@router.get("/logs")
async def get_logs(
    user_id: int = Query(..., description="사용자 ID"),
    log_type: Optional[str] = Query(None, description="로그 유형"),
    limit: int = Query(100, description="조회 개수")
):
    """최적화 로그 조회"""
    logs = get_optimization_logs(user_id, log_type, limit)
    return {
        "success": True,
        "count": len(logs),
        "logs": logs
    }


# ============ 캠페인/광고그룹 조회 ============

@router.get("/campaigns")
async def get_campaigns(user_id: int = Query(..., description="사용자 ID")):
    """캠페인 목록 조회"""
    try:
        optimizer = get_optimizer()
        campaigns = await optimizer.api.get_campaigns()
        return {
            "success": True,
            "count": len(campaigns),
            "campaigns": campaigns
        }
    except Exception as e:
        logger.error(f"Get campaigns error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/adgroups")
async def get_ad_groups(
    user_id: int = Query(..., description="사용자 ID"),
    campaign_id: Optional[str] = Query(None, description="캠페인 ID")
):
    """광고그룹 목록 조회"""
    try:
        optimizer = get_optimizer()
        ad_groups = await optimizer.api.get_ad_groups(campaign_id)
        return {
            "success": True,
            "count": len(ad_groups),
            "ad_groups": ad_groups
        }
    except Exception as e:
        logger.error(f"Get ad groups error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/keywords")
async def get_keywords(
    user_id: int = Query(..., description="사용자 ID"),
    ad_group_id: Optional[str] = Query(None, description="광고그룹 ID")
):
    """키워드 목록 조회"""
    try:
        optimizer = get_optimizer()
        keywords = await optimizer.api.get_keywords(ad_group_id)
        return {
            "success": True,
            "count": len(keywords),
            "keywords": keywords
        }
    except Exception as e:
        logger.error(f"Get keywords error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
