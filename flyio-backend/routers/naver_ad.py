"""
네이버 광고 자동 최적화 API 라우터
"""
from fastapi import APIRouter, HTTPException, Query, BackgroundTasks, Depends, UploadFile, File, Form
from pydantic import BaseModel, Field
from routers.auth_deps import get_user_id_with_fallback
from routers.admin import require_admin
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime, timedelta
import logging
import asyncio
import io
import json as _json_lib
import random
import re

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
    save_optimization_log,
    # 새로 추가된 함수들
    save_ad_account,
    get_ad_account,
    update_ad_account_status,
    delete_ad_account,
    save_efficiency_tracking,
    get_efficiency_summary,
    get_efficiency_history,
    save_trending_keywords,
    get_trending_keywords,
    update_trending_keyword_status,
    # 대량 등록
    create_bulk_upload_job,
    update_bulk_upload_job,
    get_bulk_upload_job,
    list_bulk_upload_jobs,
    get_bulk_upload_failures,
    # 검색량 필터
    create_volume_filter_job,
    update_volume_filter_job,
    get_volume_filter_job,
    list_volume_filter_jobs,
    get_volume_filter_results,
    count_volume_filter_results,
    set_volume_filter_control,
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
    strategy: str = Field(default="balanced", description="입찰 전략 (balanced, target_roas, target_position, target_cpa, maximize_conversions)")
    target_roas: float = Field(default=300, description="목표 ROAS (%)")
    target_position: int = Field(default=3, description="목표 순위")
    target_cpa: int = Field(default=20000, description="목표 CPA (전환당 비용)")
    conversion_value: int = Field(default=59400, description="전환 가치 (LTV)")
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
    # 전환 키워드 자동 발굴 설정
    conversion_keywords: List[str] = Field(default=["가격", "비용", "구독", "결제", "신청", "구매", "추천", "비교", "후기"], description="전환 의도 키워드")


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


class KeywordWithBid(BaseModel):
    keyword: str = Field(..., description="키워드")
    bid: int = Field(..., description="입찰가 (원)")


class BulkKeywordWithBidRequest(BaseModel):
    ad_group_id: str = Field(..., description="광고그룹 ID")
    items: List[KeywordWithBid] = Field(..., description="키워드+입찰가 목록")
    default_bid: int = Field(default=100, description="개별 입찰가가 없을 때의 기본값")


# ============ 대시보드 ============

@router.get("/dashboard")
async def get_dashboard(user_id: int = Depends(get_user_id_with_fallback)):
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
async def get_realtime_status(user_id: int = Depends(get_user_id_with_fallback)):
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
async def get_settings(user_id: int = Depends(get_user_id_with_fallback)):
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
    user_id: int = Depends(get_user_id_with_fallback)
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
            target_cpa=request.target_cpa,
            conversion_value=request.conversion_value,
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
    user_id: int = Depends(get_user_id_with_fallback),
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
async def stop_optimization(user_id: int = Depends(get_user_id_with_fallback)):
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
    user_id: int = Depends(get_user_id_with_fallback),
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
    user_id: int = Depends(get_user_id_with_fallback)
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


@router.post("/keywords/discover-conversion")
async def discover_conversion_keywords(
    request: KeywordDiscoveryRequest,
    user_id: int = Depends(get_user_id_with_fallback)
):
    """전환 키워드만 집중 발굴 (구매의도 높은 키워드)"""
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

        # 전환 키워드 발굴
        suggestions = await optimizer.discovery.discover_conversion_keywords(
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
                    "potential_score": s.potential_score,
                    "is_conversion_keyword": True
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

        save_optimization_log(
            user_id, "conversion_keyword_discovery",
            f"전환 키워드 발굴 완료: {len(suggestions)}개 발굴, {added_count}개 추가",
            {"discovered": len(suggestions), "added": added_count}
        )

        return {
            "success": True,
            "message": "전환 키워드 발굴 완료",
            "discovered": len(suggestions),
            "added": added_count,
            "keywords": [
                {
                    "keyword": s.keyword,
                    "monthly_search_count": s.monthly_search_count,
                    "competition_level": s.competition_level,
                    "suggested_bid": s.suggested_bid,
                    "relevance_score": round(s.relevance_score, 2),
                    "potential_score": round(s.potential_score, 2),
                    "conversion_intent": "높음" if s.potential_score > 50 else "중간" if s.potential_score > 20 else "낮음"
                }
                for s in suggestions
            ]
        }
    except Exception as e:
        logger.error(f"Conversion keyword discovery error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/keywords/discovered")
async def get_discovered(
    user_id: int = Depends(get_user_id_with_fallback),
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
    user_id: int = Depends(get_user_id_with_fallback)
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


@router.post("/keywords/bulk-add-with-bids")
async def bulk_add_keywords_with_bids(
    request: BulkKeywordWithBidRequest,
    user_id: int = Depends(get_user_id_with_fallback)
):
    """키워드별 개별 입찰가로 대량 추가"""
    try:
        optimizer = get_optimizer()

        from services.naver_ad_service import KeywordSuggestion
        suggestions = [
            KeywordSuggestion(
                keyword=item.keyword,
                suggested_bid=item.bid if item.bid and item.bid >= 70 else request.default_bid
            )
            for item in request.items
        ]

        added = await optimizer.bulk_manager.bulk_add_keywords(
            request.ad_group_id,
            suggestions,
            request.default_bid
        )

        save_optimization_log(
            user_id, "bulk_add_with_bids",
            f"키워드 대량 추가(개별 입찰가): {len(added)}개",
            {"count": len(added), "ad_group_id": request.ad_group_id}
        )

        return {
            "success": True,
            "message": f"{len(added)}개 키워드가 개별 입찰가로 추가되었습니다",
            "added_count": len(added),
            "total_requested": len(request.items)
        }
    except Exception as e:
        logger.error(f"Bulk add with bids error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _parse_keyword_excel(file_bytes: bytes, default_bid: int, force_default_bid: bool = False) -> Dict[str, Any]:
    """엑셀/CSV 파일에서 키워드+입찰가 파싱.
    컬럼: '키워드'(필수), '입찰가'(선택). 헤더가 없으면 1열=키워드, 2열=입찰가로 해석.
    force_default_bid=True면 엑셀의 입찰가를 무시하고 모든 키워드에 default_bid 적용.
    """
    import openpyxl

    items: List[Dict[str, Any]] = []
    errors: List[str] = []
    seen = set()

    # 엑셀 시도
    try:
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True, read_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
    except Exception:
        # CSV fallback
        try:
            text = file_bytes.decode("utf-8-sig")
        except UnicodeDecodeError:
            text = file_bytes.decode("cp949", errors="replace")
        import csv
        rows = [tuple(r) for r in csv.reader(io.StringIO(text))]

    if not rows:
        return {"items": [], "errors": ["파일이 비어있습니다"], "total": 0}

    # 헤더 감지
    header = rows[0]
    header_cells = [str(c).strip() if c is not None else "" for c in header]
    header_lower = [h.lower() for h in header_cells]

    kw_idx = 0
    bid_idx = 1
    has_header = False

    kw_aliases = ["키워드", "keyword", "kw"]
    bid_aliases = ["입찰가", "bid", "bidamt", "입찰", "cpc"]

    for i, h in enumerate(header_lower):
        if h in kw_aliases:
            kw_idx = i
            has_header = True
        elif h in bid_aliases:
            bid_idx = i
            has_header = True

    data_rows = rows[1:] if has_header else rows
    kw_pattern = re.compile(r"^[\w가-힣\s\-\+]{1,40}$", re.UNICODE)

    for lineno, row in enumerate(data_rows, start=2 if has_header else 1):
        if not row or all(c is None or str(c).strip() == "" for c in row):
            continue

        raw_kw = row[kw_idx] if kw_idx < len(row) else None
        raw_bid = row[bid_idx] if bid_idx < len(row) else None

        if raw_kw is None:
            continue
        keyword = str(raw_kw).strip()
        if not keyword:
            continue

        # 네이버 키워드 제약: 공백/특수문자 과다 필터
        if len(keyword) > 40:
            errors.append(f"{lineno}행: 키워드 길이 초과 ({keyword[:20]}...)")
            continue
        if not kw_pattern.match(keyword):
            errors.append(f"{lineno}행: 허용되지 않는 문자 ({keyword})")
            continue
        if keyword in seen:
            continue
        seen.add(keyword)

        bid = default_bid
        if not force_default_bid and raw_bid is not None and str(raw_bid).strip() != "":
            try:
                bid_val = int(float(str(raw_bid).replace(",", "").strip()))
                if bid_val < 70:
                    errors.append(f"{lineno}행: 입찰가 최소 70원 ({bid_val}) → {default_bid}원 적용")
                    bid = default_bid
                elif bid_val > 100000:
                    errors.append(f"{lineno}행: 입찰가 최대 100000원 초과 ({bid_val}) → 100000원 적용")
                    bid = 100000
                else:
                    bid = bid_val
            except (ValueError, TypeError):
                errors.append(f"{lineno}행: 입찰가 파싱 실패 ({raw_bid}) → {default_bid}원 적용")
                bid = default_bid

        items.append({"keyword": keyword, "bid": bid, "row": lineno})

    return {"items": items, "errors": errors, "total": len(items)}


# ============ 검색량 필터링 (50만 규모) ============

@router.post("/keywords/volume-filter")
async def start_volume_filter(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="엑셀/CSV - A열 키워드"),
    min_volume: int = Form(default=10, description="월 총 검색량 최소치"),
    test_size: int = Form(default=10000, description="캐너리 테스트 크기 (0=비활성)"),
    min_pass_rate_pct: float = Form(default=2.0, description="캐너리 최소 통과율(%)"),
    auto_continue_on_canary: bool = Form(default=True, description="캐너리 통과시 자동 계속"),
    user_id: int = Depends(get_user_id_with_fallback),
):
    """검색량 필터링 작업 시작
    - 캐너리: 첫 test_size개 처리 후 통과율 평가 → 임계치 이상이면 자동 계속, 미만이면 중단
    - auto_continue_on_canary=False면 캐너리 통과 여부와 무관하게 미달 시 대기
    - 취소/일시정지/재개 가능
    """
    try:
        if min_volume < 0 or min_volume > 100000:
            raise HTTPException(status_code=400, detail="min_volume 범위 오류 (0~100000)")
        if test_size < 0:
            raise HTTPException(status_code=400, detail="test_size 범위 오류")

        content = await file.read()
        if len(content) > 100 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="파일은 100MB 이하")

        parsed = _parse_keyword_excel(content, default_bid=100, force_default_bid=True)
        if parsed["total"] == 0:
            raise HTTPException(status_code=400, detail="유효 키워드 없음")

        keywords = [item["keyword"] for item in parsed["items"]]
        total = len(keywords)

        account = get_ad_account(user_id)
        if not account or not account.get("is_connected"):
            raise HTTPException(status_code=400, detail="네이버 광고 계정을 먼저 연동하세요")

        # Job 생성 (keywords_file 경로 미리 확보하려면 id 필요해서 후처리)
        job_id = create_volume_filter_job(
            user_id=user_id,
            filename=file.filename or "uploaded.xlsx",
            min_volume=min_volume,
            total_keywords=total,
            test_size=test_size,
            min_pass_rate_pct=min_pass_rate_pct,
            auto_continue_on_canary=auto_continue_on_canary,
        )

        # 키워드를 파일로 저장 (재개용)
        from services.volume_filter import VolumeFilterService
        from database.naver_ad_db import DATA_DIR
        kw_path = VolumeFilterService.save_keywords_file(job_id, keywords, DATA_DIR)
        update_volume_filter_job(job_id, keywords_file=kw_path)

        async def _run():
            from services.volume_filter import VolumeFilterService, VolumeFilterConfig
            from services.naver_ad_service import NaverAdApiClient
            try:
                client = NaverAdApiClient()
                client.customer_id = account.get("customer_id")
                client.api_key = account.get("api_key")
                client.secret_key = account.get("secret_key")

                svc = VolumeFilterService(client)
                cfg = VolumeFilterConfig(
                    job_id=job_id, user_id=user_id, min_volume=min_volume,
                    test_size=test_size,
                    min_pass_rate_pct=min_pass_rate_pct,
                    auto_continue_on_canary=auto_continue_on_canary,
                )
                await svc.run(cfg, keywords)
            except Exception as e:
                logger.exception(f"[Filter {job_id}] 실행 실패")
                update_volume_filter_job(
                    job_id, status="failed",
                    error_message=str(e)[:1000],
                    completed_at=datetime.now().isoformat(),
                )

        background_tasks.add_task(_run)

        estimated_seconds = int(total / 5 * 0.4)

        save_optimization_log(
            user_id, "volume_filter_start",
            f"검색량 필터 시작 (job #{job_id}): {total}개 (임계치 {min_volume}, 캐너리 {test_size})",
            {"job_id": job_id, "total": total, "min_volume": min_volume,
             "test_size": test_size}
        )

        return {
            "success": True,
            "job_id": job_id,
            "total_keywords": total,
            "min_volume": min_volume,
            "test_size": test_size,
            "min_pass_rate_pct": min_pass_rate_pct,
            "estimated_seconds": estimated_seconds,
            "estimated_minutes": round(estimated_seconds / 60, 1),
            "canary_estimated_seconds": int(test_size / 5 * 0.4) if test_size else 0,
            "message": (
                f"백그라운드 필터링 시작. 캐너리 {test_size}개 테스트 "
                f"(예상 {int(test_size / 5 * 0.4 / 60)}분) 후 자동 판단"
                if test_size else
                f"백그라운드 필터링 시작 (예상 {estimated_seconds // 60}분)"
            ),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("volume filter start error")
        raise HTTPException(status_code=500, detail=str(e))


# ============ 관리자 전용: AI 씨앗/앵커 제안 ============

class AiSuggestSeedsRequest(BaseModel):
    topic: str = Field(..., description="주제 또는 카테고리 (예: 대출, 성형외과, 인테리어)")
    target_count: int = Field(default=10000, description="목표 수집 키워드 수")


@router.post("/keywords/ai-suggest-seeds")
async def ai_suggest_seeds(
    request: AiSuggestSeedsRequest,
    admin: dict = Depends(require_admin),
):
    """주제 + 목표 개수 → GPT가 씨앗/앵커/블랙리스트 + BFS 파라미터 자동 제안.
    관리자 전용. 응답을 프론트에서 보여주고 사용자가 수정 후 실제 확장 돌림.
    """
    topic = (request.topic or "").strip()
    if not topic:
        raise HTTPException(status_code=400, detail="topic이 비어있습니다")
    if len(topic) > 100:
        raise HTTPException(status_code=400, detail="topic이 너무 깁니다 (최대 100자)")
    if request.target_count <= 0 or request.target_count > 1000000:
        raise HTTPException(status_code=400, detail="target_count 범위 오류 (1~1000000)")

    from services.ai_seed_suggester import suggest_keyword_setup
    result = await suggest_keyword_setup(topic, request.target_count)
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result.get("message", "AI 제안 실패"))

    return result


# ============ 관리자 전용: 씨앗 AI 증폭 ============

class AiAmplifySeedsRequest(BaseModel):
    seeds: List[str] = Field(..., description="원본 씨앗 (1~100개)")
    target_count: int = Field(default=50, description="목표 씨앗 수 (입력의 N배, 최대 500)")


@router.post("/keywords/ai-amplify-seeds")
async def ai_amplify_seeds(
    request: AiAmplifySeedsRequest,
    admin: dict = Depends(require_admin),
):
    """씨앗 N개를 GPT가 패턴 분석해서 target_count개로 펼침.
    예: 10개 → 50개 (5배). 원본 씨앗은 결과에 반드시 포함.
    """
    seeds = [s.strip() for s in request.seeds if s and s.strip()]
    if not seeds:
        raise HTTPException(status_code=400, detail="씨앗이 비어있습니다")
    if len(seeds) > 100:
        raise HTTPException(status_code=400, detail="원본 씨앗 최대 100개")
    if request.target_count < len(seeds) or request.target_count > 500:
        raise HTTPException(status_code=400, detail=f"target_count 범위 오류 ({len(seeds)}~500)")

    from services.ai_seed_suggester import amplify_seeds
    result = await amplify_seeds(seeds, request.target_count)
    if not result.get("success"):
        raise HTTPException(status_code=502, detail=result.get("message", "AI 증폭 실패"))
    return result


# ============ 관리자 전용: AI 키워드 자동 확장 ============

class AiKeywordExpandRequest(BaseModel):
    seeds: List[str] = Field(..., description="씨앗 키워드 목록 (1~50개)")
    min_volume: int = Field(default=5, description="월 총 검색량 최소치")
    max_total_kept: int = Field(default=10000, description="최종 저장 최대 키워드 수")
    max_api_calls: int = Field(default=2000, description="네이버 API 총 호출 상한")
    max_depth: int = Field(default=3, description="BFS 확장 깊이")
    top_n_per_level: int = Field(default=50, description="각 레벨에서 다음 확장 대상 상위 개수")
    core_terms: List[str] = Field(default=[], description="반드시 포함돼야 할 앵커 단어 목록 (비우면 씨앗에서 자동 추출)")
    blacklist: List[str] = Field(default=[], description="포함되면 즉시 제외할 단어 목록")
    # 실시간 캠페인 등록 옵션
    stream_register: bool = Field(default=False, description="수집과 동시에 네이버 캠페인 실시간 등록")
    campaign_prefix: str = Field(default="", description="실시간 등록 시 캠페인 이름 prefix")
    bid: int = Field(default=100, description="키워드 공통 입찰가 (원)")
    daily_budget: int = Field(default=10000, description="캠페인 일 예산 (원)")
    campaign_tp: str = Field(default="WEB_SITE", description="캠페인 유형")
    keywords_per_ad_group: int = Field(default=1000, description="광고그룹당 키워드 수")
    stream_batch_size: int = Field(default=10, description="몇 개 찰 때마다 등록할지 (작을수록 실시간)")


@router.post("/keywords/ai-expand")
async def start_ai_keyword_expand(
    request: AiKeywordExpandRequest,
    background_tasks: BackgroundTasks,
    admin: dict = Depends(require_admin),
):
    """씨앗 키워드에서 출발해 네이버 연관검색어를 BFS 확장하며 검색량 필터링.
    관리자만 사용 가능. 기존 volume_filter_jobs 테이블을 재사용하므로
    진행률 조회/결과 다운로드/광고 등록 플로우를 그대로 쓸 수 있다.
    """
    try:
        seeds = [s.strip() for s in request.seeds if s and s.strip()]
        if not seeds:
            raise HTTPException(status_code=400, detail="씨앗 키워드가 비어있습니다")
        if len(seeds) > 500:
            raise HTTPException(status_code=400, detail="씨앗은 최대 500개까지 허용됩니다")
        if request.min_volume < 0 or request.min_volume > 100000:
            raise HTTPException(status_code=400, detail="min_volume 범위 오류")
        if request.max_total_kept <= 0 or request.max_total_kept > 1000000:
            raise HTTPException(status_code=400, detail="max_total_kept 범위 오류 (1~1000000)")
        if request.max_api_calls <= 0 or request.max_api_calls > 50000:
            raise HTTPException(status_code=400, detail="max_api_calls 범위 오류 (1~50000)")
        if request.max_depth < 0 or request.max_depth > 5:
            raise HTTPException(status_code=400, detail="max_depth 범위 오류 (0~5)")
        if request.stream_register:
            if not request.campaign_prefix or len(request.campaign_prefix) < 2:
                raise HTTPException(status_code=400, detail="실시간 등록 시 campaign_prefix 필수 (2자 이상)")
            if request.bid < 70 or request.bid > 100000:
                raise HTTPException(status_code=400, detail="입찰가 70~100000원")
            if request.stream_batch_size < 1 or request.stream_batch_size > 100:
                raise HTTPException(status_code=400, detail="stream_batch_size 1~100")
            if request.keywords_per_ad_group < 10 or request.keywords_per_ad_group > 1000:
                raise HTTPException(status_code=400, detail="keywords_per_ad_group 10~1000")

        admin_id = admin["id"]
        account = get_ad_account(admin_id)
        if not account or not account.get("is_connected"):
            raise HTTPException(status_code=400, detail="네이버 광고 계정을 먼저 연동하세요")

        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"AI확장_{seeds[0][:20]}_{ts}"

        # 기존 필터 테이블을 재사용 (total_keywords = max_api_calls 기준으로 표기)
        job_id = create_volume_filter_job(
            user_id=admin_id,
            filename=filename,
            min_volume=request.min_volume,
            total_keywords=request.max_api_calls,
            test_size=0,
            min_pass_rate_pct=0.0,
            auto_continue_on_canary=True,
        )
        update_volume_filter_job(
            job_id,
            current_step=f"AI 확장 대기: 씨앗 {len(seeds)}개",
        )

        async def _run():
            from services.ai_keyword_expander import AiKeywordExpander, AiExpandConfig
            from services.naver_ad_service import NaverAdApiClient
            try:
                client = NaverAdApiClient()
                client.customer_id = account.get("customer_id")
                client.api_key = account.get("api_key")
                client.secret_key = account.get("secret_key")

                expander = AiKeywordExpander(client)
                cfg = AiExpandConfig(
                    job_id=job_id,
                    user_id=admin_id,
                    seeds=seeds,
                    min_volume=request.min_volume,
                    max_total_kept=request.max_total_kept,
                    max_api_calls=request.max_api_calls,
                    max_depth=request.max_depth,
                    top_n_per_level=request.top_n_per_level,
                    core_terms=request.core_terms or None,
                    blacklist=request.blacklist or None,
                    stream_register=request.stream_register,
                    campaign_prefix=request.campaign_prefix,
                    bid=request.bid,
                    daily_budget=request.daily_budget,
                    campaign_tp=request.campaign_tp,
                    keywords_per_ad_group=request.keywords_per_ad_group,
                    stream_batch_size=request.stream_batch_size,
                )
                await expander.run(cfg)
            except Exception as e:
                logger.exception(f"[AiExpand {job_id}] 실행 실패")
                update_volume_filter_job(
                    job_id, status="failed",
                    error_message=str(e)[:1000],
                    completed_at=datetime.now().isoformat(),
                )

        background_tasks.add_task(_run)

        save_optimization_log(
            admin_id, "ai_keyword_expand_start",
            f"AI 키워드 확장 시작 (job #{job_id}): 씨앗 {len(seeds)}개, "
            f"depth {request.max_depth}, max_api {request.max_api_calls}",
            {"job_id": job_id, "seeds": seeds[:10], "seed_count": len(seeds),
             "min_volume": request.min_volume, "max_api_calls": request.max_api_calls},
        )

        return {
            "success": True,
            "job_id": job_id,
            "seed_count": len(seeds),
            "min_volume": request.min_volume,
            "max_api_calls": request.max_api_calls,
            "estimated_minutes": round(request.max_api_calls * 0.35 / 60, 1),
            "message": f"AI 확장 시작. 씨앗 {len(seeds)}개 → 예상 {round(request.max_api_calls * 0.35 / 60, 1)}분",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("ai keyword expand start error")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/keywords/volume-filter/{job_id}/cancel")
async def cancel_volume_filter(
    job_id: int,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """실행 중인 필터 작업 취소 (진행 상태 보존 안 됨)"""
    job = get_volume_filter_job(job_id, user_id)
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")
    if job["status"] not in ("pending", "running"):
        raise HTTPException(status_code=400, detail=f"취소할 수 없는 상태입니다: {job['status']}")

    set_volume_filter_control(job_id, should_cancel=True)
    return {"success": True, "message": "취소 요청됨. 최대 수 초 내 반영"}


@router.post("/keywords/volume-filter/{job_id}/pause")
async def pause_volume_filter(
    job_id: int,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """실행 중인 필터 작업 일시정지 (나중에 재개 가능)"""
    job = get_volume_filter_job(job_id, user_id)
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")
    if job["status"] != "running":
        raise HTTPException(status_code=400, detail=f"일시정지 불가 상태: {job['status']}")

    set_volume_filter_control(job_id, should_pause=True)
    return {"success": True, "message": "일시정지 요청됨. 최대 수 초 내 반영"}


@router.post("/keywords/volume-filter/{job_id}/resume")
async def resume_volume_filter(
    job_id: int,
    background_tasks: BackgroundTasks,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """일시정지/캐너리실패 작업 재개"""
    job = get_volume_filter_job(job_id, user_id)
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")
    if job["status"] not in ("paused", "canary_failed"):
        raise HTTPException(status_code=400,
                            detail=f"재개 불가 상태: {job['status']}")

    kw_file = job.get("keywords_file")
    if not kw_file:
        raise HTTPException(status_code=500, detail="키워드 파일 경로 없음 (복구 불가)")

    from services.volume_filter import VolumeFilterService, VolumeFilterConfig
    keywords = VolumeFilterService.load_keywords_file(kw_file)
    if not keywords:
        raise HTTPException(status_code=500, detail="키워드 파일 누락 (복구 불가)")

    account = get_ad_account(user_id)
    if not account or not account.get("is_connected"):
        raise HTTPException(status_code=400, detail="네이버 광고 계정 연동 필요")

    start_index = job.get("processed_count", 0) or 0

    async def _run():
        from services.naver_ad_service import NaverAdApiClient
        try:
            client = NaverAdApiClient()
            client.customer_id = account.get("customer_id")
            client.api_key = account.get("api_key")
            client.secret_key = account.get("secret_key")

            svc = VolumeFilterService(client)
            cfg = VolumeFilterConfig(
                job_id=job_id, user_id=user_id,
                min_volume=job.get("min_volume", 10),
                test_size=job.get("test_size", 10000),
                min_pass_rate_pct=job.get("min_pass_rate_pct", 2.0),
                # 재개 시 캐너리 무시 (이미 평가됐거나, 사용자가 "재개"로 강제 진행)
                auto_continue_on_canary=True,
            )
            await svc.run(cfg, keywords, start_index=start_index)
        except Exception as e:
            logger.exception(f"[Filter {job_id}] 재개 실패")
            update_volume_filter_job(
                job_id, status="failed",
                error_message=str(e)[:1000],
                completed_at=datetime.now().isoformat(),
            )

    background_tasks.add_task(_run)

    save_optimization_log(
        user_id, "volume_filter_resume",
        f"필터 재개 (job #{job_id}) at {start_index}/{len(keywords)}",
        {"job_id": job_id, "start_index": start_index}
    )

    return {
        "success": True,
        "message": f"재개 요청됨 ({start_index}/{len(keywords)}부터)",
        "start_index": start_index,
        "total": len(keywords),
    }


@router.get("/keywords/volume-filter/{job_id}/status")
async def get_volume_filter_status(
    job_id: int,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """검색량 필터 진행 상태"""
    job = get_volume_filter_job(job_id, user_id)
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")

    total = job.get("total_keywords", 0) or 0
    processed = job.get("processed_count", 0) or 0
    progress = int(processed / total * 100) if total > 0 else 0

    return {
        "success": True,
        "job": {**job, "progress_percent": progress},
    }


@router.get("/keywords/volume-filter/jobs")
async def list_volume_filter_jobs_route(
    user_id: int = Depends(get_user_id_with_fallback),
    limit: int = Query(default=20),
):
    jobs = list_volume_filter_jobs(user_id, limit=limit)
    return {"success": True, "count": len(jobs), "jobs": jobs}


@router.get("/keywords/volume-filter/{job_id}/results")
async def get_volume_filter_results_route(
    job_id: int,
    user_id: int = Depends(get_user_id_with_fallback),
    limit: Optional[int] = Query(default=None),
    format: str = Query(default="json", description="json 또는 csv"),
):
    """필터 통과 키워드 조회"""
    job = get_volume_filter_job(job_id, user_id)
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")

    results = get_volume_filter_results(job_id, limit=limit)

    if format == "csv":
        from fastapi.responses import StreamingResponse
        import csv
        import io as _io

        buf = _io.StringIO()
        buf.write("\ufeff")
        writer = csv.writer(buf)
        writer.writerow(["키워드", "PC검색량", "모바일검색량", "총검색량", "경쟁도"])
        for r in results:
            writer.writerow([r["keyword"], r["monthly_pc"], r["monthly_mobile"],
                             r["monthly_total"], r.get("comp_idx", "")])
        buf.seek(0)
        return StreamingResponse(
            iter([buf.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="filtered_job_{job_id}.csv"'},
        )

    return {"success": True, "count": len(results), "results": results}


class FilterToRegisterRequest(BaseModel):
    campaign_prefix: str = Field(..., description="캠페인 prefix")
    bid: int = Field(default=100)
    keywords_per_group: int = Field(default=500)
    daily_budget: int = Field(default=10000)
    campaign_tp: str = Field(default="WEB_SITE")
    min_volume_override: Optional[int] = Field(default=None, description="등록 시 재필터링 임계치 (생략 시 필터 job의 min_volume 사용)")


@router.post("/keywords/volume-filter/{job_id}/register")
async def register_from_filter(
    job_id: int,
    request: FilterToRegisterRequest,
    background_tasks: BackgroundTasks,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """필터 통과 키워드로 대량 등록 job 시작"""
    try:
        job = get_volume_filter_job(job_id, user_id)
        if not job:
            raise HTTPException(status_code=404, detail="필터 작업을 찾을 수 없습니다")
        if job["status"] not in ("completed", "completed_with_errors"):
            raise HTTPException(status_code=400, detail="필터링이 아직 완료되지 않았습니다")

        # 통과 키워드 로드
        raw_results = get_volume_filter_results(job_id)
        min_v = request.min_volume_override if request.min_volume_override is not None else job["min_volume"]
        keywords = [r["keyword"] for r in raw_results if r["monthly_total"] >= min_v]

        if not keywords:
            raise HTTPException(status_code=400, detail="등록할 키워드가 없습니다")

        if request.bid < 70 or request.bid > 100000:
            raise HTTPException(status_code=400, detail="입찰가 70~100000원")
        if not request.campaign_prefix or len(request.campaign_prefix) < 2:
            raise HTTPException(status_code=400, detail="campaign_prefix 필수")

        account = get_ad_account(user_id)
        if not account or not account.get("is_connected"):
            raise HTTPException(status_code=400, detail="광고 계정 연동 필요")

        per_group = request.keywords_per_group
        num_ad_groups = (len(keywords) + per_group - 1) // per_group
        num_campaigns = (num_ad_groups + 999) // 1000

        register_job_id = create_bulk_upload_job(
            user_id=user_id,
            filename=f"filter_job_{job_id}_result",
            campaign_prefix=request.campaign_prefix,
            keywords_per_group=per_group,
            bid=request.bid,
            daily_budget=request.daily_budget,
            total_keywords=len(keywords),
        )

        async def _run():
            from services.bulk_upload_orchestrator import BulkUploadOrchestrator, BulkJobConfig
            from services.naver_ad_service import NaverAdApiClient

            try:
                client = NaverAdApiClient()
                client.customer_id = account.get("customer_id")
                client.api_key = account.get("api_key")
                client.secret_key = account.get("secret_key")

                orchestrator = BulkUploadOrchestrator(client)
                cfg = BulkJobConfig(
                    job_id=register_job_id, user_id=user_id,
                    campaign_prefix=request.campaign_prefix,
                    keywords_per_group=per_group,
                    bid=request.bid,
                    daily_budget=request.daily_budget,
                    campaign_tp=request.campaign_tp,
                )
                await orchestrator.run(cfg, keywords)
            except Exception as e:
                logger.exception(f"[Job {register_job_id}] 실행 실패")
                update_bulk_upload_job(
                    register_job_id, status="failed",
                    error_message=str(e)[:1000],
                    completed_at=datetime.now().isoformat(),
                )

        background_tasks.add_task(_run)

        save_optimization_log(
            user_id, "filter_to_register",
            f"필터 #{job_id} → 등록 #{register_job_id}: {len(keywords)}개 키워드",
            {"filter_job": job_id, "register_job": register_job_id, "total": len(keywords)}
        )

        return {
            "success": True,
            "filter_job_id": job_id,
            "register_job_id": register_job_id,
            "total_keywords": len(keywords),
            "estimated": {
                "campaigns": num_campaigns,
                "ad_groups": num_ad_groups,
            },
            "message": f"등록 작업 시작 (#{register_job_id})",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("filter-to-register error")
        raise HTTPException(status_code=500, detail=str(e))


# ============ 대량 등록 (10만 규모) ============

@router.post("/keywords/scale-register")
async def scale_register_keywords(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="엑셀 또는 CSV - A열 키워드"),
    campaign_prefix: str = Form(..., description="캠페인 이름 prefix (예: bulk_20260422)"),
    bid: int = Form(default=100, description="전체 키워드에 적용할 입찰가 (원)"),
    keywords_per_group: int = Form(default=500, description="광고그룹당 키워드 수 (기본 500)"),
    daily_budget: int = Form(default=10000, description="캠페인당 일 예산 (원)"),
    campaign_tp: str = Form(default="WEB_SITE", description="캠페인 유형"),
    user_id: int = Depends(get_user_id_with_fallback),
):
    """10만 개 규모 키워드 자동 등록
    - 캠페인/광고그룹 자동 생성
    - 500개/광고그룹, 1,000그룹/캠페인 자동 분할
    - 백그라운드 실행, job_id 리턴
    """
    try:
        if bid < 70 or bid > 100000:
            raise HTTPException(status_code=400, detail="입찰가는 70~100,000원이어야 합니다")
        if keywords_per_group < 1 or keywords_per_group > 1000:
            raise HTTPException(status_code=400, detail="광고그룹당 키워드는 1~1000개")
        if daily_budget < 1000:
            raise HTTPException(status_code=400, detail="일 예산은 최소 1,000원")
        if not campaign_prefix or len(campaign_prefix) < 2:
            raise HTTPException(status_code=400, detail="캠페인 prefix를 입력하세요 (2자 이상)")

        content = await file.read()
        if len(content) > 50 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="파일은 50MB 이하")

        # 엑셀 파싱 (force_default_bid=True → bid 전체 적용)
        parsed = _parse_keyword_excel(content, default_bid=bid, force_default_bid=True)
        if parsed["total"] == 0:
            raise HTTPException(status_code=400, detail="유효한 키워드가 없습니다")

        keywords = [item["keyword"] for item in parsed["items"]]
        total = len(keywords)

        # 스케일 계산 & 안전장치
        per_group = keywords_per_group
        num_ad_groups = (total + per_group - 1) // per_group
        num_campaigns = (num_ad_groups + 999) // 1000
        if num_campaigns > 50:
            raise HTTPException(
                status_code=400,
                detail=f"필요 캠페인 {num_campaigns}개가 너무 많습니다. "
                       f"keywords_per_group을 늘리거나 키워드 수를 줄이세요"
            )

        # 광고 계정 연동 확인
        account = get_ad_account(user_id)
        if not account or not account.get("is_connected"):
            raise HTTPException(status_code=400, detail="네이버 광고 계정을 먼저 연동하세요")

        # Job 생성
        job_id = create_bulk_upload_job(
            user_id=user_id,
            filename=file.filename or "uploaded.xlsx",
            campaign_prefix=campaign_prefix,
            keywords_per_group=per_group,
            bid=bid,
            daily_budget=daily_budget,
            total_keywords=total,
        )

        # 백그라운드에서 실제 처리
        async def _run():
            from services.bulk_upload_orchestrator import BulkUploadOrchestrator, BulkJobConfig
            from services.naver_ad_service import NaverAdApiClient

            try:
                client = NaverAdApiClient()
                client.customer_id = account.get("customer_id")
                client.api_key = account.get("api_key")
                client.secret_key = account.get("secret_key")

                orchestrator = BulkUploadOrchestrator(client)
                cfg = BulkJobConfig(
                    job_id=job_id,
                    user_id=user_id,
                    campaign_prefix=campaign_prefix,
                    keywords_per_group=per_group,
                    bid=bid,
                    daily_budget=daily_budget,
                    campaign_tp=campaign_tp,
                )
                await orchestrator.run(cfg, keywords)
            except Exception as e:
                logger.exception(f"[Job {job_id}] 오케스트레이터 실행 실패")
                update_bulk_upload_job(
                    job_id,
                    status="failed",
                    error_message=str(e)[:1000],
                    completed_at=datetime.now().isoformat(),
                )

        background_tasks.add_task(_run)

        save_optimization_log(
            user_id, "scale_register_start",
            f"대량 등록 시작 (job #{job_id}): {total}개 → 캠페인 {num_campaigns}개, 광고그룹 {num_ad_groups}개",
            {
                "job_id": job_id,
                "total": total,
                "num_campaigns": num_campaigns,
                "num_ad_groups": num_ad_groups,
            }
        )

        return {
            "success": True,
            "job_id": job_id,
            "total_keywords": total,
            "estimated": {
                "campaigns": num_campaigns,
                "ad_groups": num_ad_groups,
                "keywords_per_group": per_group,
                "estimated_seconds": int(num_ad_groups * 0.5 + total / 100 * 0.5 + num_campaigns * 0.5),
            },
            "parse_errors_count": parsed["errors_count"] if "errors_count" in parsed else len(parsed["errors"]),
            "message": f"백그라운드 등록 시작 (job #{job_id})",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("scale register error")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/keywords/scale-register/{job_id}/status")
async def get_scale_register_status(
    job_id: int,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """대량 등록 작업 진행 상태"""
    job = get_bulk_upload_job(job_id, user_id)
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")

    total = job.get("total_keywords", 0) or 0
    processed = job.get("processed_count", 0) or 0
    progress = int(processed / total * 100) if total > 0 else 0

    return {
        "success": True,
        "job": {
            **job,
            "progress_percent": progress,
        },
    }


@router.get("/keywords/scale-register/jobs")
async def list_scale_register_jobs(
    user_id: int = Depends(get_user_id_with_fallback),
    limit: int = Query(default=20),
):
    """사용자의 대량 등록 작업 목록"""
    jobs = list_bulk_upload_jobs(user_id, limit=limit)
    return {"success": True, "count": len(jobs), "jobs": jobs}


@router.get("/keywords/scale-register/{job_id}/failures")
async def get_scale_register_failures(
    job_id: int,
    user_id: int = Depends(get_user_id_with_fallback),
    format: str = Query(default="json", description="json 또는 csv"),
):
    """실패한 키워드 목록 + CSV 다운로드"""
    job = get_bulk_upload_job(job_id, user_id)
    if not job:
        raise HTTPException(status_code=404, detail="작업을 찾을 수 없습니다")

    failures = get_bulk_upload_failures(job_id)

    if format == "csv":
        from fastapi.responses import StreamingResponse
        import csv
        import io as _io

        buf = _io.StringIO()
        buf.write("\ufeff")  # UTF-8 BOM for Excel
        writer = csv.writer(buf)
        writer.writerow(["keyword", "bid", "ad_group_id", "reason"])
        for f in failures:
            writer.writerow([f["keyword"], f["bid"], f["ad_group_id"], f["reason"]])
        buf.seek(0)
        return StreamingResponse(
            iter([buf.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="failures_job_{job_id}.csv"'},
        )

    return {"success": True, "count": len(failures), "failures": failures}


@router.post("/keywords/upload-excel")
async def upload_keywords_excel(
    file: UploadFile = File(..., description="엑셀(.xlsx) 또는 CSV 파일"),
    default_bid: int = Form(default=100),
    ad_group_id: Optional[str] = Form(default=None),
    auto_register: bool = Form(default=False),
    force_default_bid: bool = Form(default=True, description="엑셀 입찰가 무시하고 default_bid 전체 적용"),
    user_id: int = Depends(get_user_id_with_fallback),
):
    """엑셀/CSV 업로드로 키워드+입찰가 파싱.
    - force_default_bid=true(기본): 엑셀 내용과 무관하게 default_bid를 모든 키워드에 일괄 적용
    - force_default_bid=false: 엑셀 B열 입찰가 우선, 없으면 default_bid 사용
    - auto_register=false(기본): 파싱 결과만 반환(미리보기)
    - auto_register=true: 즉시 네이버 광고 API로 등록
    """
    try:
        if not file.filename:
            raise HTTPException(status_code=400, detail="파일이 없습니다")

        if default_bid < 70 or default_bid > 100000:
            raise HTTPException(status_code=400, detail="입찰가는 70원~100,000원 사이여야 합니다")

        content = await file.read()
        if len(content) > 10 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="파일 크기가 10MB를 초과합니다")

        parsed = _parse_keyword_excel(content, default_bid, force_default_bid=force_default_bid)

        result: Dict[str, Any] = {
            "success": True,
            "filename": file.filename,
            "total": parsed["total"],
            "items": parsed["items"][:500],  # 미리보기 최대 500개
            "items_count": len(parsed["items"]),
            "errors": parsed["errors"][:100],
            "errors_count": len(parsed["errors"]),
            "registered": 0,
        }

        if auto_register:
            if not ad_group_id:
                raise HTTPException(status_code=400, detail="ad_group_id가 필요합니다")
            if not parsed["items"]:
                result["message"] = "등록할 키워드가 없습니다"
                return result

            optimizer = get_optimizer()
            from services.naver_ad_service import KeywordSuggestion
            suggestions = [
                KeywordSuggestion(keyword=it["keyword"], suggested_bid=it["bid"])
                for it in parsed["items"]
            ]
            added = await optimizer.bulk_manager.bulk_add_keywords(
                ad_group_id, suggestions, default_bid
            )
            result["registered"] = len(added)

            save_optimization_log(
                user_id, "excel_upload_register",
                f"엑셀 업로드 등록: {len(added)}/{len(parsed['items'])}개",
                {
                    "filename": file.filename,
                    "requested": len(parsed["items"]),
                    "added": len(added),
                    "ad_group_id": ad_group_id,
                }
            )
            result["message"] = f"{len(added)}개 키워드가 등록되었습니다"
        else:
            result["message"] = f"{parsed['total']}개 키워드 파싱 완료 (미리보기)"

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Excel upload error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============ 입찰가 관리 ============

@router.get("/bids/history")
async def get_bids_history(
    user_id: int = Depends(get_user_id_with_fallback),
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
    user_id: int = Depends(get_user_id_with_fallback),
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
    user_id: int = Depends(get_user_id_with_fallback)
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
    user_id: int = Depends(get_user_id_with_fallback),
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
    user_id: int = Depends(get_user_id_with_fallback),
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
    user_id: int = Depends(get_user_id_with_fallback)
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
    user_id: int = Depends(get_user_id_with_fallback),
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
    user_id: int = Depends(get_user_id_with_fallback),
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
    user_id: int = Depends(get_user_id_with_fallback),
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
    user_id: int = Depends(get_user_id_with_fallback),
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
async def get_campaigns(user_id: int = Depends(get_user_id_with_fallback)):
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
    user_id: int = Depends(get_user_id_with_fallback),
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
    user_id: int = Depends(get_user_id_with_fallback),
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


# ============ 광고 계정 연동 ============

class AdAccountRequest(BaseModel):
    customer_id: str = Field(..., description="네이버 광고 고객 ID")
    api_key: str = Field(..., description="API 키")
    secret_key: str = Field(..., description="비밀 키")
    name: Optional[str] = Field(None, description="계정 이름")


@router.post("/account/connect")
async def connect_ad_account(
    request: AdAccountRequest,
    user_id: int = Depends(get_user_id_with_fallback)
):
    """광고 계정 연동"""
    try:
        # 계정 정보 저장
        account = save_ad_account(
            user_id,
            request.customer_id,
            request.api_key,
            request.secret_key,
            request.name
        )

        # 연결 테스트 - 캠페인 목록 조회 시도
        from services.naver_ad_service import NaverAdApiClient
        test_client = NaverAdApiClient()
        test_client.customer_id = request.customer_id
        test_client.api_key = request.api_key
        test_client.secret_key = request.secret_key

        try:
            campaigns = await test_client.get_campaigns()
            # 연결 성공
            update_ad_account_status(user_id, request.customer_id, True)
            save_optimization_log(user_id, "account_connected", f"광고 계정이 연동되었습니다: {request.customer_id}")

            return {
                "success": True,
                "message": "광고 계정이 성공적으로 연동되었습니다",
                "account": {
                    "customer_id": request.customer_id,
                    "name": request.name,
                    "is_connected": True,
                    "campaigns_count": len(campaigns)
                }
            }
        except Exception as api_error:
            # 연결 실패
            update_ad_account_status(user_id, request.customer_id, False, str(api_error))
            return {
                "success": False,
                "message": f"API 연결 실패: {str(api_error)}",
                "error": str(api_error)
            }

    except Exception as e:
        logger.error(f"Account connect error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/account/status")
async def get_account_status(user_id: int = Depends(get_user_id_with_fallback)):
    """광고 계정 연동 상태 조회"""
    try:
        account = get_ad_account(user_id)

        if not account:
            return {
                "success": True,
                "is_connected": False,
                "message": "연동된 광고 계정이 없습니다"
            }

        return {
            "success": True,
            "is_connected": account.get("is_connected", False),
            "account": {
                "customer_id": account.get("customer_id"),
                "name": account.get("name"),
                "last_sync_at": account.get("last_sync_at"),
                "connection_error": account.get("connection_error")
            }
        }
    except Exception as e:
        logger.error(f"Account status error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/account/disconnect")
async def disconnect_ad_account(
    user_id: int = Depends(get_user_id_with_fallback),
    customer_id: str = Query(..., description="고객 ID")
):
    """광고 계정 연동 해제"""
    try:
        delete_ad_account(user_id, customer_id)
        save_optimization_log(user_id, "account_disconnected", f"광고 계정 연동이 해제되었습니다: {customer_id}")

        return {
            "success": True,
            "message": "광고 계정 연동이 해제되었습니다"
        }
    except Exception as e:
        logger.error(f"Account disconnect error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ 효율 추적 ============

@router.get("/efficiency/summary")
async def get_efficiency(
    user_id: int = Depends(get_user_id_with_fallback),
    days: int = Query(default=7, description="조회 기간 (일)")
):
    """효율 개선 요약"""
    try:
        summary = get_efficiency_summary(user_id, days)
        return {
            "success": True,
            "period_days": days,
            "data": summary
        }
    except Exception as e:
        logger.error(f"Efficiency summary error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/efficiency/history")
async def get_efficiency_chart(
    user_id: int = Depends(get_user_id_with_fallback),
    days: int = Query(default=30, description="조회 기간 (일)")
):
    """일별 효율 추적 이력 (차트용)"""
    try:
        history = get_efficiency_history(user_id, days)
        return {
            "success": True,
            "period_days": days,
            "data": history
        }
    except Exception as e:
        logger.error(f"Efficiency history error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ 트렌드 키워드 추천 ============

@router.get("/trending/keywords")
async def get_trending_keyword_recommendations(
    user_id: int = Depends(get_user_id_with_fallback),
    limit: int = Query(default=20, description="최대 개수")
):
    """트렌드 키워드 추천 조회"""
    try:
        keywords = get_trending_keywords(user_id, limit)
        return {
            "success": True,
            "count": len(keywords),
            "keywords": keywords
        }
    except Exception as e:
        logger.error(f"Trending keywords error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/trending/refresh")
async def refresh_trending_keywords(
    user_id: int = Depends(get_user_id_with_fallback),
    seed_keywords: List[str] = Query(default=[], description="시드 키워드")
):
    """트렌드 키워드 새로고침 - 네이버 광고 API에서 최신 키워드 가져오기"""
    try:
        optimizer = get_optimizer()

        # 시드 키워드가 없으면 기존 키워드 사용
        if not seed_keywords:
            # 기존 광고 키워드에서 시드 추출
            settings = get_optimization_settings(user_id)
            seed_keywords = settings.get("core_terms", []) if settings else []

        if not seed_keywords:
            return {
                "success": False,
                "message": "시드 키워드를 입력하거나 설정에서 핵심 키워드를 설정해주세요"
            }

        # 연관 키워드 발굴
        discovered = await optimizer.discovery.discover_related_keywords(
            seed_keywords=seed_keywords,
            max_keywords=50,
            min_search_volume=100,
            max_competition=0.85
        )

        # 트렌드 점수 계산 및 저장
        trending_data = []
        for kw in discovered:
            # 기회 점수 계산 (검색량 높고 경쟁 낮을수록 높음)
            search_vol = kw.monthly_search_count
            comp = kw.competition_index
            opportunity = (search_vol / 1000) * (1 - comp) * 100 if comp < 1 else 0

            trending_data.append({
                "keyword": kw.keyword,
                "category": seed_keywords[0] if seed_keywords else "일반",
                "search_volume_current": search_vol,
                "search_volume_prev_week": int(search_vol * 0.9),  # 10% 상승 가정
                "search_volume_change_rate": 10.0,
                "competition_level": kw.competition_level,
                "competition_index": comp,
                "suggested_bid": kw.suggested_bid,
                "opportunity_score": round(opportunity, 1),
                "relevance_score": kw.relevance_score,
                "trend_score": round(kw.potential_score * 10, 1),
                "recommendation_reason": f"검색량 {search_vol:,}회, 경쟁도 {kw.competition_level}"
            })

        save_trending_keywords(user_id, trending_data)

        return {
            "success": True,
            "message": f"{len(trending_data)}개의 트렌드 키워드가 발굴되었습니다",
            "count": len(trending_data),
            "keywords": trending_data[:10]  # 상위 10개만 미리보기
        }
    except Exception as e:
        logger.error(f"Refresh trending keywords error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class AddTrendingKeywordRequest(BaseModel):
    keyword: str = Field(..., description="키워드")
    ad_group_id: str = Field(default="", description="광고그룹 ID (미지정 시 기본 광고그룹)")
    bid: int = Field(default=100, description="입찰가")


@router.post("/trending/add-to-campaign")
async def add_trending_to_campaign(
    req: AddTrendingKeywordRequest,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """트렌드 키워드를 광고에 추가"""
    try:
        optimizer = get_optimizer()

        # 키워드 추가 — nccAdgroupId는 URL query에 별도 전달 필요
        result = await optimizer.api.create_keywords([{
            "nccAdgroupId": req.ad_group_id,
            "keyword": req.keyword,
            "bidAmt": req.bid,
            "useGroupBidAmt": False
        }], ad_group_id=req.ad_group_id)

        # 상태 업데이트
        update_trending_keyword_status(user_id, req.keyword, "added")
        save_optimization_log(user_id, "keyword_added", f"트렌드 키워드 '{req.keyword}'가 광고에 추가되었습니다")

        return {
            "success": True,
            "message": f"키워드 '{req.keyword}'가 광고에 추가되었습니다",
            "result": result
        }
    except Exception as e:
        logger.error(f"Add trending keyword error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ 종합 대시보드 ============

@router.get("/dashboard/comprehensive")
async def get_comprehensive_dashboard(user_id: int = Depends(get_user_id_with_fallback)):
    """종합 대시보드 - 계정 상태, 효율, 트렌드 모두 포함"""
    try:
        # 계정 상태
        account = get_ad_account(user_id)

        # 기본 대시보드
        stats = get_dashboard_stats(user_id)

        # 효율 요약
        efficiency = get_efficiency_summary(user_id, 7)

        # 트렌드 키워드
        trending = get_trending_keywords(user_id, 5)

        # 최근 입찰 변경
        recent_changes = get_bid_history(user_id, limit=5)

        return {
            "success": True,
            "data": {
                "account": {
                    "is_connected": account.get("is_connected", False) if account else False,
                    "customer_id": account.get("customer_id") if account else None,
                    "last_sync_at": account.get("last_sync_at") if account else None
                },
                "stats": stats,
                "efficiency": efficiency,
                "trending_keywords": trending,
                "recent_changes": recent_changes
            }
        }
    except Exception as e:
        logger.error(f"Comprehensive dashboard error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ Phase 3: 키워드 풀 자동 워커 endpoints ============
import os as _os
import hmac as _hmac
from fastapi import Header
from database.keyword_pool_db import get_keyword_pool_db
from database.registered_keywords_db import get_registered_keywords_db


# 도메인 의미 토큰 — 사업 영역(금융/대출/의료/소상공인/정부지원) 안전 가드.
# 키워드가 시드 substring을 통과해도 이 중 1개 이상 포함해야 풀에 INSERT.
# 예: 시드 '은행' → '은행대출/은행이자' 통과, '은행나무/은행잎차' reject.
POOL_DOMAIN_TOKENS = (
    # 금융/대출
    "대출", "자금", "한도", "이자", "금리", "신용", "담보", "보증",
    "마통", "통장", "주담대", "전세", "월세", "환급", "예금", "적금", "은행",
    # 정부/지원금
    "지원금", "정책자금", "정부지원", "청년", "신청", "장려금", "바우처",
    # 소상공인/창업/사업자 운영
    "소상공인", "사업자", "자영업", "창업", "개원", "개업", "양도", "양수",
    "운영", "프랜차이즈", "매장", "점포", "임대", "분양", "매매",
    "매출", "수수료", "결제", "권리금", "매물", "임차", "임대차",
    "세무", "회계", "노무", "법인", "장부", "기장",
    "할부", "리스", "렌트", "렌탈", "수출", "무역", "경매",
    # 사업자 인접 금융상품
    "보험", "카드", "펀드", "연금", "공제", "IRP", "퇴직", "CMA", "MMF",
    "세금", "정산", "환산", "공제금", "환급금", "절세",
    # 의료 — 진료과/시설
    "병원", "약국", "약사", "의사", "의료", "원장", "진료", "검진", "요양",
    "한의원", "한방", "치과", "정형외과", "내과", "외과", "안과", "피부과",
    "이비인후과", "산부인과", "성형외과", "비뇨기과", "흉부외과", "재활",
    "임플란트", "교정", "보톡스", "필러", "시술", "수술",
    # 뷰티/미용
    "미용", "미용실", "헤어", "네일", "왁싱", "타투", "속눈썹", "두피", "성형",
    # 외식업
    "카페", "식당", "음식점", "분식", "치킨", "주점", "베이커리", "떡볶이",
    "피자", "초밥", "곱창", "파스타", "한식", "일식", "야식", "설렁탕", "순두부",
    "반찬", "마트", "가게", "식자재", "배달", "배민", "쿠팡이츠",
    # 피트니스/교육/생활
    "필라테스", "요가", "헬스장", "학원", "교육", "강의", "과외", "유치원", "어린이집",
    "펜션", "모텔", "오피스텔", "아파트", "원룸", "상가", "공장", "창고", "주택", "사무실", "점포",
    # 차량/장비
    "할부", "리스", "렌트", "렌탈", "차량", "오토바이", "트랙터", "택시", "경운기",
)


def _has_domain_token(kw: str) -> bool:
    return any(t in kw for t in POOL_DOMAIN_TOKENS)


def _derive_seed_tokens(seeds: List[str], min_freq: int = 2) -> set:
    """시드 목록에서 도메인 토큰을 자동 추출 — 신규 분야 광고주 자동 적응.

    - 2~3글자 n-gram 추출 후 ≥ min_freq 시드에서 등장한 것만 토큰화 (의미 보장)
    - 길이 4+ 토큰은 단일 시드만으로도 채택 (긴 토큰은 우연 일치 거의 없음)
    - POOL_DOMAIN_TOKENS 와 합쳐 최종 게이트 토큰셋 구성
    """
    counts: Dict[str, int] = {}
    for s in seeds or []:
        if not s or len(s) < 2:
            continue
        seen_in_seed = set()
        for n in (2, 3):
            for i in range(len(s) - n + 1):
                t = s[i:i + n]
                if t in seen_in_seed:
                    continue
                seen_in_seed.add(t)
                counts[t] = counts.get(t, 0) + 1
        # 시드 통째도 토큰 (길이 4+ 자주 단일 시드만으로도 의미 보장)
        if len(s) >= 4:
            counts[s] = counts.get(s, 0) + min_freq  # 단일 시드만으로도 통과
    return {t for t, c in counts.items() if c >= min_freq}


def _build_domain_token_set(seeds: List[str]) -> set:
    """하드코딩 토큰 + 시드에서 도출된 토큰 합집합 (정적 baseline + 동적 적응)."""
    return set(POOL_DOMAIN_TOKENS) | _derive_seed_tokens(seeds)


def _parse_naver_count(v) -> int:
    """네이버 keywordstool 검색량 — 10 미만이면 '< 10' 문자열로 옴. 안전 변환."""
    if v is None:
        return 0
    if isinstance(v, (int, float)):
        return int(v)
    s = str(v).strip()
    if not s:
        return 0
    if s.startswith("<"):
        return 5  # '< 10' → 보수적으로 5
    try:
        return int(s)
    except (ValueError, TypeError):
        return 0


def _verify_cron_token(authorization: Optional[str]) -> None:
    expected = (_os.environ.get("CRON_TOKEN") or "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="CRON_TOKEN 미설정")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer 토큰 필요")
    provided = authorization.split(" ", 1)[1].strip()
    if not _hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=403, detail="잘못된 cron 토큰")


async def _run_pool_collect(uid: int, customer_id: Optional[int] = None, max_new: int = 5000, min_volume: int = 1):
    """수집 1회 — keywordstool로 새 키워드 발굴해 풀에 추가.
    customer_id 명시 시 그 광고주만 처리, 없으면 사용자의 가장 최근 광고주."""
    from services.naver_ad_service import NaverAdApiClient
    from database.naver_ad_db import get_ad_account_by_customer
    import time as _time

    pool = get_keyword_pool_db()
    t0 = _time.monotonic()

    if customer_id is not None:
        account = get_ad_account_by_customer(uid, str(customer_id))
    else:
        account = get_ad_account(uid)
    if not account or not account.get("is_connected"):
        pool.record_run(uid, customer_id, "collect", "no_account",
                        error_message="광고 계정 미연결",
                        duration_ms=int((_time.monotonic()-t0)*1000))
        return
    customer_id = int(account.get("customer_id"))
    customer_id_for_log = customer_id

    reg = get_registered_keywords_db()
    pool_pending = (pool.stats(customer_id).get("by_status") or {}).get("pending", 0)
    active_reg = int((reg.stats(customer_id) or {}).get("active") or 0)
    headroom = 100_000 - active_reg - pool_pending
    if headroom <= 0:
        logger.warning(f"[pool/collect] user={uid} 한도 도달 — skip (active={active_reg}, pending={pool_pending})")
        pool.record_run(uid, customer_id, "collect", "cap_reached",
                        pending_after=pool_pending,
                        error_message=f"active={active_reg}+pending={pool_pending}≥100000",
                        duration_ms=int((_time.monotonic()-t0)*1000))
        return
    target = min(max_new, headroom)

    # 동적 도메인 토큰셋 — 하드코딩 + 시드 자동 도출. 새 분야 광고주 자동 적응.
    initial_seeds = pool.list_seed_whitelist(customer_id)
    domain_token_set = _build_domain_token_set(initial_seeds)
    derived_count = len(domain_token_set) - len(POOL_DOMAIN_TOKENS)
    logger.warning(
        f"[pool/collect] user={uid} 도메인 토큰 {len(domain_token_set)}개 "
        f"(하드코딩 {len(POOL_DOMAIN_TOKENS)} + 시드 도출 {max(derived_count, 0)})"
    )

    # 도메인 미포함 키워드 자동 cleanup (registered 제외) — 매 라운드 시작 시
    try:
        cleaned = pool.cleanup_offdomain(customer_id, list(domain_token_set))
        if cleaned > 0:
            logger.warning(f"[pool/cleanup] off-domain row 자동 삭제 {cleaned}개")
    except Exception as e:
        logger.warning(f"[pool/cleanup] 실패: {e}")

    # 자동 승격 시드 중 자식 0 + 30분 경과 자력 삭제 (user_seed는 면제)
    try:
        childless = pool.cleanup_childless_auto_seeds(customer_id, min_age_minutes=30)
        if childless > 0:
            logger.warning(f"[pool/cleanup] 자식 0 자동 시드 자력 삭제 {childless}개")
    except Exception as e:
        logger.warning(f"[pool/cleanup-childless] 실패: {e}")

    # 시드 자가확장: 강화 — 라운드당 50, min_volume 30, cap 500, 도메인 토큰 검증
    try:
        promoted = pool.promote_seeds(
            customer_id, limit=50, min_volume=30, max_total_seeds=500,
            domain_tokens=list(domain_token_set),
        )
        if promoted:
            logger.warning(
                f"[pool/collect] user={uid} 시드 자동 승격 {len(promoted)}개: "
                + ", ".join(f"{p['keyword']}({p['monthly_total']})" for p in promoted)
            )
            # 승격 후 토큰셋 재계산 — 새 시드의 토큰 반영
            domain_token_set = _build_domain_token_set(
                pool.list_seed_whitelist(customer_id)
            )
    except Exception as e:
        logger.warning(f"[pool/collect] promote_seeds 실패: {e}")
        promoted = []

    seeds = pool.get_recent_seeds(customer_id, limit=120)
    if not seeds:
        logger.warning(f"[pool/collect] user={uid} 시드 없음 — UI에서 초기 시드 제공 필요")
        pool.record_run(uid, customer_id, "collect", "no_seed",
                        pending_after=pool_pending,
                        error_message="UI에서 초기 시드 추가 필요",
                        duration_ms=int((_time.monotonic()-t0)*1000))
        return

    # 화이트리스트: user_seed + auto_promoted_seed 모두 포함.
    # 발굴 키워드는 이 시드 중 하나와 substring 관계여야 풀에 들어감 → 엉뚱한 키워드 차단.
    whitelist = pool.list_seed_whitelist(customer_id)
    if not whitelist:
        whitelist = seeds  # 폴백
    logger.warning(
        f"[pool/collect] user={uid} 시작 target={target} seeds={len(seeds)} "
        f"whitelist={len(whitelist)} promoted={len(promoted)}"
    )

    client = NaverAdApiClient()
    client.customer_id = account["customer_id"]
    client.api_key = account["api_key"]
    client.secret_key = account["secret_key"]

    def _matches_whitelist(kw: str) -> str:
        # 반환: "" = 통과, "domain" = 도메인 토큰 0개, "seed" = 시드 substring 매치 실패.
        # 도메인 토큰셋은 하드코딩 + 시드 자동 도출 합집합 (closure 변수 domain_token_set).
        if not any(t in kw for t in domain_token_set):
            return "domain"
        for s in whitelist:
            if not s or len(s) < 2:
                continue
            if s in kw or kw in s:
                return ""
        return "seed"

    added = 0
    rejected = 0
    reject_no_domain = 0
    reject_no_seed_match = 0
    sample_no_domain: List[str] = []
    sample_no_seed: List[str] = []
    api_errors: List[str] = []
    seeds_processed = 0
    bfs_calls = 0

    # 시드 셔플 — 매 라운드 다른 60개 처리 (200 시드 다양성 확보).
    seed_pool = list(seeds)
    random.shuffle(seed_pool)
    seed_round = seed_pool[:60]
    for seed in seed_round:  # 시드 한 라운드 처리 한도 (BFS 추가로 호출 폭증 방지)
        if added >= target:
            break
        seeds_processed += 1
        try:
            related = await client.get_related_keywords(seed, show_detail=True)
        except Exception as e:
            msg = f"{seed}: {type(e).__name__}: {str(e)[:80]}"
            logger.warning(f"[pool/collect] API 실패 {msg}")
            api_errors.append(msg)
            continue
        items = related.get("keywordList", []) if isinstance(related, dict) else []
        candidates = []
        bfs_pool: List[tuple] = []  # (kw, volume)
        for item in items:
            kw = (item.get("relKeyword") or "").strip()
            if not kw:
                continue
            pc = _parse_naver_count(item.get("monthlyPcQcCnt"))
            mob = _parse_naver_count(item.get("monthlyMobileQcCnt"))
            mt = pc + mob
            if mt < min_volume:
                continue
            reason = _matches_whitelist(kw)
            if reason:
                rejected += 1
                if reason == "domain":
                    reject_no_domain += 1
                    if len(sample_no_domain) < 10:
                        sample_no_domain.append(kw)
                else:
                    reject_no_seed_match += 1
                    if len(sample_no_seed) < 10:
                        sample_no_seed.append(kw)
                continue
            candidates.append({
                "keyword": kw, "monthly_total": mt,
                "monthly_pc": pc,
                "monthly_mobile": mob,
                "comp_idx": item.get("compIdx"),
                "seed": seed,
            })
            # BFS 후보: 검색량 ≥ 100 + 도메인 통과 + 길이 ≥ 2 (영역 천장 대응)
            if mt >= 100 and len(kw) >= 2:
                bfs_pool.append((kw, mt))
        added += pool.add_candidates(uid, customer_id, candidates)
        await asyncio.sleep(0.3)

        # BFS 2nd-level — 시드당 검색량 상위 2개
        bfs_pool.sort(key=lambda x: -x[1])
        for bfs_kw, _ in bfs_pool[:2]:
            try:
                bfs_calls += 1
                related2 = await client.get_related_keywords(bfs_kw, show_detail=True)
                items2 = related2.get("keywordList", []) if isinstance(related2, dict) else []
                sub_candidates = []
                for item2 in items2:
                    kw2 = (item2.get("relKeyword") or "").strip()
                    if not kw2:
                        continue
                    pc2 = _parse_naver_count(item2.get("monthlyPcQcCnt"))
                    mob2 = _parse_naver_count(item2.get("monthlyMobileQcCnt"))
                    mt2 = pc2 + mob2
                    if mt2 < min_volume:
                        continue
                    reason2 = _matches_whitelist(kw2)
                    if reason2:
                        rejected += 1
                        if reason2 == "domain":
                            reject_no_domain += 1
                            if len(sample_no_domain) < 10:
                                sample_no_domain.append(kw2)
                        else:
                            reject_no_seed_match += 1
                            if len(sample_no_seed) < 10:
                                sample_no_seed.append(kw2)
                        continue
                    sub_candidates.append({
                        "keyword": kw2, "monthly_total": mt2,
                        "monthly_pc": pc2,
                        "monthly_mobile": mob2,
                        "comp_idx": item2.get("compIdx"),
                        "seed": seed,
                    })
                added += pool.add_candidates(uid, customer_id, sub_candidates)
                await asyncio.sleep(0.3)
            except Exception as e:
                logger.warning(f"[pool/collect/BFS] {bfs_kw} 실패: {e}")
    logger.warning(
        f"[pool/collect] user={uid} 새 키워드 {added}개 "
        f"(rejected {rejected} = 도메인미스 {reject_no_domain} / 시드미스 {reject_no_seed_match}, "
        f"시드 {seeds_processed}개, BFS {bfs_calls}회)"
    )
    if sample_no_domain:
        logger.warning(f"[pool/collect] 도메인미스 샘플: {', '.join(sample_no_domain)}")
    if sample_no_seed:
        logger.warning(f"[pool/collect] 시드미스 샘플: {', '.join(sample_no_seed)}")
    pending_after = (pool.stats(customer_id).get("by_status") or {}).get("pending", 0)
    err_parts = list(api_errors)
    if rejected > 0:
        err_parts.append(
            f"화이트리스트 reject {rejected}개 "
            f"(도메인미스 {reject_no_domain} / 시드미스 {reject_no_seed_match})"
        )
    pool.record_run(
        uid, customer_id, "collect",
        "success" if not api_errors else ("partial" if added > 0 else "failed"),
        added=added, skipped=rejected, seeds_count=seeds_processed,
        pending_after=pending_after,
        error_message=" | ".join(err_parts)[:500] if err_parts else None,
        duration_ms=int((_time.monotonic()-t0)*1000),
    )

    # 데드락 감지 — 최근 5회 collect 가 전부 added=0 + reject ≥ 500 이면 alert.
    # 사용자가 며칠 동안 0건인 걸 모르고 지나치는 사고 방지.
    try:
        deadlock = pool.detect_collect_deadlock(customer_id, n_recent=5, min_rejected=500)
        if deadlock.get("is_deadlock"):
            logger.error(
                f"[pool/collect] DEADLOCK user={uid} customer={customer_id} "
                f"— 최근 {deadlock['consecutive_zero_runs']}회 연속 0건 + "
                f"누적 reject {deadlock['total_rejected']}. "
                f"시드/도메인 토큰 점검 필요."
            )
            pool.record_run(
                uid, customer_id, "collect", "alert",
                error_message=(
                    f"[DEADLOCK] {deadlock['consecutive_zero_runs']}회 연속 0건. "
                    f"시드/도메인 점검 필요."
                ),
                duration_ms=0,
            )
    except Exception as e:
        logger.warning(f"[pool/collect] deadlock 감지 실패: {e}")


async def _run_pool_register(uid: int, customer_id: Optional[int] = None, batch: int = 3000, bid: int = 100):
    """등록 1회 — pending → orchestrator로 일괄.
    customer_id 명시 시 그 광고주만 처리, 없으면 사용자의 가장 최근 광고주."""
    from services.bulk_upload_orchestrator import BulkUploadOrchestrator, BulkJobConfig
    from services.naver_ad_service import NaverAdApiClient
    from database.naver_ad_db import get_ad_account_by_customer
    import time as _time

    pool = get_keyword_pool_db()
    t0 = _time.monotonic()

    if customer_id is not None:
        account = get_ad_account_by_customer(uid, str(customer_id))
    else:
        account = get_ad_account(uid)
    if not account or not account.get("is_connected"):
        pool.record_run(uid, customer_id, "register", "no_account",
                        error_message="광고 계정 미연결",
                        duration_ms=int((_time.monotonic()-t0)*1000))
        return
    customer_id = int(account.get("customer_id"))

    pending = pool.claim_pending(customer_id, limit=batch, min_volume=1)
    if not pending:
        pending_total = (pool.stats(customer_id).get("by_status") or {}).get("pending", 0)
        logger.warning(f"[pool/register] user={uid} pending 없음 (전체 pending={pending_total})")
        pool.record_run(uid, customer_id, "register", "no_pending",
                        pending_after=pending_total,
                        error_message=f"전체 pending={pending_total}" if pending_total else "pending 0",
                        duration_ms=int((_time.monotonic()-t0)*1000))
        return
    keywords = [p["keyword"] for p in pending]
    logger.warning(f"[pool/register] user={uid} 시작 batch={len(keywords)}")

    client = NaverAdApiClient()
    client.customer_id = account["customer_id"]
    client.api_key = account["api_key"]
    client.secret_key = account["secret_key"]

    # 호출 전 등록 set 캐시 — 호출 후 차집합으로 진짜 신규만 success 판정.
    reg = get_registered_keywords_db()
    existing_before = set(reg.get_existing_set(customer_id, keywords) or set())

    # 캠페인 재사용 — 매 라운드 새 캠페인 만들면 캠페인 폭증. 기존 풀 캠페인 광고그룹 cap (50)
    # 까지 같은 캠페인에 광고그룹 추가. 도달 시 새 캠페인 생성.
    pool_state = pool.get_active_pool_campaign(customer_id)
    AD_GROUPS_PER_POOL_CAMPAIGN = 50  # 50 × 1000 = 50,000 키워드/캠페인. 100k = 캠페인 2개.
    reuse_id: Optional[str] = None
    start_idx = 0
    new_groups_in_round = (len(keywords) + 999) // 1000  # 1000개당 광고그룹 1개
    if pool_state and pool_state.get("ad_groups_count", 0) + new_groups_in_round <= AD_GROUPS_PER_POOL_CAMPAIGN:
        reuse_id = pool_state["campaign_id"]
        start_idx = pool_state["ad_groups_count"]
        logger.warning(
            f"[pool/register] 캠페인 재사용 cid={reuse_id} groups={pool_state['ad_groups_count']}+{new_groups_in_round}"
        )

    job_id = create_bulk_upload_job(
        user_id=uid,
        filename=f"pool_auto_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
        campaign_prefix="auto",
        keywords_per_group=1000,
        bid=bid,
        daily_budget=10000,
        total_keywords=len(keywords),
    )
    cfg = BulkJobConfig(
        job_id=job_id, user_id=uid,
        campaign_prefix="auto", keywords_per_group=1000,
        bid=bid, daily_budget=10000, campaign_tp="WEB_SITE",
        reuse_campaign_id=reuse_id,
        start_ad_group_index=start_idx,
    )
    orchestrator = BulkUploadOrchestrator(client)
    try:
        result = await orchestrator.run(cfg, keywords)
    except Exception as e:
        logger.error(f"[pool/register] orchestrator 실패: {e}", exc_info=True)
        pool.mark_status([p["id"] for p in pending], "failed",
                         error_message=f"{type(e).__name__}: {str(e)[:200]}")
        pool.record_run(uid, customer_id, "register", "failed",
                        failed=len(pending),
                        error_message=f"{type(e).__name__}: {str(e)[:300]}",
                        duration_ms=int((_time.monotonic()-t0)*1000))
        return

    existing_after = set(reg.get_existing_set(customer_id, keywords) or set())
    new_in_naver = existing_after - existing_before  # 진짜 신규 등록

    # 풀 state 업데이트 — 캠페인 재사용 또는 새 캠페인 등록
    try:
        result_campaign_ids = result.get("campaign_ids") or []
        ad_groups_in_round = (len(keywords) + 999) // 1000
        if reuse_id:
            # 같은 캠페인에 광고그룹 추가됨
            pool.increment_pool_ad_groups(customer_id, ad_groups_in_round)
        elif result_campaign_ids:
            # 새 캠페인 → state 갱신
            pool.set_active_pool_campaign(customer_id, result_campaign_ids[0], ad_groups_in_round)
    except Exception as e:
        logger.warning(f"[pool/register] state 갱신 실패: {e}")

    succeeded_ids = [p["id"] for p in pending if p["keyword"] in new_in_naver]
    skipped_ids = [p["id"] for p in pending if p["keyword"] in existing_before]
    failed_ids = [
        p["id"] for p in pending
        if p["keyword"] not in new_in_naver and p["keyword"] not in existing_before
    ]
    pool.mark_status(succeeded_ids, "registered")
    pool.mark_status(skipped_ids, "skipped_existing",
                     error_message="이미 네이버 광고에 등록된 키워드 — orchestrator dedup")
    err_msg = str(result.get("error", "did not register"))[:300] if not result.get("success") else None
    pool.mark_status(failed_ids, "failed",
                     error_message=err_msg or "orchestrator did not register")
    logger.warning(
        f"[pool/register] user={uid} 신규={len(succeeded_ids)} "
        f"이미있음={len(skipped_ids)} fail={len(failed_ids)}"
    )
    pending_after = (pool.stats(customer_id).get("by_status") or {}).get("pending", 0)
    pool.record_run(
        uid, customer_id, "register",
        "success" if len(succeeded_ids) > 0 and len(failed_ids) == 0
            else ("partial" if len(succeeded_ids) > 0 else ("failed" if len(failed_ids) > 0 else "no_new")),
        registered=len(succeeded_ids), failed=len(failed_ids), skipped=len(skipped_ids),
        pending_after=pending_after,
        error_message=err_msg,
        duration_ms=int((_time.monotonic()-t0)*1000),
    )

    # 노출제한 검사 — 매 register tick에 전체 풀 광고그룹 일괄 검사 + 자동 삭제
    try:
        import sqlite3 as _sqlite3
        with _sqlite3.connect(reg.db_path) as _conn:
            all_ag_ids = [r[0] for r in _conn.execute(
                "SELECT DISTINCT ad_group_id FROM registered_keywords WHERE account_customer_id=? AND ad_group_id IS NOT NULL",
                (customer_id,),
            ).fetchall()]
        if all_ag_ids:
            await _inspect_ad_groups(uid, customer_id, client, all_ag_ids, delete_from_naver=True)
    except Exception as e:
        logger.warning(f"[pool/register] inspect 실패: {e}")


async def _inspect_ad_groups(
    uid: int,
    customer_id: int,
    client,
    ad_group_ids: List[str],
    delete_from_naver: bool = True,
):
    """광고그룹들 키워드 검토 상태 조회 → 노출제한:
       1) 풀에 mark
       2) 네이버 광고에서 키워드 DELETE
       3) registered_keywords DB에서 row 제거 (active 카운트 정확화)"""
    if not ad_group_ids:
        return 0
    pool = get_keyword_pool_db()
    reg = get_registered_keywords_db()
    rejected_items: List[Dict] = []
    rejected_naver_ids: List[Tuple[str, str]] = []  # (ncc_keyword_id, keyword)
    for ag_id in ad_group_ids:
        try:
            kws = await client.get_keywords(ad_group_id=ag_id) or []
        except Exception as e:
            logger.warning(f"[pool/inspect] {ag_id} 조회 실패: {e}")
            continue
        for kw in kws:
            kw_text = kw.get("keyword")
            if not kw_text:
                continue
            review = (kw.get("reviewStatus") or "").upper()
            inspect = (kw.get("inspectStatus") or "").upper()
            status = (kw.get("status") or "").upper()
            stat_reason = (kw.get("statusReason") or "").upper()
            user_lock = kw.get("userLock", False)
            # 광범위 검출 — substring 기반 (다양한 status 표기 포괄)
            blocked_tokens = ("REJECT", "PROHIBIT", "BLOCK", "DENY", "EXPIRED", "DISAPPROVE", "REVIEW_FAIL", "INELIGIBLE")
            is_rejected = (
                any(t in review for t in blocked_tokens)
                or any(t in inspect for t in blocked_tokens)
                or any(t in stat_reason for t in blocked_tokens)
                or status == "PAUSED"
                or user_lock is True
            )
            if is_rejected:
                rejected_items.append({
                    "keyword": kw_text,
                    "reason": f"review={review} inspect={inspect} status={status} reason={stat_reason} userLock={user_lock}",
                })
                kid = kw.get("nccKeywordId")
                if kid:
                    rejected_naver_ids.append((kid, kw_text))
        await asyncio.sleep(0.15)

    n_mark = pool.mark_rejected_by_naver(customer_id, rejected_items)

    # 네이버에서 실제 DELETE — 실패 시 PUT pause로 fallback (광고 노출만 차단)
    n_deleted = 0
    n_paused = 0
    if delete_from_naver and rejected_naver_ids:
        for kid, kw_text in rejected_naver_ids:
            ok = False
            try:
                await client.delete_keyword(kid)
                # registered_keywords DB에서도 row 삭제 (한도 카운트 정확화)
                try:
                    with __import__("sqlite3").connect(reg.db_path) as conn:
                        conn.execute(
                            "DELETE FROM registered_keywords WHERE account_customer_id=? AND ncc_keyword_id=?",
                            (customer_id, kid),
                        )
                except Exception:
                    pass
                n_deleted += 1
                ok = True
            except Exception as e:
                # DELETE 권한 1018 등 실패 시 — pause(userLock)로 광고 노출만 차단
                try:
                    await client.pause_keyword(kid)
                    n_paused += 1
                    ok = True
                except Exception as e2:
                    logger.warning(f"[pool/inspect] DELETE+PAUSE 모두 실패 {kw_text}({kid}): del={e} pause={e2}")
            if ok:
                await asyncio.sleep(0.15)

    if n_mark > 0 or n_deleted > 0:
        logger.warning(
            f"[pool/inspect] user={uid} mark={n_mark} 네이버삭제={n_deleted} ({len(ad_group_ids)} 그룹)"
        )
    # 실행 이력 기록 — 화면에 보이게
    try:
        pool.record_run(
            uid, customer_id, "inspect",
            "success" if n_deleted > 0 or n_mark > 0 else "no_new",
            registered=0, failed=0, skipped=n_deleted,  # skipped 컬럼에 삭제 카운트
            seeds_count=len(ad_group_ids),
            error_message=f"광고그룹 {len(ad_group_ids)}개 검사 — mark {n_mark} / 네이버 DELETE {n_deleted}" if (n_mark or n_deleted) else f"검사 {len(ad_group_ids)}개 그룹 — 노출제한 0",
        )
    except Exception:
        pass
    return n_mark


async def _run_pool_workers_for_users(user_ids: List[int]):
    pool = get_keyword_pool_db()
    for uid in user_ids:
        try:
            await _run_pool_collect(uid)
        except Exception as e:
            logger.error(f"[pool/run] collect 실패 user={uid}: {e}", exc_info=True)
            try:
                acct = get_ad_account(uid)
                cid = int(acct.get("customer_id")) if acct else None
                pool.record_run(uid, cid, "collect", "failed",
                                error_message=f"{type(e).__name__}: {str(e)[:300]}")
            except Exception:
                pass
        try:
            await _run_pool_register(uid)
        except Exception as e:
            logger.error(f"[pool/run] register 실패 user={uid}: {e}", exc_info=True)
            try:
                acct = get_ad_account(uid)
                cid = int(acct.get("customer_id")) if acct else None
                pool.record_run(uid, cid, "register", "failed",
                                error_message=f"{type(e).__name__}: {str(e)[:300]}")
            except Exception:
                pass


@router.post("/keyword-pool/admin/run")
async def keyword_pool_admin_run(
    background_tasks: BackgroundTasks,
    authorization: Optional[str] = Header(None),
    user_id: Optional[int] = Query(None),
):
    """24h 자동 워커 — collect + register 통합 트리거 (Bearer 인증)."""
    _verify_cron_token(authorization)

    target_users: List[int] = []
    if user_id:
        target_users = [user_id]
    else:
        # 활성 광고 계정 사용자 — naver_ad_db 헬퍼 가정. 없으면 빈 리스트.
        try:
            from database.naver_ad_db import list_connected_ad_accounts
            target_users = [a["user_id"] for a in (list_connected_ad_accounts() or []) if a.get("user_id")]
        except Exception as e:
            logger.error(f"[pool/admin/run] list_connected_ad_accounts 실패: {type(e).__name__}: {e}", exc_info=True)
            target_users = []

    if not target_users:
        return {"success": True, "queued": 0, "message": "활성 광고 계정 없음"}

    background_tasks.add_task(_run_pool_workers_for_users, target_users)
    return {
        "success": True,
        "queued": len(target_users),
        "users": target_users,
        "timestamp": datetime.now().isoformat(timespec="seconds"),
    }


@router.get("/keyword-pool/accounts")
async def keyword_pool_list_accounts(user_id: int = Depends(get_user_id_with_fallback)):
    """사용자의 모든 활성 광고주 list (B 시나리오 — 다중 광고주)."""
    from database.naver_ad_db import list_ad_accounts_for_user
    rows = list_ad_accounts_for_user(user_id) or []
    return {
        "success": True,
        "accounts": [
            {
                "customer_id": str(r.get("customer_id")),
                "name": r.get("name"),
                "is_connected": bool(r.get("is_connected")),
                "last_sync_at": r.get("last_sync_at"),
            }
            for r in rows
        ],
    }


@router.get("/keyword-pool/stats")
async def keyword_pool_stats(
    user_id: int = Depends(get_user_id_with_fallback),
    customer_id: Optional[str] = None,
):
    """본인 풀/등록 상태 — customer_id 명시 시 그 광고주."""
    from database.naver_ad_db import get_ad_account_by_customer
    try:
        if customer_id:
            account = get_ad_account_by_customer(user_id, customer_id)
        else:
            account = get_ad_account(user_id)
        if not account:
            return {"success": False, "message": "광고 계정 미연결", "pool": {}, "registered": {}, "account_cap": 100_000}
        customer_id = int(account.get("customer_id"))
        pool = get_keyword_pool_db()
        reg = get_registered_keywords_db()
        try:
            pool_stats = pool.stats(customer_id)
        except Exception as e:
            logger.error(f"keyword-pool/stats pool.stats 실패: {e}", exc_info=True)
            pool_stats = {"error": f"{type(e).__name__}: {str(e)[:200]}"}
        try:
            reg_stats = reg.stats(customer_id)
        except Exception as e:
            logger.error(f"keyword-pool/stats reg.stats 실패: {e}", exc_info=True)
            reg_stats = {"error": f"{type(e).__name__}: {str(e)[:200]}"}
        try:
            recent = pool.recent_runs(customer_id, limit=20)
        except Exception as e:
            logger.error(f"keyword-pool/stats recent_runs 실패: {e}", exc_info=True)
            recent = []
        try:
            seed_break = pool.seed_breakdown(customer_id)
        except Exception as e:
            logger.error(f"keyword-pool/stats seed_breakdown 실패: {e}", exc_info=True)
            seed_break = []
        try:
            recent_kw = pool.recent_keywords(customer_id, limit=30)
        except Exception as e:
            logger.error(f"keyword-pool/stats recent_keywords 실패: {e}", exc_info=True)
            recent_kw = []
        try:
            deadlock = pool.detect_collect_deadlock(customer_id, n_recent=5, min_rejected=500)
        except Exception as e:
            logger.error(f"keyword-pool/stats detect_collect_deadlock 실패: {e}", exc_info=True)
            deadlock = {"is_deadlock": False, "consecutive_zero_runs": 0, "total_rejected": 0}
        return {
            "success": True,
            "customer_id": customer_id,
            "pool": pool_stats,
            "registered": reg_stats,
            "account_cap": 100_000,
            "recent_runs": recent,
            "seed_breakdown": seed_break,
            "recent_keywords": recent_kw,
            "collect_deadlock": deadlock,
            "now": datetime.now().isoformat(timespec="seconds"),
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"keyword-pool/stats 전체 실패: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)[:300]}")


class PoolSeedsRequest(BaseModel):
    seeds: List[str]


class AdminSeedsRequest(BaseModel):
    seeds: List[str]
    user_id: int


@router.post("/keyword-pool/admin/add-seeds")
async def keyword_pool_admin_add_seeds(
    request: AdminSeedsRequest,
    authorization: Optional[str] = Header(None),
):
    """Bearer 토큰으로 시드 일괄 추가 — workflow_dispatch / curl 용."""
    _verify_cron_token(authorization)
    try:
        account = get_ad_account(request.user_id)
        if not account or not account.get("is_connected"):
            raise HTTPException(status_code=400, detail=f"user_id={request.user_id} 광고 계정 미연결")
        customer_id = int(account.get("customer_id"))
        pool = get_keyword_pool_db()
        items = [
            {"keyword": s.strip(), "seed": s.strip(), "source": "user_seed", "monthly_total": 0}
            for s in request.seeds if s and s.strip()
        ]
        added = pool.add_candidates(request.user_id, customer_id, items)
        return {"success": True, "added": added, "total_input": len(items),
                "user_id": request.user_id, "customer_id": customer_id}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"keyword-pool/admin/add-seeds 실패: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)[:300]}")


class AdminInspectRequest(BaseModel):
    user_id: int


@router.post("/keyword-pool/admin/inspect-all")
async def keyword_pool_admin_inspect_all(
    request: AdminInspectRequest,
    authorization: Optional[str] = Header(None),
):
    """모든 풀 광고그룹 키워드 검토 상태 조회 → 노출제한 mark."""
    _verify_cron_token(authorization)
    try:
        from services.naver_ad_service import NaverAdApiClient
        account = get_ad_account(request.user_id)
        if not account or not account.get("is_connected"):
            raise HTTPException(status_code=400, detail="광고 계정 미연결")
        customer_id = int(account.get("customer_id"))
        reg = get_registered_keywords_db()
        # 광고그룹 list
        with __import__("sqlite3").connect(reg.db_path) as conn:
            ag_ids = [r[0] for r in conn.execute(
                "SELECT DISTINCT ad_group_id FROM registered_keywords WHERE account_customer_id=? AND ad_group_id IS NOT NULL",
                (customer_id,),
            ).fetchall()]
        if not ag_ids:
            return {"success": True, "ad_groups": 0, "rejected": 0}
        client = NaverAdApiClient()
        client.customer_id = account["customer_id"]
        client.api_key = account["api_key"]
        client.secret_key = account["secret_key"]
        n = await _inspect_ad_groups(request.user_id, customer_id, client, ag_ids)
        return {"success": True, "ad_groups": len(ag_ids), "rejected": n}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"keyword-pool/admin/inspect-all 실패: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)[:300]}")


class AdminDeleteRequest(BaseModel):
    keywords: List[str]
    user_id: int


@router.post("/keyword-pool/admin/delete-keywords")
async def keyword_pool_admin_delete_keywords(
    request: AdminDeleteRequest,
    authorization: Optional[str] = Header(None),
):
    """Bearer 토큰으로 풀에서 특정 키워드 일괄 삭제 — cleanup용."""
    _verify_cron_token(authorization)
    try:
        account = get_ad_account(request.user_id)
        if not account:
            raise HTTPException(status_code=400, detail=f"user_id={request.user_id} 광고 계정 없음")
        customer_id = int(account.get("customer_id"))
        pool = get_keyword_pool_db()
        deleted = pool.delete_keywords(customer_id, request.keywords)
        return {"success": True, "deleted": deleted, "user_id": request.user_id}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"keyword-pool/admin/delete-keywords 실패: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)[:300]}")


@router.get("/keyword-pool/clicked-keywords")
async def keyword_pool_clicked_keywords(
    days: int = 7,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """클릭 발생한 키워드 list — 사용자 검수용. 시드 매칭 여부 표시."""
    from services.naver_ad_service import NaverAdApiClient
    from datetime import datetime, timedelta
    import sqlite3 as _sqlite3

    try:
        account = get_ad_account(user_id)
        if not account or not account.get("is_connected"):
            raise HTTPException(status_code=400, detail="광고 계정 미연결")
        customer_id = int(account.get("customer_id"))

        reg = get_registered_keywords_db()
        with _sqlite3.connect(reg.db_path) as conn:
            rows = conn.execute(
                "SELECT keyword, ncc_keyword_id FROM registered_keywords WHERE account_customer_id=? AND ncc_keyword_id IS NOT NULL",
                (customer_id,),
            ).fetchall()
        if not rows:
            return {"success": True, "days": days, "total": 0, "items": []}
        keyword_map = {r[1]: r[0] for r in rows}

        client = NaverAdApiClient()
        client.customer_id = account["customer_id"]
        client.api_key = account["api_key"]
        client.secret_key = account["secret_key"]

        end_date = datetime.now().strftime("%Y-%m-%d")
        start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

        all_stats: List[dict] = []
        ids = list(keyword_map.keys())
        for i in range(0, len(ids), 100):
            batch = ids[i:i + 100]
            try:
                stats = await client.get_stats(
                    stat_type="KEYWORD", ids=batch,
                    start_date=start_date, end_date=end_date,
                )
                all_stats.extend(stats or [])
            except Exception as e:
                logger.warning(f"clicked-keywords stats batch 실패: {e}")
            await asyncio.sleep(0.3)

        pool = get_keyword_pool_db()
        user_seeds = [s for s in (pool.list_user_seeds(customer_id) or []) if s and len(s) >= 2]

        def matches_seed(kw: str) -> bool:
            for s in user_seeds:
                if s in kw or kw in s:
                    return True
            return False

        items = []
        for stat in all_stats:
            keyword_id = stat.get("id")
            if not keyword_id:
                continue
            clicks = int(stat.get("clkCnt", 0) or 0)
            if clicks <= 0:
                continue
            kw_text = keyword_map.get(keyword_id)
            if not kw_text:
                continue
            items.append({
                "keyword_id": keyword_id,
                "keyword": kw_text,
                "impressions": int(stat.get("impCnt", 0) or 0),
                "clicks": clicks,
                "cost": int(stat.get("salesAmt", 0) or 0),
                "ctr": float(stat.get("ctr", 0) or 0),
                "cpc": int(stat.get("cpc", 0) or 0),
                "matches_seed": matches_seed(kw_text),
            })
        # 의도성 X 먼저(False=0), 클릭 많은 순
        items.sort(key=lambda x: (x["matches_seed"], -x["clicks"]))
        return {"success": True, "days": days, "total": len(items), "items": items}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"clicked-keywords 실패: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)[:300]}")


class BulkDeleteKeywordsRequest(BaseModel):
    keyword_ids: List[str]


@router.post("/keyword-pool/clicked-keywords/bulk-delete")
async def keyword_pool_bulk_delete_clicked(
    request: BulkDeleteKeywordsRequest,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """선택된 키워드 일괄 네이버 삭제 (실패 시 PAUSE) + 풀 mark + reg DB 제거."""
    from services.naver_ad_service import NaverAdApiClient
    import sqlite3 as _sqlite3

    try:
        account = get_ad_account(user_id)
        if not account or not account.get("is_connected"):
            raise HTTPException(status_code=400, detail="광고 계정 미연결")
        customer_id = int(account.get("customer_id"))

        client = NaverAdApiClient()
        client.customer_id = account["customer_id"]
        client.api_key = account["api_key"]
        client.secret_key = account["secret_key"]

        reg = get_registered_keywords_db()
        pool = get_keyword_pool_db()

        n_deleted = 0
        n_paused = 0
        n_failed = 0
        affected_keywords: List[str] = []

        for kid in request.keyword_ids:
            with _sqlite3.connect(reg.db_path) as conn:
                row = conn.execute(
                    "SELECT keyword FROM registered_keywords WHERE account_customer_id=? AND ncc_keyword_id=?",
                    (customer_id, kid),
                ).fetchone()
            kw_text = row[0] if row else None
            try:
                await client.delete_keyword(kid)
                with _sqlite3.connect(reg.db_path) as conn:
                    conn.execute(
                        "DELETE FROM registered_keywords WHERE account_customer_id=? AND ncc_keyword_id=?",
                        (customer_id, kid),
                    )
                n_deleted += 1
                if kw_text: affected_keywords.append(kw_text)
            except Exception:
                try:
                    await client.pause_keyword(kid)
                    n_paused += 1
                    if kw_text: affected_keywords.append(kw_text)
                except Exception:
                    n_failed += 1
            await asyncio.sleep(0.15)

        if affected_keywords:
            pool.mark_rejected_by_naver(
                customer_id,
                [{"keyword": kw, "reason": "사용자 일괄 삭제 (클릭 검수)"} for kw in affected_keywords],
            )
        return {"success": True, "deleted": n_deleted, "paused": n_paused, "failed": n_failed}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"bulk-delete-clicked 실패: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)[:300]}")


@router.delete("/keyword-pool/keywords/{keyword}")
async def keyword_pool_delete_keyword(
    keyword: str,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """단일 키워드를 풀에서 삭제 (이미 네이버 등록된 건 영향 없음)."""
    try:
        account = get_ad_account(user_id)
        if not account or not account.get("is_connected"):
            raise HTTPException(status_code=400, detail="광고 계정 미연결")
        customer_id = int(account.get("customer_id"))
        pool = get_keyword_pool_db()
        n = pool.delete_keywords(customer_id, [keyword])
        return {"success": True, "deleted": n, "keyword": keyword}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"keyword-pool/keywords DELETE 실패: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)[:300]}")


@router.delete("/keyword-pool/seeds/{seed}")
async def keyword_pool_delete_seed(
    seed: str,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """시드와 그 시드로 발굴된 자식 키워드를 풀에서 모두 삭제."""
    try:
        account = get_ad_account(user_id)
        if not account or not account.get("is_connected"):
            raise HTTPException(status_code=400, detail="광고 계정 미연결")
        customer_id = int(account.get("customer_id"))
        pool = get_keyword_pool_db()
        n = pool.delete_seed_with_children(customer_id, seed)
        return {"success": True, "deleted": n, "seed": seed}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"keyword-pool/seeds DELETE 실패: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)[:300]}")


@router.post("/keyword-pool/seeds")
async def keyword_pool_add_seeds(
    request: PoolSeedsRequest,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """초기 시드 추가 — 자동 수집의 첫 input."""
    try:
        account = get_ad_account(user_id)
        if not account or not account.get("is_connected"):
            raise HTTPException(status_code=400, detail="광고 계정 미연결")
        customer_id = int(account.get("customer_id"))
        pool = get_keyword_pool_db()
        items = [
            {"keyword": s.strip(), "seed": s.strip(), "source": "user_seed", "monthly_total": 0}
            for s in request.seeds if s and s.strip()
        ]
        added = pool.add_candidates(user_id, customer_id, items)
        return {"success": True, "added": added, "total_input": len(items)}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"keyword-pool/seeds 실패: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)[:300]}")


# ============ P4: 소재 템플릿 CRUD ============
from database.ad_templates_db import get_ad_templates_db


class AdTemplateCreate(BaseModel):
    headline_pc: str
    description_pc: str
    display_url: str
    final_url_pc: str
    headline_mobile: Optional[str] = None
    description_mobile: Optional[str] = None
    final_url_mobile: Optional[str] = None
    is_active: bool = True


class AdExtensionCreate(BaseModel):
    kind: str  # PHONE_NUMBER / DESCRIPTION_EXTENSION / SUBLINK ...
    payload: Dict[str, Any]


@router.get("/ad-templates")
async def list_ad_templates(user_id: int = Depends(get_user_id_with_fallback)):
    account = get_ad_account(user_id)
    if not account:
        return {"success": False, "templates": [], "extensions": []}
    customer_id = int(account.get("customer_id"))
    db = get_ad_templates_db()
    return {
        "success": True,
        "customer_id": customer_id,
        "templates": db.list_templates(user_id, customer_id),
        "extensions": db.list_extensions(user_id, customer_id, active_only=False),
    }


@router.post("/ad-templates")
async def create_ad_template(
    request: AdTemplateCreate,
    user_id: int = Depends(get_user_id_with_fallback),
):
    account = get_ad_account(user_id)
    if not account or not account.get("is_connected"):
        raise HTTPException(status_code=400, detail="광고 계정 미연결")
    customer_id = int(account.get("customer_id"))
    db = get_ad_templates_db()
    tpl_id = db.create_template(
        user_id, customer_id,
        headline_pc=request.headline_pc,
        description_pc=request.description_pc,
        display_url=request.display_url,
        final_url_pc=request.final_url_pc,
        headline_mobile=request.headline_mobile,
        description_mobile=request.description_mobile,
        final_url_mobile=request.final_url_mobile,
        is_active=request.is_active,
    )
    return {"success": True, "id": tpl_id}


@router.patch("/ad-templates/{tpl_id}/active")
async def toggle_ad_template(
    tpl_id: int,
    is_active: bool = Query(...),
    user_id: int = Depends(get_user_id_with_fallback),
):
    db = get_ad_templates_db()
    db.update_active(tpl_id, is_active)
    return {"success": True}


@router.delete("/ad-templates/{tpl_id}")
async def delete_ad_template(
    tpl_id: int,
    user_id: int = Depends(get_user_id_with_fallback),
):
    db = get_ad_templates_db()
    db.delete_template(tpl_id, user_id)
    return {"success": True}


@router.post("/ad-templates/extensions")
async def create_ad_extension_template(
    request: AdExtensionCreate,
    user_id: int = Depends(get_user_id_with_fallback),
):
    account = get_ad_account(user_id)
    if not account or not account.get("is_connected"):
        raise HTTPException(status_code=400, detail="광고 계정 미연결")
    customer_id = int(account.get("customer_id"))
    db = get_ad_templates_db()
    ext_id = db.create_extension(user_id, customer_id, request.kind, request.payload)
    return {"success": True, "id": ext_id}


@router.delete("/ad-templates/extensions/{ext_id}")
async def delete_ad_extension_template(
    ext_id: int,
    user_id: int = Depends(get_user_id_with_fallback),
):
    db = get_ad_templates_db()
    db.delete_extension(ext_id, user_id)
    return {"success": True}


# 확장소재 응답에서 payload로 보존할 키 (ownerId/Type, ID, 시각 메타 제외)
_EXT_META_KEYS = {
    "nccAdExtensionId", "ownerId", "ownerType", "customerId",
    "type", "status", "statusReason", "regTm", "editTm", "delFlag",
    "userLock", "inspectStatus", "label", "name",
}


def _extract_ext_payload(item: Dict[str, Any]) -> Dict[str, Any]:
    """네이버 확장소재 응답에서 payload(= create 시 보낼 본문)만 추출."""
    out: Dict[str, Any] = {}
    for k, v in (item or {}).items():
        if k in _EXT_META_KEYS:
            continue
        if v is None:
            continue
        out[k] = v
    return out


@router.post("/ad-templates/import")
async def import_ad_templates_from_naver(
    user_id: int = Depends(get_user_id_with_fallback),
):
    """네이버에 이미 등록된 광고 소재(T&D) + 확장소재를 끌어와 템플릿으로 저장.

    - 광고그룹 전체 순회 → 각 그룹의 ads, adextensions GET
    - 동일 콘텐츠는 중복 저장 안 함 (헤드라인+설명+URL 4-tuple / kind+payload 일치)
    - 비활성 소재(userLock 등)는 그대로 가져오되 is_active=1로 저장 (사용자가 화면에서 토글)
    """
    from services.naver_ad_service import NaverAdApiClient

    account = get_ad_account(user_id)
    if not account or not account.get("is_connected"):
        raise HTTPException(status_code=400, detail="광고 계정 미연결")
    customer_id = int(account.get("customer_id"))

    client = NaverAdApiClient()
    client.customer_id = account["customer_id"]
    client.api_key = account["api_key"]
    client.secret_key = account["secret_key"]

    db = get_ad_templates_db()

    # 1) 광고그룹 전체 조회
    try:
        ad_groups = await client.get_ad_groups()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"광고그룹 조회 실패: {e}")
    if not isinstance(ad_groups, list):
        ad_groups = []

    tpl_imported = 0
    tpl_skipped = 0
    ext_imported = 0
    ext_skipped = 0
    ads_total_seen = 0
    ads_missing_field = 0
    exts_total_seen = 0
    errors: List[str] = []
    sample_ad: Optional[Dict[str, Any]] = None
    sample_ext: Optional[Dict[str, Any]] = None
    sample_field_check: Optional[Dict[str, Any]] = None

    def _unwrap_list(resp: Any) -> List[Any]:
        """네이버 API 응답이 raw list 또는 {list:[...]}/{data:[...]}/{items:[...]} 등 wrap된 경우 풀어냄."""
        if isinstance(resp, list):
            return resp
        if isinstance(resp, dict):
            for k in ("list", "data", "items", "ads", "extensions", "results", "content"):
                v = resp.get(k)
                if isinstance(v, list):
                    return v
            # dict인데 wrap key 없으면 단일 객체로 보고 [resp] 반환
            if resp.get("nccAdId") or resp.get("nccAdExtensionId"):
                return [resp]
        return []

    def _first_str(*candidates) -> str:
        """여러 후보 중 비어있지 않은 첫 문자열 반환. 리스트면 첫 원소 사용."""
        for c in candidates:
            if c is None:
                continue
            if isinstance(c, list):
                for item in c:
                    if isinstance(item, str) and item.strip():
                        return item.strip()
                    if isinstance(item, dict):
                        # RSP_AD: [{text: "..."}, ...] 패턴
                        s = item.get("text") or item.get("value") or item.get("headline") or item.get("description")
                        if isinstance(s, str) and s.strip():
                            return s.strip()
            elif isinstance(c, str) and c.strip():
                return c.strip()
            elif isinstance(c, dict):
                s = c.get("text") or c.get("value")
                if isinstance(s, str) and s.strip():
                    return s.strip()
        return ""

    seen_ext_ids: set = set()

    # ── 확장소재: 다중 fallback 전략 ──
    # 1) 계정 전체 (no params) — 가장 깔끔한 케이스
    # 2) 비어있으면 → 캠페인 ID 모두 돌면서 ?ownerId={cp_id}
    # 광고그룹 단위는 네이버가 404 반환하므로 시도 안 함
    all_exts: List[Any] = []
    try:
        all_ext_resp = await client.get_ad_extensions(owner_id=None)
        all_exts = _unwrap_list(all_ext_resp)
    except Exception as e:
        errors.append(f"exts-all: {str(e)[:120]}")

    # 폴백: 계정 전체 0건이면 캠페인 ID 별로 시도
    if not all_exts:
        try:
            cps = await client.get_campaigns()
            cps_list = _unwrap_list(cps)
        except Exception as e:
            errors.append(f"campaigns: {str(e)[:120]}")
            cps_list = []
        for cp in cps_list:
            cid = cp.get("nccCampaignId") if isinstance(cp, dict) else None
            if not cid:
                continue
            try:
                cp_ext_resp = await client.get_ad_extensions(owner_id=cid)
                cp_list = _unwrap_list(cp_ext_resp)
                all_exts.extend(cp_list)
            except Exception as e:
                errors.append(f"exts-cp({cid}): {str(e)[:120]}")
            await asyncio.sleep(0.15)

    for ex in all_exts:
        ext_id = (ex or {}).get("nccAdExtensionId") if isinstance(ex, dict) else None
        if ext_id and ext_id in seen_ext_ids:
            continue
        if ext_id:
            seen_ext_ids.add(ext_id)
        exts_total_seen += 1
        if sample_ext is None and isinstance(ex, dict):
            sample_ext = ex
        try:
            kind = (ex or {}).get("type") or (ex or {}).get("kind") or ""
            if not kind:
                continue
            payload = _extract_ext_payload(ex)
            if not payload:
                payload = {
                    k: v for k, v in (ex or {}).items()
                    if k not in (
                        "ownerId", "nccAdExtensionId", "createdDate", "editedDate",
                        "regTime", "editTime", "customerId",
                    )
                }
            if not payload:
                continue
            res = db.get_or_create_extension(user_id, customer_id, kind, payload)
            if res.get("created"):
                ext_imported += 1
            else:
                ext_skipped += 1
        except Exception as e:
            errors.append(f"ext-parse: {str(e)[:120]}")

    # 광고그룹 응답 wrap 처리
    ad_groups = _unwrap_list(ad_groups)

    for ag in ad_groups:
        ag_id = ag.get("nccAdgroupId") if isinstance(ag, dict) else None
        if not ag_id:
            continue

        # 2) 소재 조회
        try:
            ads_resp = await client.get_ads(ag_id)
        except Exception as e:
            errors.append(f"ads({ag_id}): {str(e)[:120]}")
            ads_resp = []
        ads = _unwrap_list(ads_resp)

        for a in ads:
            ads_total_seen += 1
            if sample_ad is None and isinstance(a, dict):
                sample_ad = a
            try:
                ad_type = (a or {}).get("type") or ""
                raw_ad = (a or {}).get("ad")
                if isinstance(raw_ad, str):
                    try:
                        ad = _json_lib.loads(raw_ad)
                    except Exception:
                        ad = {}
                elif isinstance(raw_ad, dict):
                    ad = raw_ad
                else:
                    ad = a if isinstance(a, dict) else {}

                pc = ad.get("pc") if isinstance(ad.get("pc"), dict) else {}
                mo = ad.get("mobile") if isinstance(ad.get("mobile"), dict) else {}

                # ─── RSA_AD: assets 배열에서 HEADLINE/DESCRIPTION/URL 분리 ───
                # 새 시스템(RSA_AD)은 assets 배열 사용. 각 asset에 linkType과 assetData.text.
                headlines: List[str] = []
                descriptions: List[str] = []
                if ad_type == "RSA_AD" or (a or {}).get("assets"):
                    assets = (a or {}).get("assets") or ad.get("assets") or []
                    if isinstance(assets, list):
                        for asset in assets:
                            if not isinstance(asset, dict):
                                continue
                            link_type = asset.get("linkType") or ""
                            asset_data = asset.get("assetData") or {}
                            text_v = asset_data.get("text") if isinstance(asset_data, dict) else None
                            if not text_v or not isinstance(text_v, str):
                                continue
                            text_v = text_v.strip()
                            if not text_v:
                                continue
                            if link_type == "HEADLINE":
                                headlines.append(text_v)
                            elif link_type == "DESCRIPTION":
                                descriptions.append(text_v)

                # ─── URLs (RSA_AD 기준: pc.display, pc.final / 레거시 폴백 포함) ───
                display_url = _first_str(
                    pc.get("display"), pc.get("displayUrl"), pc.get("display_url"),
                    ad.get("displayUrl"), ad.get("display_url"),
                    (a or {}).get("displayUrl"),
                )
                final_url_pc = _first_str(
                    pc.get("final"), pc.get("finalUrl"), pc.get("landingUrl"),
                    ad.get("finalUrl"), ad.get("landingUrl"), ad.get("finalPcUrl"),
                    (a or {}).get("finalUrl"),
                )
                final_url_mobile = _first_str(
                    mo.get("final"), mo.get("finalUrl"), mo.get("landingUrl"),
                    ad.get("finalMobileUrl"),
                ) or final_url_pc

                # 레거시 TEXT_45: 단일 headline/description 폴백
                if not headlines:
                    legacy_h = _first_str(
                        pc.get("headline"), pc.get("title"),
                        ad.get("headline"), ad.get("title"),
                        ad.get("headlines"), pc.get("headlines"),
                    )
                    if legacy_h:
                        headlines = [legacy_h]
                if not descriptions:
                    legacy_d = _first_str(
                        pc.get("description"), pc.get("desc"),
                        ad.get("description"), ad.get("desc"),
                        ad.get("descriptions"), pc.get("descriptions"),
                    )
                    if legacy_d:
                        descriptions = [legacy_d]

                # display_url이 비면 final_url_pc 도메인으로 폴백
                if not display_url and final_url_pc:
                    try:
                        from urllib.parse import urlparse
                        u = urlparse(final_url_pc)
                        if u.netloc:
                            display_url = f"{u.scheme or 'https'}://{u.netloc}"
                    except Exception:
                        pass
                if not display_url:
                    display_url = final_url_pc

                if sample_field_check is None:
                    sample_field_check = {
                        "ad_type": ad_type,
                        "headlines_count": len(headlines),
                        "descriptions_count": len(descriptions),
                        "headlines_sample": headlines[:3],
                        "descriptions_sample": [d[:30] for d in descriptions[:2]],
                        "display_url": display_url,
                        "final_url_pc": final_url_pc,
                        "ad_top_keys": list((a or {}).keys()) if isinstance(a, dict) else [],
                        "ad_inner_keys": list(ad.keys()) if isinstance(ad, dict) else [],
                        "pc_keys": list(pc.keys()) if isinstance(pc, dict) else [],
                    }

                if not (headlines and descriptions and final_url_pc):
                    ads_missing_field += 1
                    continue

                # RSA_AD: 헤드라인 × 설명 페어를 N=min(len(h), len(d)) 만큼 생성
                # (cross-product는 너무 많아짐 — 인덱스 매칭이 자연스러움)
                # headlines가 더 많으면 description을 라운드로빈
                pair_n = max(len(headlines), len(descriptions))
                pair_n = min(pair_n, 10)  # 광고당 최대 10개 템플릿
                for i in range(pair_n):
                    h = headlines[i % len(headlines)]
                    d = descriptions[i % len(descriptions)]
                    res = db.get_or_create_template(
                        user_id, customer_id,
                        headline_pc=h[:15],
                        description_pc=d[:45],
                        display_url=display_url,
                        final_url_pc=final_url_pc,
                        headline_mobile=h[:15],
                        description_mobile=d[:45],
                        final_url_mobile=final_url_mobile or final_url_pc,
                    )
                    if res.get("created"):
                        tpl_imported += 1
                    else:
                        tpl_skipped += 1
            except Exception as e:
                errors.append(f"ad-parse: {str(e)[:120]}")

        await asyncio.sleep(0.2)

    return {
        "success": True,
        "ad_groups_scanned": len(ad_groups),
        "templates_imported": tpl_imported,
        "templates_skipped_duplicate": tpl_skipped,
        "extensions_imported": ext_imported,
        "extensions_skipped_duplicate": ext_skipped,
        "ads_total_seen": ads_total_seen,
        "ads_missing_field": ads_missing_field,
        "exts_total_seen": exts_total_seen,
        "sample_ad_raw": sample_ad,
        "sample_ext_raw": sample_ext,
        "sample_field_check": sample_field_check,
        "errors": errors[:20],
    }
