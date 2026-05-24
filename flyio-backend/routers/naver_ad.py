"""
네이버 광고 자동 최적화 API 라우터
"""
from fastapi import APIRouter, HTTPException, Query, BackgroundTasks, Depends, UploadFile, File, Form
from pydantic import BaseModel, Field
from routers.auth_deps import get_user_id_with_fallback
from routers.admin import require_admin
from typing import Optional, List, Dict, Any, Tuple, Set
from datetime import datetime, timedelta
import logging
import asyncio
import io
import json as _json_lib
import random
import re
import httpx

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

# cleanup-by-score 의 BackgroundTask 동시 실행 제한 — 광고주별 1개만.
# 사용자가 긴급삭제 버튼을 연타하거나 두 탭에서 동시에 누르면 50k DELETE 작업이
# 여러 개 쌓여서 event loop CPU + Naver API rate limit 폭주. customer_id 단위로
# 진행 중 표식 두고 두 번째 요청은 즉시 409 반환.
_BULK_CLEANUP_RUNNING: set[int] = set()

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
import time as _ts_mod
from fastapi import Header
from database.keyword_pool_db import get_keyword_pool_db
from database.registered_keywords_db import get_registered_keywords_db


# Niche 시드 timeout backoff cache — (cid, seed) → epoch 마지막 timeout.
# 매 시드 ConnectTimeout 발생 시 등록. 다음 collect 라운드에서 _NICHE_BACKOFF_S
# 이내인 시드는 skip. niche 의료/희귀 시드 5개가 cascade timeout → circuit OPEN →
# 전체 collect cycle abort 패턴 차단. 워커 재시작 시 reset (in-memory).
_seed_timeout_cache: Dict[Tuple[int, str], float] = {}
_NICHE_BACKOFF_S = 1800  # 30분 — 한 사이클 timeout 난 시드는 30분간 라운드 제외


def _is_seed_in_backoff(cid: int, seed: str) -> bool:
    last = _seed_timeout_cache.get((cid, seed))
    if not last:
        return False
    if _ts_mod.time() - last < _NICHE_BACKOFF_S:
        return True
    # backoff 만료 — 캐시에서 제거 후 다음 라운드에 재시도
    _seed_timeout_cache.pop((cid, seed), None)
    return False


def _mark_seed_timeout(cid: int, seed: str) -> None:
    _seed_timeout_cache[(cid, seed)] = _ts_mod.time()


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


def _build_seed_atoms(seeds: List[str]) -> set:
    """시드 → 2/3-gram 원자 + 전체 시드 집합.

    Gate 2(시드 매치) 용. 과거에는 full-seed substring (`s in kw or kw in s`)으로
    체크했는데, 풀이 포화될수록 literal {seed}+suffix 후보 공간이 고갈되어
    domain은 통과하지만 시드 substring 못 잡는 키워드가 100% reject → DEADLOCK.
    원자 단위로 완화 — 예: 시드 "한방병원" 원자에 "한방"이 포함되어 "한방치료"도 통과.
    Gate 1(도메인 토큰)이 여전히 적용되므로 광고주 영역과 무관한 단어는 차단된다.
    """
    atoms: set = set()
    for s in seeds or []:
        if not s or len(s) < 2:
            continue
        atoms.add(s)
        for n in (2, 3):
            for i in range(len(s) - n + 1):
                atoms.add(s[i:i + n])
    return atoms


def _compute_relevance_score(
    kw: str,
    user_seeds: List[str],
    pool_tokens: tuple = (),  # M1 fix: default 를 () 로 — POOL hardcoded 매칭이 user_seed
                              # 광고주에서 무관 KW 점수 부풀려 threshold 회피하는 누수 차단.
                              # 호출자가 의도적으로 POOL 매칭 원할 때만 명시 (cold_start 광고주 등).
) -> int:
    """클릭 KW 의 user_seed/POOL 도메인 연관성 점수 (0-100).

    - 100: kw 가 user_seed 전체를 substring 으로 포함 (예: "강남오피스텔매매" ← "오피스텔매매")
    -  95: user_seed 가 kw 전체를 포함 (kw 가 더 짧음)
    - 0-95: atom 매칭 가중 합산
        · length≥3 user_seed atom 매칭: 20pt × N (max 80) — 강한 도메인 신호
        · length=2 user_seed atom 매칭: 5pt × N (max 30) — 약한 신호 (브로드 매칭)
        · POOL 토큰 매칭: 3pt × N (max 15) — niche 어시스트 (간접 관련)

    예 점수 :
      "강남오피스텔매매" → 100  (user_seed 포함)
      "오피스텔분양"   → ~80  (3+ atom "오피스텔")
      "포켓몬카드"     → ~8   (2-gram "카드" + POOL "카드" — 약함)
      "도박중독"       → 0    (어떤 매칭도 없음)
    """
    if not kw:
        return 0
    # 1) user_seed 전체 매칭 — 가장 강한 신호
    for s in user_seeds:
        if not s or len(s) < 2:
            continue
        if s in kw:
            return 100
        if kw in s:
            return 95
    # 2) atom 분리
    atoms_3plus: set = set()
    atoms_2: set = set()
    for s in user_seeds:
        if not s or len(s) < 2:
            continue
        if len(s) >= 4:
            atoms_3plus.add(s)
        for n in (2, 3):
            for i in range(len(s) - n + 1):
                a = s[i:i + n]
                (atoms_2 if len(a) == 2 else atoms_3plus).add(a)
    # 3) 매칭 카운트 (집합 차이로 중복 제외)
    n_3 = sum(1 for a in atoms_3plus if a in kw)
    n_2 = sum(1 for a in atoms_2 if a in kw)
    n_pool = sum(1 for t in pool_tokens if t in kw)
    score = min(80, n_3 * 20) + min(30, n_2 * 5) + min(15, n_pool * 3)
    return min(95, score)  # 95 cap — 100 은 full seed match 전용


def _resolve_account(user_id: int, customer_id: Optional[str] = None) -> Optional[Dict]:
    """customer_id 명시 시 그 광고주, 없으면 가장 최근. B 시나리오 — 다중 광고주 라우팅."""
    from database.naver_ad_db import get_ad_account_by_customer
    if customer_id:
        return get_ad_account_by_customer(user_id, str(customer_id))
    return get_ad_account(user_id)


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


async def _cap_triggered_self_heal(
    uid: int,
    customer_id: int,
    account: Dict,
    threshold: int,
    saved_relevance: List[str],
    max_delete: int = 200,
) -> int:
    """한도 도달 자가치유 — saved_relevance 기반 점수 ≤ threshold KW 자동 정리.

    호출 조건 (호출자가 보장): active+pending ≥ 100k 이고 auto_cleanup_enabled=1.
    saved_relevance 가 비어 있거나 < 3 이면 즉시 0 반환 (user_seed 폴백 X — drift 위험).
    한 tick 당 max_delete 보수적 (네이버 API rate + 다중 광고주 처리 시간 보호).
    반환: 삭제+pause 성공한 KW 수.
    """
    from services.naver_ad_service import NaverAdApiClient
    from database.naver_ad_db import record_auto_cleanup_run
    import sqlite3 as _sqlite3

    if not saved_relevance or len([s for s in saved_relevance if s and len(s) >= 2]) < 3:
        logger.warning(
            f"[pool/self-heal] uid={uid} cid={customer_id} skip — "
            f"saved_relevance 부족({len(saved_relevance)}). 도메인 KW 저장 필요."
        )
        return 0

    reg = get_registered_keywords_db()
    pool = get_keyword_pool_db()

    with _sqlite3.connect(reg.db_path) as conn:
        rows = conn.execute(
            "SELECT keyword, ncc_keyword_id FROM registered_keywords "
            "WHERE account_customer_id=? AND ncc_keyword_id IS NOT NULL",
            (customer_id,),
        ).fetchall()
    if not rows:
        return 0

    def _score_all() -> List[Tuple[str, str, int]]:
        atoms_3plus: set = set()
        atoms_2: set = set()
        for s in saved_relevance:
            if not s or len(s) < 2:
                continue
            if len(s) >= 4:
                atoms_3plus.add(s)
            for n in (2, 3):
                for i in range(len(s) - n + 1):
                    a = s[i:i + n]
                    (atoms_2 if len(a) == 2 else atoms_3plus).add(a)
        out: List[Tuple[str, str, int]] = []
        for kw_text, kid in rows:
            if not kw_text:
                out.append((kid, "", 0))
                continue
            sc = 0
            full = False
            for s in saved_relevance:
                if not s or len(s) < 2:
                    continue
                if s in kw_text:
                    sc = 100; full = True; break
                if kw_text in s:
                    sc = 95; full = True; break
            if not full:
                n_3 = sum(1 for a in atoms_3plus if a in kw_text)
                n_2 = sum(1 for a in atoms_2 if a in kw_text)
                sc = min(95, min(80, n_3 * 20) + min(30, n_2 * 5))
            out.append((kid, kw_text, sc))
        return out

    scored = await asyncio.to_thread(_score_all)
    # Option B (boundary 보존): score == threshold KW 는 ADD gate (>=) 와 DELETE gate (<)
    # 사이의 stable point. 정확히 50점 KW 가 thrash 사이클 (add→delete→add) 도는 사고 방지.
    targets = [(kid, kw, s) for kid, kw, s in scored if s < threshold]
    targets.sort(key=lambda x: x[2])
    targets_capped = targets[:max_delete]
    if not targets_capped:
        logger.warning(
            f"[pool/self-heal] uid={uid} cid={customer_id} 대상 0 — "
            f"thr={threshold} basis={len(saved_relevance)} total={len(scored)}. "
            f"threshold 상향 검토 필요."
        )
        return 0

    client = NaverAdApiClient()
    client.customer_id = account["customer_id"]
    client.api_key = account["api_key"]
    client.secret_key = account["secret_key"]

    import httpx as _httpx

    def _is_already_gone(exc: Exception) -> bool:
        # naver 404 / code 1018 — 키워드가 이미 naver 측엔 없는 stale ncc_keyword_id.
        # DB row 만 정리하면 슬롯 회수 (cap 회복 가능).
        if isinstance(exc, _httpx.HTTPStatusError):
            try:
                return exc.response.status_code == 404
            except Exception:
                return False
        return False

    def _drop_db_row(kid_: str) -> None:
        with _sqlite3.connect(reg.db_path) as c:
            c.execute(
                "DELETE FROM registered_keywords "
                "WHERE account_customer_id=? AND ncc_keyword_id=?",
                (customer_id, kid_),
            )

    n_del, n_pause, n_fail, n_stale = 0, 0, 0, 0
    affected: List[str] = []
    for kid, kw_text, _s in targets_capped:
        try:
            await client.delete_keyword(kid)
            _drop_db_row(kid)
            n_del += 1
            affected.append(kw_text)
        except Exception as e1:
            if _is_already_gone(e1):
                _drop_db_row(kid)
                n_stale += 1
                affected.append(kw_text)
            else:
                try:
                    await client.pause_keyword(kid)
                    n_pause += 1
                    affected.append(kw_text)
                except Exception as e2:
                    if _is_already_gone(e2):
                        _drop_db_row(kid)
                        n_stale += 1
                        affected.append(kw_text)
                    else:
                        n_fail += 1
        await asyncio.sleep(0.15)

    if affected:
        try:
            pool.mark_rejected_by_naver(
                customer_id,
                [{"keyword": kw, "reason": f"cap_self_heal(≤{threshold})"} for kw in affected],
            )
        except Exception:
            pass
    try:
        record_auto_cleanup_run(uid, str(customer_id), n_del + n_pause + n_stale)
    except Exception:
        pass

    logger.warning(
        f"[pool/self-heal] uid={uid} cid={customer_id} thr={threshold} "
        f"basis={len(saved_relevance)} below={len(targets)} → "
        f"del={n_del} pause={n_pause} stale={n_stale} fail={n_fail}"
    )
    return n_del + n_pause + n_stale


async def _cap_triggered_rolling_heal(
    uid: int,
    customer_id: int,
    account: Dict,
    *,
    max_delete: int = 200,
    mt_ceiling: int = 50,
    settle_hours: int = 24,
) -> int:
    """한도 도달 롤링 자가치유 — saved_relevance 없이도 동작하는 mt 최하위 eject.

    saved_relevance 가 없거나 부족해서 `_cap_triggered_self_heal` 가 0 을 반환한
    경우 폴백. **registered_as_seed 무한 발굴 사이클** 의 핵심 — 100k cap 에 도달해도
    collect 가 영구 정지하지 않게 매 tick 마다 하위 mt 슬라이스를 갈아내고 자리를
    비워준다. 갈아낸 자리에는 다음 collect tick 의 registered-as-seed BFS 가
    발굴한 신규 mt≥1 KW 가 들어가 평균 mt 가 점진적으로 상승.

    안전장치:
      - mt < mt_ceiling (기본 50) 만 대상 — mt≥50 quality KW 는 보호
      - registered_at > settle_hours 전 (기본 24h) — 갓 등록된 KW 는 정착 시간 보장
      - ncc_keyword_id IS NOT NULL — Naver 에 등록되지 않은 행은 건드리지 않음
      - removed_at IS NULL — 이미 제거된 행 스킵
      - ORDER BY mt ASC — 가장 가치 낮은 것부터

    트레이드오프: 운영 중인 mt 1~49 KW 도 eject 대상이 됨. 광고 클릭이 0 이면
    어차피 비용 미발생 — 데이터 기반 큐레이션. 사용자가 우려하면 mt_ceiling 낮추거나
    clicks 추적 후 0-click 필터 추가.
    """
    from services.naver_ad_service import NaverAdApiClient
    from database.naver_ad_db import record_auto_cleanup_run
    import sqlite3 as _sqlite3

    pool = get_keyword_pool_db()
    reg = get_registered_keywords_db()

    # JOIN — 같은 blog_analyzer.db 내. naverad_keyword_pool 에서 mt 최하위 + 24h 정착 +
    # registered_keywords 의 ncc_keyword_id 확보된 KW 만.
    with _sqlite3.connect(pool.db_path) as conn:
        conn.row_factory = _sqlite3.Row
        rows = conn.execute(
            f"""SELECT rk.keyword AS keyword,
                       rk.ncc_keyword_id AS ncc_keyword_id,
                       COALESCE(p.monthly_total, 0) AS monthly_total
                FROM registered_keywords rk
                INNER JOIN naverad_keyword_pool p
                  ON p.account_customer_id = rk.account_customer_id
                 AND p.keyword = rk.keyword
                WHERE rk.account_customer_id = ?
                  AND rk.ncc_keyword_id IS NOT NULL
                  AND rk.removed_at IS NULL
                  AND p.status = 'registered'
                  AND COALESCE(p.monthly_total, 0) < ?
                  AND p.registered_at IS NOT NULL
                  AND datetime(p.registered_at) < datetime('now', '-{int(settle_hours)} hours')
                ORDER BY COALESCE(p.monthly_total, 0) ASC,
                         p.registered_at ASC
                LIMIT ?""",
            (customer_id, mt_ceiling, max_delete),
        ).fetchall()

    if not rows:
        logger.warning(
            f"[pool/rolling-heal] uid={uid} cid={customer_id} 대상 0 — "
            f"mt<{mt_ceiling} & settle≥{settle_hours}h 조건 충족 행 없음"
        )
        return 0

    client = NaverAdApiClient()
    client.customer_id = account["customer_id"]
    client.api_key = account["api_key"]
    client.secret_key = account["secret_key"]

    import httpx as _httpx

    def _is_already_gone(exc: Exception) -> bool:
        if isinstance(exc, _httpx.HTTPStatusError):
            try:
                return exc.response.status_code == 404
            except Exception:
                return False
        return False

    def _drop_db_row(kid_: str) -> None:
        with _sqlite3.connect(reg.db_path) as c:
            c.execute(
                "DELETE FROM registered_keywords "
                "WHERE account_customer_id=? AND ncc_keyword_id=?",
                (customer_id, kid_),
            )

    n_del, n_pause, n_fail, n_stale = 0, 0, 0, 0
    affected: List[str] = []
    for r in rows:
        kid = r["ncc_keyword_id"]
        kw_text = r["keyword"]
        try:
            await client.delete_keyword(kid)
            _drop_db_row(kid)
            n_del += 1
            affected.append(kw_text)
        except Exception as e1:
            if _is_already_gone(e1):
                _drop_db_row(kid)
                n_stale += 1
                affected.append(kw_text)
            else:
                try:
                    await client.pause_keyword(kid)
                    n_pause += 1
                    affected.append(kw_text)
                except Exception as e2:
                    if _is_already_gone(e2):
                        _drop_db_row(kid)
                        n_stale += 1
                        affected.append(kw_text)
                    else:
                        n_fail += 1
        await asyncio.sleep(0.15)

    if affected:
        try:
            pool.mark_rejected_by_naver(
                customer_id,
                [{"keyword": kw, "reason": f"rolling_heal(mt<{mt_ceiling})"} for kw in affected],
            )
        except Exception:
            pass
    try:
        record_auto_cleanup_run(uid, str(customer_id), n_del + n_pause + n_stale)
    except Exception:
        pass

    logger.warning(
        f"[pool/rolling-heal] uid={uid} cid={customer_id} "
        f"mt<{mt_ceiling} candidates={len(rows)} → "
        f"del={n_del} pause={n_pause} stale={n_stale} fail={n_fail}"
    )
    return n_del + n_pause + n_stale


# 등록-KW atom 계산 캐시 — collect tick 마다 5000 KW × 수천 atom 정규식 스캔(주석상
# "30M ops 동기 블록")이 단일 프로세스 event loop 를 수초 점유 → 그동안 /health 같은
# 초경량 요청도 10~27초 멈춤 (페이지 로딩 답답함의 주범). 등록 KW 는 천천히 변하므로
# customer 별로 결과를 캐시하고 TTL 안에는 재계산을 건너뛴다. 미스 시엔 to_thread 로
# 오프로드해 계산 중에도 event loop 가 API 요청을 계속 처리하게 한다.
_REG_ATOM_CACHE: Dict[int, Dict[str, Any]] = {}
_REG_ATOM_TTL_S = 900  # 15분 — atom 학습은 soft 휴리스틱이라 이 정도 staleness 무해


async def _run_pool_collect(uid: int, customer_id: Optional[int] = None, max_new: int = 5000, min_volume: int = 1):
    """수집 1회 — keywordstool로 새 키워드 발굴해 풀에 추가.
    customer_id 명시 시 그 광고주만 처리, 없으면 사용자의 가장 최근 광고주."""
    from services.naver_ad_service import NaverAdApiClient
    from database.naver_ad_db import get_ad_account_by_customer, get_ad_account_auto_cleanup
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
    # saturation 가드 — ≥95% (headroom ≤ 5000) 부터 self_heal 발동.
    # cleanup 으로 슬롯 회수되면 같은 tick 에서 곧바로 collect 이어 진행 (early return X) →
    # 다음 5분 tick 대기 제거. 100% 도달 + cleanup 0 인 dead state 만 cap_reached 로 skip.
    # autocomplete saturation guard (≥98%) 와 사이클: cleanup 으로 98% 미만 →
    # autocomplete 발굴 재개 → 다시 98% → cleanup → 평형.
    if headroom <= 5_000:
        cleaned_total = 0
        cleanup_label_parts: List[str] = []
        cfg = get_ad_account_auto_cleanup(uid, str(customer_id)) or {}
        if cfg.get("enabled"):
            cleaned = await _cap_triggered_self_heal(
                uid, customer_id, account,
                threshold=int(cfg.get("threshold") or 30),
                saved_relevance=list(cfg.get("relevance_keywords") or []),
                max_delete=500,
            )
            cleaned_total += cleaned
            if cleaned > 0:
                cleanup_label_parts.append(f"self_heal={cleaned}")

        # 폴백 — saved_relevance 가 없거나 self-heal 이 0 이면 mt 최하위 롤링 eject.
        # registered-as-seed 무한 발굴 사이클이 cap 에서 멈추지 않도록 보장.
        if cleaned_total == 0:
            rolled = await _cap_triggered_rolling_heal(
                uid, customer_id, account,
                max_delete=500,
                mt_ceiling=50,
                settle_hours=24,
            )
            cleaned_total += rolled
            if rolled > 0:
                cleanup_label_parts.append(f"rolling={rolled}")

        # cleanup 결과 별도 record_run — UI visibility 유지. early return 폐기:
        # 100% 도달이어도 cleanup 으로 회수된 슬롯 있으면 같은 tick 에서 즉시 collect 이어서
        # 진행 → 물갈이 속도 ↑ (다음 5분 tick 대기 제거).
        if cleaned_total > 0:
            try:
                pool.record_run(
                    uid, customer_id, "collect", "self_heal_cleanup",
                    pending_after=pool_pending,
                    error_message=(
                        f"cap_cleanup {' '.join(cleanup_label_parts)} → "
                        f"같은 tick 에서 collect {cleaned_total} 슬롯 회수"
                    )[:300],
                    duration_ms=int((_time.monotonic()-t0)*1000),
                )
            except Exception:
                pass
            logger.warning(
                f"[pool/collect] user={uid} saturation pre-cleanup "
                f"({100_000 - headroom}/100k) — {' '.join(cleanup_label_parts)} → collect 계속"
            )
            # cleanup 으로 회수된 슬롯 반영 (active_reg 가 줄었지만 stats 재조회는 부담 →
            # cleaned_total 만큼 headroom 가산).
            headroom = min(100_000, headroom + cleaned_total)
        elif headroom <= 0:
            # 100% 도달 + cleanup 0 → 진행 불가. 다음 tick 대기.
            logger.warning(f"[pool/collect] user={uid} 한도 도달 — skip (active={active_reg}, pending={pool_pending})")
            pool.record_run(uid, customer_id, "collect", "cap_reached",
                            pending_after=pool_pending,
                            error_message=f"active={active_reg}+pending={pool_pending}≥100000",
                            duration_ms=int((_time.monotonic()-t0)*1000))
            return
    target = min(max_new, headroom)

    # 동적 도메인 토큰셋 — 우선순위: saved relevance_keywords > user_seed > POOL baseline.
    # 2026-05-08 추가: relevance_keywords 가 저장돼 있으면 그것만으로 도메인 게이트 빌드.
    # Why: user_seed 풀이 한약재 (두릅/황기/천문동/용골/행인/지모/백합) 등으로 오염된 경우
    #      그 atom 이 도메인 토큰에 합류해 식물·원예 KW (나무수국/꽃산딸나무/고사리종자)
    #      가 cross-domain 통과. relevance_keywords 가 사용자 진짜 의도라면 그것만 사용해
    #      collect 게이트를 좁게 유지 → 풀에 잡음 시드 있어도 drift 차단.
    from database.naver_ad_db import get_ad_account_relevance_keywords as _get_rel
    saved_relevance = _get_rel(uid, str(customer_id))
    initial_seeds = pool.list_seed_whitelist(customer_id)
    initial_user_seeds_only = pool.list_user_seeds(customer_id)
    cold_start = not initial_user_seeds_only

    if saved_relevance and len(saved_relevance) >= 1:
        # 사용자가 명시한 relevance_keywords 만으로 도메인 게이트 — 풀 오염 무시.
        domain_token_set = _derive_seed_tokens(saved_relevance) | _build_seed_atoms(saved_relevance)
        domain_basis = f"saved_relevance({len(saved_relevance)})"
    elif cold_start:
        # 시드 0 광고주 — POOL baseline (사용자 시드 추가까지 진입 가능).
        domain_token_set = _build_domain_token_set(initial_seeds)
        domain_basis = f"cold_start_pool_baseline({len(POOL_DOMAIN_TOKENS)})"
    else:
        # 일반 — user_seed atom. POOL hardcoded + auto_promoted_seed 게이트 atom 에서 배제.
        domain_token_set = _derive_seed_tokens(initial_user_seeds_only) | _build_seed_atoms(initial_user_seeds_only)
        domain_basis = f"user_seed_pool({len(initial_user_seeds_only)})"
    derived_count = len(domain_token_set) - (len(POOL_DOMAIN_TOKENS) if cold_start and not saved_relevance else 0)

    # collect ADD score gate — atom 화이트리스트 + 점수 ≥ threshold 양쪽 충족 요구.
    # atom-only 게이트는 우연한 2-gram 매칭 (예: "탈" → "테이블렌탈") 으로 점수 30짜리도
    # 통과 → 15분 cleanup 이 다시 삭제 → API/네이버 호출 낭비. ADD/DELETE 양쪽 모두
    # 같은 threshold 사용해 전체 사이클 일관성 유지.
    # saved_relevance < 3 (도메인 시그널 부족) 인 경우 게이트 비활성화 (cold_start 광고주 보호).
    from database.naver_ad_db import get_ad_account_auto_cleanup as _get_collect_thr_cfg
    _collect_thr_cfg = _get_collect_thr_cfg(uid, str(customer_id)) or {}
    _collect_score_thr = int(_collect_thr_cfg.get("threshold") or 50)
    _collect_score_seeds = list(saved_relevance) if saved_relevance and len([s for s in saved_relevance if s and len(s) >= 2]) >= 3 else []

    # 등록 KW atom — cleanup/collect 게이트와 동일 기준.
    # ANCHOR: user_seed atom (length≥3) 을 포함하는 등록 KW 만 학습.
    # Why: 무필터 학습 시 POOL 토큰("교육"/"강의" 등)으로만 통과한 cross-domain KW 가
    #      자기 atom 을 토큰셋에 주입 → 다음 라운드에 cascade drift.
    #      예: 시드 "내일배움카드" → POOL "교육" 매치로 "블렌더교육" 등록 →
    #          "블렌더" atom 학습 → "블렌더VFX/2D/모션" 모두 통과 → 도메인 점프.
    # anchor 로 user_seed 라인 KW 만 atom 기여 → drift 전파 차단.
    # 학습 atom 도 length≥3 — 2-letter (RM/AI/IT) 가 영문 KW 전체를 통과시키는 폴루션 방지.
    # 등록-KW atom (anchor_set + registered_atoms) — 캐시 우선, 미스 시 to_thread 오프로드.
    # anchor: user_seed 의 length≥3 atom 만 — 짧은 2-gram atom (간/염/의/원 등) 이
    # cross-domain 통과시키는 누수 차단. niche 의료 시드 ("A형 간염" → "간염" atom)
    # 가 무관 KW (예: "간장/감자/은염생산") 의 2-gram 매칭으로 anchor 통과해
    # registered_atom 학습 → cascade drift 발생 위험.
    _cache_hit = _REG_ATOM_CACHE.get(customer_id)
    if _cache_hit and (_time.monotonic() - _cache_hit["ts"]) < _REG_ATOM_TTL_S:
        anchor_set = _cache_hit["anchor_set"]
        registered_atoms = _cache_hit["registered_atoms"]
        _reg_raw_n = _cache_hit["reg_raw_n"]
        _reg_learned_n = _cache_hit["reg_learned_n"]
    else:
        def _compute_reg_atoms():
            try:
                reg_raw = pool.list_top_registered(customer_id, limit=5000, min_volume=30)
            except Exception as e:
                logger.warning(f"[pool/collect] 등록 KW atom 조회 실패: {e}")
                reg_raw = []
            a_set = {a for a in _build_seed_atoms(pool.list_user_seeds(customer_id)) if len(a) >= 3}
            if a_set:
                # PERF: 5000 KW × 6000+ atom Python loop = 30M ops. 정규식 multi-pattern (~100배 빠름).
                import re as _re_a
                _anchor_re = _re_a.compile("|".join(_re_a.escape(a) for a in a_set))
                reg_for = [kw for kw in reg_raw if _anchor_re.search(kw)]
            else:
                # user_seed 0개인 신규 광고주 — anchor 비어있으면 학습 안 함 (drift 위험 큼).
                reg_for = []
            # 학습 atom 만 length≥3 — RM/AI/IT 같은 2-letter 영문 폴루션 차단.
            reg_atoms = {a for a in _build_seed_atoms(reg_for) if len(a) >= 3}
            return a_set, reg_atoms, len(reg_raw), len(reg_for)

        anchor_set, registered_atoms, _reg_raw_n, _reg_learned_n = await asyncio.to_thread(_compute_reg_atoms)
        _REG_ATOM_CACHE[customer_id] = {
            "ts": _time.monotonic(),
            "anchor_set": anchor_set,
            "registered_atoms": registered_atoms,
            "reg_raw_n": _reg_raw_n,
            "reg_learned_n": _reg_learned_n,
        }

    logger.warning(
        f"[pool/collect] user={uid} 도메인 토큰 {len(domain_token_set)}개 "
        f"basis={domain_basis} "
        f"+ 등록 atom {len(registered_atoms)}개 "
        f"({_reg_learned_n}/{_reg_raw_n} KW anchor 통과, "
        f"anchor {len(anchor_set)}개{' [cached]' if _cache_hit else ''}) cold_start={cold_start}"
    )

    # 도메인 미포함 키워드 자동 cleanup (registered 제외) — 매 라운드 시작 시
    # 게이트 = domain_token_set ∪ initial_seed_atoms ∪ registered_atoms (collect 게이트와 동일)
    # initial_seed_atoms 추가: 사용자가 풀에 직접 넣은 시드의 atom 도 cleanup 통과 보장
    # (predictably user_seed 가 변경된 직후 한 라운드만 이 단계에서 cleanup 게이트가 살아남)
    # PERF: cleanup 은 sync DB 작업 — token 수 × pending row 수 substring check 가
    #       async 이벤트 루프를 블록 (12k tokens × 50k rows → 헬스체크 timeout).
    #       to_thread 로 worker thread 에서 실행해 이벤트 루프 보호 + token 수 가
    #       임계 초과 시 skip (다음 라운드에서 좁아지면 재시도).
    # cleanup atom 도 user_seed 만 — auto_promoted_seed 가 cascade drift 로 무관 KW 였을
    # 가능성 차단. 시드 atom 누락된 KW 는 어차피 domain_token_set 에서도 매치 안 됨.
    initial_seed_atoms = _build_seed_atoms(initial_user_seeds_only) if not cold_start else _build_seed_atoms(initial_seeds)
    cleanup_tokens = domain_token_set | initial_seed_atoms | registered_atoms
    if len(cleanup_tokens) <= 3000:
        try:
            cleaned = await asyncio.to_thread(
                pool.cleanup_offdomain, customer_id, list(cleanup_tokens)
            )
            if cleaned > 0:
                logger.warning(f"[pool/cleanup] off-domain row 자동 삭제 {cleaned}개")
        except Exception as e:
            logger.warning(f"[pool/cleanup] 실패: {e}")
    else:
        logger.warning(
            f"[pool/cleanup] skip — 토큰 {len(cleanup_tokens)}개 > 3000 임계 "
            f"(이벤트 루프 보호). registered_atoms 학습이 안정화되면 재진입."
        )

    # 자동 승격 시드 중 자식 0 + 30분 경과 자력 삭제 (user_seed는 면제)
    try:
        childless = pool.cleanup_childless_auto_seeds(customer_id, min_age_minutes=30)
        if childless > 0:
            logger.warning(f"[pool/cleanup] 자식 0 자동 시드 자력 삭제 {childless}개")
    except Exception as e:
        logger.warning(f"[pool/cleanup-childless] 실패: {e}")

    # 시드 자가확장 — anchor (user_seed atom) 포함 KW 만 promote.
    # POOL bridge 로 등록된 cross-niche KW (예: "블렌더강의") 가 promote → seed_atoms
    # 합류 → 다음 라운드 그 niche cascade drift 발생을 차단. 그 niche 는 bridge 가
    # 매 라운드 재호출하므로 promote 없어도 새 KW 발굴 계속됨.
    try:
        promoted = pool.promote_seeds(
            customer_id, limit=50, min_volume=30, max_total_seeds=500,
            domain_tokens=list(anchor_set),
        )
        if promoted:
            logger.warning(
                f"[pool/collect] user={uid} 시드 자동 승격 {len(promoted)}개: "
                + ", ".join(f"{p['keyword']}({p['monthly_total']})" for p in promoted)
            )
            # 승격 후 토큰셋 재계산 — saved_relevance 우선 (사용자 의도 고정).
            if saved_relevance and len(saved_relevance) >= 1:
                # saved_relevance 사용 중이면 promote 가 토큰셋을 흔들면 안 됨 — 그대로 유지.
                pass
            elif cold_start:
                domain_token_set = _build_domain_token_set(
                    pool.list_seed_whitelist(customer_id)
                )
            else:
                fresh_user_seeds = pool.list_user_seeds(customer_id) or initial_user_seeds_only
                domain_token_set = _derive_seed_tokens(fresh_user_seeds) | _build_seed_atoms(fresh_user_seeds)
    except Exception as e:
        logger.warning(f"[pool/collect] promote_seeds 실패: {e}")
        promoted = []

    # C1 fix: get_recent_seeds 는 source 필터 없이 모든 row 의 seed 를 반환 → legacy POOL
    # bridge 시드 ("대출/렌탈/배달/미용" 등) 가 풀 row 자식으로 살아있는 한 매 라운드
    # keywordstool 호출에 사용 → API quota 낭비 + 잔재 재활성화 risk. list_seed_whitelist
    # 는 source IN ('user_seed', 'auto_promoted_seed') 만 반환해 legacy POOL bridge 차단.
    seeds = pool.list_seed_whitelist(customer_id)
    if not seeds:
        # 자가치유 (a): 등록 키워드 중 검색량 상위 10개를 user_seed 로 자동 reseed.
        # 시드가 비면 collection 영구 정지 → 등록 키워드에서 핵심어 자동 추출.
        try:
            top_kw = pool.list_top_registered(customer_id, limit=10, min_volume=100)
        except Exception as e:
            logger.warning(f"[pool/collect] auto-reseed 후보 조회 실패: {e}")
            top_kw = []
        # 도메인 게이트 — saved_relevance 있으면 score>30 만 reseed. 등록 풀이 drift 로
        # 오염된 계정 (소잠한의원 차 KW 사고) 에서 top-mt 가 차 KW 라면 그게 user_seed 로
        # 재주입되는 catastrophic loop 차단.
        if top_kw and saved_relevance and len([s for s in saved_relevance if s and len(s) >= 2]) >= 3:
            before = len(top_kw)
            top_kw = [k for k in top_kw if _compute_relevance_score(k, saved_relevance) > 30]
            if before != len(top_kw):
                logger.warning(
                    f"[pool/collect] auto-reseed 도메인 게이트 — {before} → {len(top_kw)}"
                )
        if top_kw:
            items = [{"keyword": k, "seed": k, "source": "user_seed", "monthly_total": 0} for k in top_kw]
            try:
                pool.add_candidates(uid, customer_id, items)
                logger.warning(
                    f"[pool/collect] user={uid} 시드 자동 복구 {len(top_kw)}개: "
                    + ", ".join(top_kw[:5]) + (" ..." if len(top_kw) > 5 else "")
                )
                seeds = top_kw
            except Exception as e:
                logger.warning(f"[pool/collect] auto-reseed insert 실패: {e}")
        if not seeds:
            logger.warning(f"[pool/collect] user={uid} 시드 없음 + 등록 키워드 없음 — UI에서 초기 시드 제공 필요")
            pool.record_run(uid, customer_id, "collect", "no_seed",
                            pending_after=pool_pending,
                            error_message="UI에서 초기 시드 추가 필요",
                            duration_ms=int((_time.monotonic()-t0)*1000))
            return

    # 화이트리스트 (keywordstool 호출용): user_seed + auto_promoted_seed.
    # 발굴 다양성은 유지하되, 게이트 atom 은 user_seed 만으로 좁힘 (cascade drift 차단).
    whitelist = pool.list_seed_whitelist(customer_id)
    if not whitelist:
        whitelist = seeds  # 폴백
    # 게이트 seed_atoms 는 user_seed 만 — promoted 가 발굴해온 KW 도 user_seed atom 매치 필수.
    user_seed_now = pool.list_user_seeds(customer_id) or initial_user_seeds_only
    seed_atoms = _build_seed_atoms(user_seed_now) if user_seed_now else _build_seed_atoms(whitelist)

    # 통합 게이트 — domain_token_set ∪ seed_atoms ∪ registered_atoms.
    # 모두 user_seed lineage. cold_start 광고주는 domain_token_set 에 POOL baseline 포함.
    unified_tokens = set(domain_token_set) | seed_atoms | registered_atoms

    # Loose mode 자동 진입 — cold_start 광고주만 사용. user_seed ≥ 1 면 절대 비활성.
    # Why: niche user_seed (예: 의료 희귀병) 가 5회 연속 발굴 0 + reject 폭주하면 loose_mode 가
    #      "길이 2+ 모든 KW 통과" 로 게이트를 무력화 → user_seed 무관 KW 무차별 INSERT →
    #      registered_atoms 학습 → 영구적 cascade drift. 사용자 의도 ("내 시드 외 무관 KW reject")
    #      정면 위반. user_seed 가 niche 라 발굴 못 해도 무관 도메인으로 점프해선 안 됨 —
    #      이 경우 "발굴 0" 으로 두는 게 옳다 (사용자가 시드 추가하거나 niche 포기).
    loose_mode = False
    if cold_start:
        try:
            recent = pool.recent_runs(customer_id, limit=5)
            collects = [r for r in recent if r.get("kind") == "collect"]
            if len(collects) >= 3:
                high_reject = sum(
                    1 for r in collects
                    if (r.get("added") or 0) == 0 and (r.get("skipped") or 0) >= 500
                )
                if high_reject >= 3:
                    loose_mode = True
        except Exception:
            pass

    logger.warning(
        f"[pool/collect] user={uid} 시작 target={target} seeds={len(seeds)} "
        f"whitelist={len(whitelist)} unified_tokens={len(unified_tokens)} "
        f"seed_atoms={len(seed_atoms)} reg_atoms={len(registered_atoms)} "
        f"reg_learned_from={_reg_learned_n} "
        f"promoted={len(promoted)} loose={loose_mode}"
    )

    if loose_mode:
        logger.warning(
            f"[pool/collect] user={uid} LOOSE MODE — 최근 collect 3+ 회 연속 high-reject. "
            f"min_volume {min_volume}→1, 게이트 완화."
        )
        min_volume = max(1, min_volume // 5)

    client = NaverAdApiClient()
    client.customer_id = account["customer_id"]
    client.api_key = account["api_key"]
    client.secret_key = account["secret_key"]

    # PERF: unified_tokens 가 14k+ 이면 per-kw `any(t in kw for t in tokens)` =
    # 1.3B+ Python ops/round → async 이벤트 루프 30-60s 블록 → fly 헬스체크 실패.
    # 정규식 컴파일로 C 구현 멀티패턴 매칭 (~100배 빠름) 으로 전환.
    import re as _re
    _whitelist_re = _re.compile(
        "|".join(_re.escape(t) for t in unified_tokens)
    ) if unified_tokens else None

    def _matches_whitelist(kw: str) -> str:
        # 단일 게이트 — unified_tokens 중 하나라도 매치하면 통과.
        # 반환: "" = 통과, "domain" = 어떤 토큰도 안 맞음.
        # loose_mode 면 길이 ≥ 2 인 한국어/영문/숫자 키워드는 통과 (도메인 무관 fallback).
        if _whitelist_re and _whitelist_re.search(kw):
            return ""
        if loose_mode and len(kw) >= 2:
            return ""
        return "domain"

    added = 0
    rejected = 0
    reject_no_domain = 0
    reject_no_seed_match = 0
    sample_no_domain: List[str] = []
    sample_no_seed: List[str] = []
    # 도메인미스 reject 처리 2-layer:
    #   [Top tier mt≥100]  reject_for_ai     → GPT 분류 통과만 자식 합류 (보수)
    #   [Mid tier mt 30~99] reject_direct    → GPT 우회 자식 풀 직접 추가 (drift 감수)
    # 사용자 명시: "drift 위험 감수해도 빠르게 채우기".
    # Drift 안전 장치 (이미 cron):
    #   - 등록 후 검수 거부 KW = inspect cron 10분마다 자동 삭제
    #   - 클릭 발생한 무관 KW = click cleanup cron 15분마다 점수 ≤ 30 자동 삭제
    #   - 도메인 안 맞는 KW = domain cleanup cron 매시 자동 삭제
    # 풀/분류 이력 KW 제외 — INSERT OR IGNORE 사고 방지.
    reject_for_ai: List[Dict] = []
    reject_for_ai_seen: Set[str] = set()
    reject_direct: List[Dict] = []
    reject_direct_seen: Set[str] = set()
    classified_reject_set: Set[str] = set()
    pool_kw_set: Set[str] = set()
    try:
        classified_reject_set = set(pool.list_classified_reject_keywords(customer_id))
    except Exception as e:
        logger.warning(f"[pool/collect] classified set 로드 실패: {e}")
    try:
        pool_kw_set = pool.list_pool_keyword_set(customer_id)
    except Exception as e:
        logger.warning(f"[pool/collect] pool_kw_set 로드 실패: {e}")
    api_errors: List[str] = []
    seeds_processed = 0
    bfs_calls = 0

    # 자가치유 (b): 포화 감지 — 최근 5회 모두 added=0 + skipped<500 면 풀이 saturate.
    # keywordstool 결과가 모두 중복이라 같은 시드로는 새 발굴 불가능. 시드 확장 주입.
    saturated = False
    try:
        sat = pool.detect_saturation(customer_id, n_recent=5)
        saturated = bool(sat.get("is_saturated"))
    except Exception:
        pass

    if saturated:
        logger.warning(
            f"[pool/collect] user={uid} SATURATION — 시드 확장 주입 (지역+의도 suffix)"
        )
        # 한국 광고 검색 보편 확장어 — 시드와 결합해 새 hint 생성.
        # 같은 시드 반복 호출이 같은 결과를 돌려주는 한계를 깸.
        EXPANSION_AFFIXES = [
            "강남", "서울", "부산", "대구", "인천", "경기",
            "추천", "후기", "비교", "가격", "잘하는곳", "잘하는", "찾기",
            "전문", "전문점", "무료", "상담", "신청",
        ]
        existing = set(seeds)
        injected: List[str] = []
        for s in seeds[:30]:
            for aff in random.sample(EXPANSION_AFFIXES, 3):
                for combo in (aff + s, s + aff):
                    if combo not in existing and len(combo) <= 25:
                        injected.append(combo)
                        existing.add(combo)
        if injected:
            seeds = list(seeds) + injected[:60]
            logger.warning(
                f"[pool/collect] user={uid} 확장 시드 {len(injected[:60])}개 주입 (sample: "
                + ", ".join(injected[:5]) + ")"
            )

    # NICHE BRIDGE — cold start (user_seed 0) 일 때만 POOL bridge 사용.
    # 사용자 의도 변경 ("내가 시드 넣은거에서만 추천, 무관한거 싹 삭제") 으로
    # user_seed ≥ 1 광고주는 BRIDGE 비활성 — 시드 도메인 외 niche 자동 점프 차단.
    # 의료 광고주(소잠한의원)에 "대출/렌탈/리스" 가 매 라운드 강제 시드로 들어가던 누수 차단.
    if cold_start:
        bridge_pool = [t for t in POOL_DOMAIN_TOKENS if len(t) >= 2]
        random.shuffle(bridge_pool)
        bridge_round = bridge_pool[:15]
    else:
        bridge_round = []

    # 시드 셔플 — 매 라운드 다른 60개 처리 (200 시드 다양성 확보).
    seed_pool = list(seeds)
    random.shuffle(seed_pool)
    # niche timeout backoff — 최근 30분 내 ConnectTimeout 난 시드는 라운드 제외.
    # 의료 희귀병 시드(피부 전이암/혈관각화증 등) cascade timeout → circuit OPEN →
    # 전체 collect 정지 패턴 차단. 같은 시드를 매 5분마다 재시도하지 않고 30분 backoff.
    seeds_in_backoff = [s for s in seed_pool if _is_seed_in_backoff(customer_id, s)]
    seeds_eligible = [s for s in seed_pool if not _is_seed_in_backoff(customer_id, s)]
    # 슬롯: cold_start 면 user(45) + bridge(15) = 60, 아니면 user 120 + registered 120.
    # user_seed 충분한 광고주는 라운드당 시드 2배 → 시간당 신규 발굴량 ~2배.
    user_quota = 45 if cold_start else 120
    # REGISTERED-AS-SEED — saturation 돌파용 (사용자 명시 의도: 검색량 있는 등록 KW 의
    # 연관 KW 끝까지 발굴). user_seed 2~5k 만으로는 keywordstool 응답 saturate →
    # +0~+10/배치 정체. 90k+ 등록 KW 자체를 매 라운드 다른 120개씩 시드 투입.
    # unified_tokens 에 registered_atoms 가 이미 포함 → 자식 게이트 통과 보장.
    registered_round: List[str] = []
    if not cold_start:
        try:
            registered_round = pool.list_registered_random_seeds(
                customer_id, limit=120, min_volume=10,
            )
        except Exception as e:
            logger.warning(f"[pool/collect] registered-as-seed 로드 실패: {e}")
            registered_round = []
    seed_round = seeds_eligible[:user_quota] + registered_round + bridge_round
    logger.warning(
        f"[pool/collect] user={uid} 시드 라운드 — user/promoted={min(user_quota, len(seeds_eligible))} "
        f"+ registered={len(registered_round)} + POOL bridge={len(bridge_round)} "
        f"(총 {len(seed_round)}) cold_start={cold_start} backoff_skip={len(seeds_in_backoff)}"
    )
    # circuit breaker 인스턴스 — 시드 라운드 중 OPEN 감지 시 남은 시드 fail-fast 차단.
    # naver_ad_service 모듈 레벨 singleton 공유.
    from services.naver_ad_service import _naver_api_breaker, NaverApiCircuitOpenError
    circuit_aborted = False

    # ==========================================================================
    # BATCHED keywordstool 호출 — 시드 5개씩 묶어 1콜로 처리 (2026-05-07).
    # 종전: 시드 60개 = 60콜 → ConnectTimeout 10회 누적 → circuit OPEN → 50시드 abort.
    # 변경: 시드 60개 = 12콜 (배치당 5 hint) → API 호출 5배 감소 → timeout 폭주 차단.
    # 네이버 /keywordstool 은 hintKeywords 콤마구분 5개까지 허용 (naver_ad_service.py:629).
    # ==========================================================================
    SEED_BATCH = 5

    def _process_keyword_items(
        items: List[Dict],
        seed_label: str,
        sub_candidates_out: List[Dict],
        bfs_pool_out: List[tuple],
    ) -> None:
        """keywordList 처리 — primary/BFS 양쪽에서 동일 로직 공유."""
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
                # rejected 카운트는 outer scope (nonlocal)
                nonlocal rejected, reject_no_domain, reject_no_seed_match
                rejected += 1
                if reason == "domain":
                    reject_no_domain += 1
                    if len(sample_no_domain) < 10:
                        sample_no_domain.append(kw)
                    # AI-first 게이트 — mt≥1 모든 도메인미스 KW 를 GPT 분류 대기열로.
                    # 한의원 13만 drift 사고 (mt 30~99 GPT 우회) + AI cleanup 끈 결정과 일관.
                    # GPT 통과만 풀 합류 → 사후 cleanup DELETE 가 필요 없는 구조.
                    if (
                        kw in classified_reject_set
                        or kw in pool_kw_set
                    ):
                        pass  # 이미 처리된 KW
                    elif mt >= 1 and kw not in reject_for_ai_seen:
                        reject_for_ai_seen.add(kw)
                        reject_for_ai.append({"keyword": kw, "monthly_total": mt})
                else:
                    reject_no_seed_match += 1
                    if len(sample_no_seed) < 10:
                        sample_no_seed.append(kw)
                continue

            # 점수 게이트 — atom 화이트리스트 통과해도 _compute_relevance_score < threshold
            # 이면 풀 합류 차단. ADD/DELETE 양쪽 모두 같은 threshold (옵션 B 경계 보존).
            # saved_relevance 시드가 < 3 이면 게이트 비활성 (cold_start 광고주 보호).
            # nonlocal 은 line 3181 에서 이미 함수 스코프로 선언됨 — 여기서 재선언 X.
            if _collect_score_seeds:
                _sc = _compute_relevance_score(kw, _collect_score_seeds)
                if _sc < _collect_score_thr:
                    rejected += 1
                    reject_no_seed_match += 1  # 점수 미달 — 시드미스 카테고리로 기록
                    if len(sample_no_seed) < 10:
                        sample_no_seed.append(kw)
                    continue

            sub_candidates_out.append({
                "keyword": kw, "monthly_total": mt,
                "monthly_pc": pc, "monthly_mobile": mob,
                "comp_idx": item.get("compIdx"),
                "seed": seed_label,
            })
            if mt >= 100 and len(kw) >= 2:
                bfs_pool_out.append((kw, mt))

    # 배치 단위로 청크
    for batch_start in range(0, len(seed_round), SEED_BATCH):
        if added >= target:
            break
        if _naver_api_breaker.is_open():
            circuit_aborted = True
            logger.warning(
                f"[pool/collect] user={uid} circuit OPEN — 남은 시드 abort (처리 {seeds_processed}/{len(seed_round)})"
            )
            break

        chunk_raw = seed_round[batch_start:batch_start + SEED_BATCH]
        # 각 시드 sanitize — 빈/짧은 시드는 chunk 에서 제외
        chunk_sanitized: List[Tuple[str, str]] = []  # [(seed_raw, seed_clean)]
        for s_raw in chunk_raw:
            s_clean = (s_raw or "").replace(" ", "").strip()
            if not s_clean or len(s_clean) < 2:
                continue
            chunk_sanitized.append((s_raw, s_clean))
        if not chunk_sanitized:
            continue

        seeds_processed += len(chunk_sanitized)
        hints = [c[1] for c in chunk_sanitized]
        hint_str = ",".join(hints)
        # seed 컬럼 attribution — batch hint 전체를 콤마구분으로 저장하면 UI 시드별 표가
        # "척수성근위축증,마자인,…" 같이 묶여 보이고 그 row 의 자식 카운트가 0 으로 잡힘.
        # batch 의 첫 시드를 대표 라벨로. 5 시드 중 1로 attribution 부풀려지지만 UI 명확.
        seed_label = chunk_sanitized[0][0]

        try:
            related = await client.get_related_keywords(hint_str, show_detail=True)
        except NaverApiCircuitOpenError:
            circuit_aborted = True
            logger.warning(
                f"[pool/collect] user={uid} batch '{hint_str[:40]}' 처리 중 circuit OPEN — abort"
            )
            break
        except Exception as e:
            # 배치 전체 실패 — 5개 시드 모두 backoff 처리 (어느 시드가 원인인지 알 수 없음)
            err_name = type(e).__name__
            err_msg_full = str(e)[:200]
            msg = f"batch[{hint_str[:40]}]: {err_name}: {err_msg_full[:80]}"
            logger.warning(f"[pool/collect] BATCH API 실패 {msg}")
            if "Timeout" in err_name or "ConnectTimeout" in err_msg_full:
                for s_raw, _ in chunk_sanitized:
                    _mark_seed_timeout(customer_id, s_raw)
            if "11001" in err_msg_full or "400" in err_msg_full:
                logger.warning(
                    f"[pool/collect/11001] hints={hints!r} — 네이버 keywordstool 거부"
                )
            api_errors.append(msg)
            continue

        items = related.get("keywordList", []) if isinstance(related, dict) else []
        candidates: List[Dict] = []
        bfs_pool: List[tuple] = []
        _process_keyword_items(items, seed_label, candidates, bfs_pool)
        added += pool.add_candidates(uid, customer_id, candidates)
        await asyncio.sleep(0.3)

        # BFS 2nd-level — 배치당 검색량 상위 4개 (발굴 면적 2배, 비용 0 — keywordstool 무료).
        bfs_pool.sort(key=lambda x: -x[1])
        for bfs_kw, _ in bfs_pool[:4]:
            if _naver_api_breaker.is_open():
                break
            try:
                bfs_calls += 1
                related2 = await client.get_related_keywords(bfs_kw, show_detail=True)
                items2 = related2.get("keywordList", []) if isinstance(related2, dict) else []
                sub_candidates: List[Dict] = []
                _process_keyword_items(items2, seed_label, sub_candidates, [])
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
    # AI 분류용 reject 누적 batch INSERT — 라운드당 최대 1000개로 cap (DB 비대화 방지).
    # 백업 cron (_ai_classify_tick) 의 입력 풀 + UI 카운터 표시용.
    if reject_for_ai:
        try:
            saved = pool.add_rejects(customer_id, reject_for_ai[:1000])
            if saved:
                logger.warning(
                    f"[pool/collect] AI 분류 후보 reject {saved}개 누적 (검색량≥100)"
                )
        except Exception as e:
            logger.warning(f"[pool/collect] add_rejects 실패: {e}")

    # ============ reject_direct (GPT 우회 자식 합류) — 비활성 ============
    # 한의원 광고주 13만 drift 사고의 근본 — mt 30~99 KW 가 GPT 검증 없이 자식 합류 →
    # 무관 KW 등록 → 사후 AI cleanup 이 다시 대량 DELETE 하는 위험 사이클.
    # 현재 흐름: 모든 도메인미스 KW (mt≥1) 가 reject_for_ai 로 모이고
    # inline AI 게이트가 의미적으로 일치하는 것만 풀 합류 → drift 사전 차단.
    # 이 블록은 호환성 위해 남겨두지만 reject_direct 는 항상 빈 리스트.
    direct_added = 0
    # ===========================================================================

    # ============ Inline AI 자식 게이트 — 매 collect 직후 즉시 GPT 분류 ============
    # reject 풀의 fresh 후보 (검색량 상위 200개) 를 GPT-4o-mini 가 시드 도메인 일치 분류.
    # approved 는 시드가 아니라 자식 KW 로 직접 등록 풀에 추가 (source='ai_inline').
    # 게이트 atom 우회 — 다음 register cron (2분 후) 즉시 광고그룹 등록.
    # 비용: collect 1회당 ~$0.001 (시간당 ~$0.012, 월 ~$10). reject_for_ai 비면 skip.
    inline_ai_added = 0
    inline_ai_approved = 0
    inline_ai_discarded = 0
    try:
        from config import settings as _settings
        if reject_for_ai and _settings.OPENAI_API_KEY:
            from services.ai_seed_suggester import classify_rejects as _classify_rejects
            # AI-first 빠른 채움 — 라운드당 GPT 분류 처리량 10배 (200 → 2000).
            # classify_rejects 내부 cap 200 / 호출 → 200 batch × 10 = 2000 audit.
            # asyncio.gather + Semaphore(4) 병렬화 — GPT round-trip 4~5초 × 10 sequential =
            # 50초 → 병렬 ~12초. collect cron 5분 안에 충분히 끝남.
            top_rejects = sorted(
                reject_for_ai, key=lambda r: -int(r.get("monthly_total") or 0)
            )[:2000]
            ai_seeds_input = pool.list_user_seeds(customer_id) or whitelist
            if ai_seeds_input and top_rejects:
                ai_t0 = _time.monotonic()
                BATCH = 200
                _sem = asyncio.Semaphore(4)

                async def _classify_batch(batch_items: List[Dict]) -> Dict[str, Any]:
                    async with _sem:
                        return await _classify_rejects(
                            ai_seeds_input, batch_items, seed_sample_size=50,
                            saved_relevance=saved_relevance,
                        )

                batches = [
                    top_rejects[i:i + BATCH]
                    for i in range(0, len(top_rejects), BATCH)
                ]
                batch_results = await asyncio.gather(
                    *[_classify_batch(b) for b in batches],
                    return_exceptions=True,
                )
                ai_ms = int((_time.monotonic() - ai_t0) * 1000)

                approved: List[str] = []
                discarded: List[str] = []
                batch_ok = 0
                batch_fail = 0
                last_rationale = ""
                for r in batch_results:
                    if isinstance(r, Exception):
                        batch_fail += 1
                        logger.warning(f"[pool/collect/ai-inline] batch 예외: {r}")
                        continue
                    if not r.get("success"):
                        batch_fail += 1
                        logger.warning(
                            f"[pool/collect/ai-inline] batch 실패: {r.get('message')}"
                        )
                        continue
                    batch_ok += 1
                    approved.extend(r.get("approved") or [])
                    discarded.extend(r.get("discarded") or [])
                    if r.get("rationale"):
                        last_rationale = r["rationale"]

                # dedup (병렬 batch 동일 KW 가 중복 분류될 일은 없지만 안전장치)
                approved = list(dict.fromkeys(approved))
                discarded = list(dict.fromkeys(discarded))
                inline_ai_approved = len(approved)
                inline_ai_discarded = len(discarded)

                # GPT 통과 < 50 일 때 fallback — niche 시드에서 GPT 가 거의 다 컷하면
                # 풀이 영구 안 채워지는 사고 차단. 검색량 상위 + 점수 ≥ threshold 만 합류.
                # 옛 fallback 은 검색량만 봐서 drift 발생 → cleanup 무한 회전. 이제 점수 컷
                # 적용해서 풀 점수 분포가 사용자 threshold 이상으로 직접 수렴.
                ai_inline_fallback = False
                if len(approved) < 50 and batch_ok > 0 and top_rejects:
                    from database.naver_ad_db import get_ad_account_auto_cleanup as _get_thr_inline
                    from database.naver_ad_db import get_ad_account_relevance_keywords as _get_rel_inline
                    _thr_cfg_inline = _get_thr_inline(uid, str(customer_id)) or {}
                    _inline_thr = int(_thr_cfg_inline.get("threshold") or 50)
                    _rel_basis = _get_rel_inline(uid, str(customer_id)) or []
                    if not _rel_basis:
                        _rel_basis = [s for s in (pool.list_user_seeds(customer_id) or []) if s and len(s) >= 2]
                    ai_inline_fallback = True
                    existing = set(approved)
                    # 검색량 상위 중 점수 ≥ threshold 만 보충 — drift 차단
                    extras: List[str] = []
                    for r in top_rejects:
                        kw_ = r["keyword"]
                        if kw_ in existing:
                            continue
                        if _rel_basis and _compute_relevance_score(kw_, _rel_basis) < _inline_thr:
                            continue
                        extras.append(kw_)
                    boost = 2000 - len(approved)
                    approved = list(approved) + extras[:max(0, boost)]
                    inline_ai_approved = len(approved)
                    logger.warning(
                        f"[pool/collect/ai-inline] user={uid} GPT 통과 적음 — "
                        f"검색량 상위 + 점수≥{_inline_thr} 만 +{len(extras[:boost])}개 fallback "
                        f"보충 → 총 {len(approved)}"
                    )

                if approved:
                    mt_map = {
                        r["keyword"]: int(r.get("monthly_total") or 0)
                        for r in top_rejects
                    }
                    inline_items = [
                        {
                            "keyword": k,
                            "monthly_total": mt_map.get(k, 0),
                            "monthly_pc": 0,
                            "monthly_mobile": 0,
                            "comp_idx": None,
                            "source": "ai_inline",
                            "seed": "ai_classified",
                        }
                        for k in approved
                    ]
                    try:
                        inline_ai_added = pool.add_candidates(
                            uid, customer_id, inline_items
                        )
                        added += inline_ai_added  # 헤드룸 카운트 정확화
                    except Exception as e:
                        logger.warning(f"[pool/collect/ai-inline] add 실패: {e}")
                    try:
                        pool.mark_rejects_classified(customer_id, approved, "promoted")
                    except Exception:
                        pass
                if discarded:
                    try:
                        pool.mark_rejects_classified(customer_id, discarded, "discarded")
                    except Exception:
                        pass
                logger.warning(
                    f"[pool/collect/ai-inline] user={uid} cid={customer_id} "
                    f"분류 {len(top_rejects)}개 "
                    f"(batch {batch_ok}OK/{batch_fail}fail{', fallback' if ai_inline_fallback else ''}) → "
                    f"통과 {inline_ai_approved} (자식 추가 {inline_ai_added}) / "
                    f"컷 {inline_ai_discarded} ({ai_ms}ms) "
                    f"rationale={last_rationale[:80]}"
                )
        elif reject_for_ai and not _settings.OPENAI_API_KEY:
            logger.warning("[pool/collect/ai-inline] OPENAI_API_KEY 미설정 — skip")
    except Exception as e:
        logger.warning(f"[pool/collect/ai-inline] 예외: {type(e).__name__}: {e}", exc_info=True)
    # ===========================================================================
    pending_after = (pool.stats(customer_id).get("by_status") or {}).get("pending", 0)
    err_parts = list(api_errors)
    if circuit_aborted:
        err_parts.append(
            "네이버 API circuit breaker OPEN — niche 시드 keywordstool timeout 누적. "
            "다음 cron tick (5분 후) 자동 재시도. broader 시드 추가 권장."
        )
    if rejected > 0:
        err_parts.append(
            f"화이트리스트 reject {rejected}개 "
            f"(도메인미스 {reject_no_domain} / 시드미스 {reject_no_seed_match})"
        )
    if inline_ai_added > 0 or inline_ai_approved > 0 or inline_ai_discarded > 0:
        err_parts.append(
            f"AI inline 자식 +{inline_ai_added} (통과 {inline_ai_approved} / 컷 {inline_ai_discarded})"
        )
    if direct_added > 0:
        err_parts.append(f"reject-direct 자식 +{direct_added} (mt 30~99, GPT 우회)")
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


async def _run_pool_ai_classify(
    uid: int,
    customer_id: int,
    *,
    cooldown_minutes: int = 30,
    candidates_limit: int = 200,
    min_volume: int = 100,
    force: bool = False,
) -> Dict[str, Any]:
    """AI 분류 1회 — reject 풀 → user_seed 자동 promote.

    흐름:
      1. 쿨다운 체크 (force=True 면 무시)
      2. user_seed + 미분류 reject 가져옴
      3. classify_rejects (GPT-4o-mini) 호출
      4. approved → source='user_seed' 로 add_candidates → 시드 합류
      5. reject 풀 status 갱신 + cooldown stamp
      6. record_run

    트리거 조건은 호출자(스케줄러/라우트) 가 결정. 이 함수는 단순 1회 실행.
    """
    from services.ai_seed_suggester import classify_rejects
    from datetime import datetime, timedelta
    import time as _time

    pool = get_keyword_pool_db()
    t0 = _time.monotonic()

    # 쿨다운 — 매번 GPT 호출 비용/품질 안정 위해 광고주별 30분 간격 강제
    if not force:
        last = pool.get_classify_cooldown(customer_id)
        if last:
            try:
                last_dt = datetime.fromisoformat(str(last).replace("T", " ").split(".")[0])
                elapsed = datetime.utcnow() - last_dt
                wait_min = cooldown_minutes - int(elapsed.total_seconds() / 60)
                if elapsed < timedelta(minutes=cooldown_minutes):
                    logger.warning(
                        f"[pool/ai-classify] user={uid} cid={customer_id} 쿨다운 잔여 {wait_min}분 — skip"
                    )
                    return {
                        "success": False, "reason": "cooldown",
                        "wait_minutes": max(wait_min, 1),
                    }
            except Exception:
                pass  # 파싱 실패 시 그냥 진행

    user_seeds = pool.list_user_seeds(customer_id)
    if not user_seeds:
        logger.warning(f"[pool/ai-classify] user={uid} cid={customer_id} user_seed 없음 — skip")
        return {"success": False, "reason": "no_user_seed"}

    rejects = pool.list_unclassified_rejects(
        customer_id, limit=candidates_limit, min_volume=min_volume
    )
    if not rejects:
        logger.warning(
            f"[pool/ai-classify] user={uid} cid={customer_id} 미분류 reject 없음 (검색량≥{min_volume}) — skip"
        )
        return {"success": False, "reason": "no_rejects"}

    # strict 모드 — saved_relevance 있으면 classify 가 보수적으로 전환됨 (drift 차단)
    from database.naver_ad_db import get_ad_account_relevance_keywords as _get_rel
    saved_relevance_local = _get_rel(uid, str(customer_id)) or []

    logger.warning(
        f"[pool/ai-classify] user={uid} cid={customer_id} 시작 — "
        f"seeds={len(user_seeds)} rejects={len(rejects)} (검색량≥{min_volume}) "
        f"relevance={len(saved_relevance_local)} {'STRICT' if len(saved_relevance_local) >= 3 else 'lenient'}"
    )

    result = await classify_rejects(
        user_seeds, rejects, seed_sample_size=50,
        saved_relevance=saved_relevance_local,
    )
    if not result.get("success"):
        msg = result.get("message", "unknown")
        logger.warning(f"[pool/ai-classify] user={uid} 분류 실패: {msg}")
        pool.record_run(
            uid, customer_id, "ai_classify", "failed",
            error_message=msg[:300],
            duration_ms=int((_time.monotonic() - t0) * 1000),
        )
        return {"success": False, "reason": "ai_failed", "message": msg}

    approved = result.get("approved") or []
    discarded = result.get("discarded") or []

    # approved → user_seed 로 합류 (검색량 그대로 보존, 즉시 다음 collect 게이트 atom 합류)
    promoted = 0
    if approved:
        mt_map = {r["keyword"]: r.get("monthly_total", 0) for r in rejects}
        items = [
            {
                "keyword": k,
                "seed": k,
                "source": "user_seed",
                "monthly_total": mt_map.get(k, 0),
            }
            for k in approved
        ]
        try:
            promoted = pool.add_candidates(uid, customer_id, items)
        except Exception as e:
            logger.warning(f"[pool/ai-classify] promote 실패: {e}")

    try:
        if approved:
            pool.mark_rejects_classified(customer_id, approved, "promoted")
        if discarded:
            pool.mark_rejects_classified(customer_id, discarded, "discarded")
    except Exception as e:
        logger.warning(f"[pool/ai-classify] mark 실패: {e}")

    pool.stamp_classify_cooldown(customer_id)

    duration_ms = int((_time.monotonic() - t0) * 1000)
    logger.warning(
        f"[pool/ai-classify] user={uid} cid={customer_id} 완료 — "
        f"approved={len(approved)} promoted={promoted} discarded={len(discarded)} "
        f"({duration_ms}ms) rationale={(result.get('rationale') or '')[:100]}"
    )
    pool.record_run(
        uid, customer_id, "ai_classify",
        "success" if approved else "no_match",
        added=promoted, skipped=len(discarded),
        seeds_count=len(user_seeds),
        error_message=(result.get("rationale") or "")[:300] or None,
        duration_ms=duration_ms,
    )
    return {
        "success": True,
        "approved": len(approved),
        "promoted": promoted,
        "discarded": len(discarded),
        "rationale": result.get("rationale", ""),
        "model": result.get("model"),
        "duration_ms": duration_ms,
    }


async def _run_pool_ai_cleanup_registered(
    uid: int,
    customer_id: int,
    *,
    dry_run: bool = True,
    batch_size: int = 200,
    max_kws: int = 1000,
    max_delete: int = 2000,
    incremental_minutes: Optional[int] = None,
    sample_seeds: int = 50,
) -> Dict[str, Any]:
    """등록된 KW 를 GPT 가 user_seed 와 비교 분류 → 무관 KW 실제 네이버 DELETE.

    기존 점수 기반 cleanup (`_run_domain_cleanup_for_account`) 의 atoms_2 인플레
    문제 우회 — 시드 1500개일 때 한국어 2-gram 합집합이 한국어 음절 거의 다
    포함해 무관 KW 도 30+ 점이라 ≤30 임계 통과 못함.

    GPT 가 의미적으로 도메인 일치 여부 판정 → 점수 인플레 무관, 정확.

    Args:
        dry_run: True 면 GPT 분류만 + 결과 통계 반환 (실제 DELETE 안 함, 실측용).
        batch_size: GPT 분류 batch 크기 (200 권장)
        max_kws: 한 번에 audit 할 최대 KW 수 (1000 권장, GPT 5 batch)
        incremental_minutes:
            None = 최근 등록순 max_kws 개 audit
            N = 최근 N분 등록 KW 만 (cron 인크리멘탈)
    """
    from services.ai_seed_suggester import classify_rejects
    from services.naver_ad_service import NaverAdApiClient
    from database.naver_ad_db import get_ad_account_by_customer
    from config import settings
    import time as _time
    import sqlite3 as _sql

    pool = get_keyword_pool_db()
    reg = get_registered_keywords_db()
    t0 = _time.monotonic()

    if not settings.OPENAI_API_KEY:
        return {"success": False, "reason": "no_api_key"}

    account = get_ad_account_by_customer(uid, str(customer_id))
    if not account or not account.get("is_connected"):
        return {"success": False, "reason": "no_account"}

    user_seeds = pool.list_user_seeds(customer_id)
    if not user_seeds:
        return {"success": False, "reason": "no_user_seed"}

    # 1) 등록 KW 조회
    with _sql.connect(reg.db_path) as conn:
        if incremental_minutes:
            rows = conn.execute(
                "SELECT keyword, ncc_keyword_id FROM registered_keywords "
                "WHERE account_customer_id=? AND ncc_keyword_id IS NOT NULL "
                "AND datetime(registered_at) > datetime('now', ?) "
                "ORDER BY registered_at DESC LIMIT ?",
                (customer_id, f"-{int(incremental_minutes)} minutes", int(max_kws)),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT keyword, ncc_keyword_id FROM registered_keywords "
                "WHERE account_customer_id=? AND ncc_keyword_id IS NOT NULL "
                "ORDER BY id DESC LIMIT ?",
                (customer_id, int(max_kws)),
            ).fetchall()

    if not rows:
        pool.record_run(
            uid, customer_id, "ai_cleanup", "no_new",
            error_message="audit 대상 0",
            duration_ms=int((_time.monotonic() - t0) * 1000),
        )
        return {"success": False, "reason": "no_registered"}

    # 2) batch GPT 분류 — classify_rejects 재활용. saved_relevance → strict 모드 (drift 정리용).
    from database.naver_ad_db import get_ad_account_relevance_keywords as _get_rel
    saved_relevance_local = _get_rel(uid, str(customer_id)) or []
    candidates = [{"keyword": kw, "monthly_total": 0} for kw, _kid in rows]
    kid_map: Dict[str, str] = {kw: kid for kw, kid in rows if kid}
    all_approved: Set[str] = set()
    all_discarded: Set[str] = set()
    batch_count = 0
    gpt_ms_total = 0

    for i in range(0, len(candidates), batch_size):
        batch = candidates[i:i + batch_size]
        ai_t0 = _time.monotonic()
        try:
            ai = await classify_rejects(
                user_seeds, batch, seed_sample_size=sample_seeds,
                saved_relevance=saved_relevance_local,
            )
        except Exception as e:
            logger.warning(f"[ai-cleanup] batch {i} 예외: {type(e).__name__}: {e}")
            continue
        gpt_ms_total += int((_time.monotonic() - ai_t0) * 1000)
        if not ai.get("success"):
            logger.warning(f"[ai-cleanup] batch {i} GPT 실패: {ai.get('message')}")
            continue
        all_approved.update(ai.get("approved") or [])
        all_discarded.update(ai.get("discarded") or [])
        batch_count += 1

    discarded_list = sorted(all_discarded)
    approved_list = sorted(all_approved)

    result: Dict[str, Any] = {
        "success": True,
        "dry_run": dry_run,
        "user_id": uid,
        "customer_id": customer_id,
        "incremental_minutes": incremental_minutes,
        "total_audited": len(rows),
        "batches": batch_count,
        "approved_count": len(approved_list),
        "discarded_count": len(discarded_list),
        "approved_samples": approved_list[:10],
        "discarded_samples": discarded_list[:20],
        "deleted": 0,
        "delete_failed": 0,
        "gpt_ms_total": gpt_ms_total,
    }

    # 3) dry_run=False — 실제 네이버 API DELETE
    if not dry_run and discarded_list:
        client = NaverAdApiClient()
        client.customer_id = account["customer_id"]
        client.api_key = account["api_key"]
        client.secret_key = account["secret_key"]

        n_del, n_fail = 0, 0
        # 한 round 의 DELETE 상한 — naver rate (0.12s/call) + 사고 방지.
        # 2000 = 약 4분 소요. 한의원 광고주 13만 drift KW 정리 시 약 65 라운드 = 11시간.
        for kw in discarded_list[:max(0, min(max_delete, 5000))]:
            kid = kid_map.get(kw)
            if not kid:
                continue
            try:
                await client.delete_keyword(kid)
                with _sql.connect(reg.db_path) as conn:
                    conn.execute(
                        "DELETE FROM registered_keywords "
                        "WHERE account_customer_id=? AND ncc_keyword_id=?",
                        (customer_id, kid),
                    )
                with _sql.connect(pool.db_path) as conn:
                    conn.execute(
                        "UPDATE naverad_keyword_pool SET status='deleted' "
                        "WHERE account_customer_id=? AND keyword=?",
                        (customer_id, kw),
                    )
                n_del += 1
                await asyncio.sleep(0.12)
            except Exception as e:
                n_fail += 1
                logger.warning(f"[ai-cleanup] DELETE 실패 {kw}({kid}): {e}")
        result["deleted"] = n_del
        result["delete_failed"] = n_fail

    duration_ms = int((_time.monotonic() - t0) * 1000)
    result["duration_ms"] = duration_ms

    pool.record_run(
        uid, customer_id, "ai_cleanup",
        "success" if (dry_run or result["deleted"] > 0) else "no_match",
        added=0, skipped=result["deleted"], seeds_count=len(rows),
        error_message=(
            f"AI cleanup {'dry-run' if dry_run else 'EXEC'} — "
            f"audit {len(rows)} → 통과 {len(approved_list)} / 컷 {len(discarded_list)} → "
            f"DELETE {result['deleted']} (fail {result['delete_failed']})"
        )[:300],
        duration_ms=duration_ms,
    )
    logger.warning(
        f"[ai-cleanup] user={uid} cid={customer_id} {'dry-run' if dry_run else 'EXEC'} "
        f"({duration_ms}ms) — audit {len(rows)} → 통과 {len(approved_list)} / "
        f"컷 {len(discarded_list)} → DELETE {result['deleted']} fail {result['delete_failed']}"
    )
    return result


async def _run_pool_seed_amplify(
    uid: int,
    customer_id: int,
    *,
    seed_sample_size: int = 100,
    target_count: int = 300,
    min_volume: int = 1,
    chunks_cap: int = 200,
) -> Dict[str, Any]:
    """user_seed 자가 amplify — GPT 가 시드 패턴 분석해 새 시드 후보 생성 →
    검색량 검증 → user_seed 합류. 게이트 atom 다양성↑ → collect/autocomplete 발굴↑.

    keywordstool BFS / 자동완성과 다른 channel — LLM 의 학습 지식 기반
    semantic 시드 펼침. niche 도메인에서도 cartesian product 으로 시드 ↑.

    흐름:
      1) user_seed 100개 sample → amplify_seeds (GPT 패턴 펼침, target=300)
      2) 풀 dedup (이미 있는 KW 제외)
      3) keywordstool 검색량 batch (5개씩)
      4) ≥ min_volume 인 것만 source='user_seed', seed=keyword 로 add_candidates
      5) → 다음 collect 부터 게이트 atom + BFS hint 로 사용
    """
    from services.ai_seed_suggester import amplify_seeds
    from services.naver_ad_service import NaverAdApiClient
    from database.naver_ad_db import get_ad_account_by_customer
    from config import settings
    import time as _time
    import random

    pool = get_keyword_pool_db()
    t0 = _time.monotonic()

    if not settings.OPENAI_API_KEY:
        return {"success": False, "reason": "no_api_key"}

    account = get_ad_account_by_customer(uid, str(customer_id))
    if not account or not account.get("is_connected"):
        return {"success": False, "reason": "no_account"}

    user_seeds = pool.list_user_seeds(customer_id)
    if not user_seeds:
        return {"success": False, "reason": "no_user_seed"}

    # 시드 cap 도달 시 amplify 의미 없음 — 500 시드 이상이면 skip (성능 보호)
    if len(user_seeds) >= 5000:
        return {"success": False, "reason": "seeds_capped", "current": len(user_seeds)}

    seed_sample = (
        random.sample(user_seeds, seed_sample_size)
        if len(user_seeds) > seed_sample_size else list(user_seeds)
    )

    logger.warning(
        f"[pool/amplify] user={uid} cid={customer_id} 시작 — "
        f"시드 {len(seed_sample)}/{len(user_seeds)} → amplify target {target_count}"
    )

    # 1) GPT amplify
    am_t0 = _time.monotonic()
    am_result = await amplify_seeds(seed_sample, target_count=target_count)
    am_ms = int((_time.monotonic() - am_t0) * 1000)

    if not am_result.get("success"):
        msg = am_result.get("message", "unknown")
        pool.record_run(
            uid, customer_id, "seed_amplify", "failed",
            seeds_count=len(seed_sample),
            error_message=f"amplify 실패: {msg[:200]}",
            duration_ms=int((_time.monotonic() - t0) * 1000),
        )
        return {"success": False, "reason": "amplify_failed", "message": msg}

    raw_seeds = am_result.get("seeds") or []
    # 원본 시드 제외 (이미 user_seed 로 있음)
    user_seed_set = set(user_seeds)
    new_seeds = [s for s in raw_seeds if isinstance(s, str) and s.strip() and s not in user_seed_set]

    # 2) 풀 dedup (이미 어떤 status 로든 풀에 있는 KW 제외)
    pool_set = pool.list_pool_keyword_set(customer_id)
    fresh_seeds = [s for s in new_seeds if s not in pool_set]

    if not fresh_seeds:
        pool.record_run(
            uid, customer_id, "seed_amplify", "no_new",
            seeds_count=len(seed_sample),
            error_message=f"amplify {len(raw_seeds)} → fresh 0 (전부 dedup)",
            duration_ms=int((_time.monotonic() - t0) * 1000),
        )
        return {"success": False, "reason": "all_known"}

    # 2-b) 도메인 게이트 — saved_relevance 있는 계정만. drift 증폭기 차단.
    # 한의원 계정에 차 KW (2024쏘나타) 가 amplify cartesian 으로 폭발해 user_seed 합류 →
    # 다음 collect 라운드 anchor → 자식 KW 도메인 게이트 무력화 → 100k drift 사고.
    # saved_relevance 비어있으면 (cold start) skip — 시드 0 광고주 진입 봉쇄 방지.
    # 컷 점수 — 사용자 auto_cleanup_threshold (광고주별 30~75) 와 동기화. 옛 hardcoded 30
    # 으로는 풀에 31~49 점수 KW drift → 다음 cleanup tick 에서 정리 → 무한 회전.
    from database.naver_ad_db import get_ad_account_relevance_keywords as _get_rel
    from database.naver_ad_db import get_ad_account_auto_cleanup as _get_thr
    saved_relevance = _get_rel(uid, str(customer_id)) or []
    _thr_cfg = _get_thr(uid, str(customer_id)) or {}
    _domain_gate_thr = int(_thr_cfg.get("threshold") or 50)
    domain_filtered_count = 0
    if saved_relevance and len([s for s in saved_relevance if s and len(s) >= 2]) >= 3:
        before = len(fresh_seeds)
        kept = [s for s in fresh_seeds if _compute_relevance_score(s, saved_relevance) >= _domain_gate_thr]
        domain_filtered_count = before - len(kept)
        fresh_seeds = kept
        if not fresh_seeds:
            pool.record_run(
                uid, customer_id, "seed_amplify", "no_new",
                seeds_count=len(seed_sample),
                error_message=(
                    f"amplify {len(raw_seeds)} → fresh {before} → 도메인필터 0 "
                    f"(relevance={len(saved_relevance)} 와 매칭 0)"
                )[:300],
                duration_ms=int((_time.monotonic() - t0) * 1000),
            )
            return {"success": False, "reason": "domain_filter_all_out"}

    logger.warning(
        f"[pool/amplify] amplify ({am_ms}ms) — raw {len(raw_seeds)} → "
        f"fresh {len(fresh_seeds)}"
        + (f" (도메인필터 컷 {domain_filtered_count})" if domain_filtered_count else "")
    )

    # 3) keywordstool 검색량 batch
    client = NaverAdApiClient()
    client.customer_id = account["customer_id"]
    client.api_key = account["api_key"]
    client.secret_key = account["secret_key"]

    vol_t0 = _time.monotonic()
    vol_map: Dict[str, dict] = {}
    CHUNK = 5
    chunks = [fresh_seeds[i:i + CHUNK] for i in range(0, len(fresh_seeds), CHUNK)][:chunks_cap]
    for chunk in chunks:
        try:
            r = await client.get_keywords_volume_batch(chunk)
            vol_map.update(r)
        except Exception as e:
            logger.debug(f"[pool/amplify] volume batch 실패: {e}")
        await asyncio.sleep(0.1)
    vol_ms = int((_time.monotonic() - vol_t0) * 1000)

    # 4) ≥ min_volume 만 user_seed 합류
    qualified_items = []
    for s in fresh_seeds:
        v = vol_map.get(s) or vol_map.get(s.replace(" ", ""))
        if not v:
            continue
        mt = int(v.get("monthly_total") or 0)
        if mt < min_volume:
            continue
        qualified_items.append({
            "keyword": s,
            "monthly_total": mt,
            "monthly_pc": int(v.get("monthly_pc") or 0),
            "monthly_mobile": int(v.get("monthly_mobile") or 0),
            "comp_idx": v.get("comp_idx"),
            "source": "user_seed",
            "seed": s,  # 시드 자기 자신 = 시드 row
        })

    promoted = 0
    if qualified_items:
        try:
            promoted = pool.add_candidates(uid, customer_id, qualified_items)
        except Exception as e:
            logger.warning(f"[pool/amplify] add 실패: {e}")

    duration_ms = int((_time.monotonic() - t0) * 1000)
    logger.warning(
        f"[pool/amplify] user={uid} cid={customer_id} 완료 ({duration_ms}ms) — "
        f"amplify {len(raw_seeds)} → fresh {len(fresh_seeds)} → "
        f"검색량≥{min_volume} {len(qualified_items)} → user_seed +{promoted} "
        f"(GPT {am_ms}ms, vol {vol_ms}ms, pattern={am_result.get('detected_pattern', '')[:60]})"
    )
    pool.record_run(
        uid, customer_id, "seed_amplify",
        "success" if promoted > 0 else "no_match",
        added=promoted,
        seeds_count=len(seed_sample),
        error_message=(
            f"amplify {len(raw_seeds)} → fresh {len(fresh_seeds)} → "
            f"검색량≥{min_volume} {len(qualified_items)} → user_seed +{promoted}"
        )[:300],
        duration_ms=duration_ms,
    )
    return {
        "success": True,
        "amplify_total": len(raw_seeds),
        "fresh": len(fresh_seeds),
        "volume_qualified": len(qualified_items),
        "promoted": promoted,
        "duration_ms": duration_ms,
    }


async def _run_pool_autocomplete_mining(
    uid: int,
    customer_id: int,
    *,
    seed_sample_size: int = 200,
    per_seed: int = 10,
    min_volume: int = 1,
    chunks_cap: int = 50,
) -> Dict[str, Any]:
    """naver 검색 자동완성으로 시드 인접 KW 발굴 → GPT 분류 → 자식 풀 직접 추가.

    keywordstool BFS 와 별도 발굴 채널. 시드별 자동완성 ~10 KW = 1500~2000 후보.
    검색량 검증 + GPT 도메인 분류 통과 KW 만 자식 풀 진입.

    흐름:
      1) user_seed N개 random sample → naver 자동완성 batch (concurrency 10)
      2) 풀/reject 분류 KW dedup
      3) keywordstool 검색량 batch (5개씩, 250 chunks cap)
      4) 검색량 ≥ min_volume → GPT 분류 (검색량 상위 200개)
      5) 통과 KW source='ai_autocomplete' 로 add_candidates → 자식 풀 즉시 진입
      6) 분류 결과 reject 풀에 INSERT+mark → 다음 cron 재호출 차단
    """
    from services.naver_autocomplete import collect_autocomplete
    from services.naver_ad_service import NaverAdApiClient
    from services.ai_seed_suggester import classify_rejects
    from database.naver_ad_db import get_ad_account_by_customer
    from config import settings
    import time as _time
    import random

    pool = get_keyword_pool_db()
    t0 = _time.monotonic()

    if not settings.OPENAI_API_KEY:
        logger.warning(f"[pool/autocomplete] OPENAI_API_KEY 미설정 — skip")
        return {"success": False, "reason": "no_api_key"}

    account = get_ad_account_by_customer(uid, str(customer_id))
    if not account or not account.get("is_connected"):
        return {"success": False, "reason": "no_account"}

    user_seeds = pool.list_user_seeds(customer_id)
    if not user_seeds:
        return {"success": False, "reason": "no_user_seed"}

    # saturation 가드 — 풀 사용량 ≥ 98% 일 때 skip.
    # domain_cleanup(30분 주기) + cap_self_heal 가 무관 KW 빼면 풀이 98% 미만에서 평형 →
    # autocomplete 가 95~98% 구간에서도 새 KW 발굴 지속 → 물갈이 사이클 자연 가동.
    # 98% 도달 시엔 skip — niche 도메인은 mt=0 long-tail 만 토하므로 API 비용 낭비.
    reg_db = get_registered_keywords_db()
    pool_pending = (pool.stats(customer_id).get("by_status") or {}).get("pending", 0)
    active_reg = int((reg_db.stats(customer_id) or {}).get("active") or 0)
    used = active_reg + pool_pending
    # 98% → 99.5% 로 완화. 옛 가드는 cleanup ≈ register 평형 시 영구 skip 사고 발생.
    # autocomplete 는 발굴 자체에 비용 작음 (Naver autocomplete API 만 호출, GPT 불사용).
    # 발굴된 후보가 풀에 들어갈 슬롯 없으면 pool.add_keywords 가 알아서 skip 처리.
    if used >= 99_500:
        pool.record_run(
            uid, customer_id, "autocomplete", "no_new",
            seeds_count=0,
            error_message=(
                f"saturation guard — used {used}/100k ≥99.5% → autocomplete skip "
                f"(cleanup 후 재진입)"
            )[:300],
            duration_ms=int((_time.monotonic() - t0) * 1000),
        )
        logger.warning(
            f"[pool/autocomplete] user={uid} cid={customer_id} saturation guard "
            f"({used}/100k ≥99.5%) — skip"
        )
        return {"success": False, "reason": "saturation_guard", "used": used}

    if len(user_seeds) > seed_sample_size:
        seed_sample = random.sample(user_seeds, seed_sample_size)
    else:
        seed_sample = list(user_seeds)

    logger.warning(
        f"[pool/autocomplete] user={uid} cid={customer_id} 시작 — "
        f"시드 {len(seed_sample)}/{len(user_seeds)} 자동완성 mining "
        f"(used {used}/100k)"
    )

    # 1) 자동완성 batch 수집
    ac_t0 = _time.monotonic()
    try:
        ac_result = await collect_autocomplete(
            seed_sample, per_seed=per_seed, concurrency=10, timeout=5.0,
        )
    except Exception as e:
        logger.error(f"[pool/autocomplete] 자동완성 호출 실패: {e}", exc_info=True)
        pool.record_run(
            uid, customer_id, "autocomplete", "failed",
            seeds_count=len(seed_sample),
            error_message=f"자동완성 호출 실패: {type(e).__name__}",
            duration_ms=int((_time.monotonic() - t0) * 1000),
        )
        return {"success": False, "reason": "autocomplete_failed"}
    ac_ms = int((_time.monotonic() - ac_t0) * 1000)

    all_kws: Set[str] = set()
    for kws in ac_result.values():
        for k in kws:
            all_kws.add(k)

    if not all_kws:
        pool.record_run(
            uid, customer_id, "autocomplete", "no_new",
            seeds_count=len(seed_sample),
            error_message="자동완성 결과 0개",
            duration_ms=int((_time.monotonic() - t0) * 1000),
        )
        return {"success": False, "reason": "no_autocomplete"}

    logger.warning(
        f"[pool/autocomplete] 자동완성 ({ac_ms}ms) — KW {len(all_kws)}개"
    )

    # 2) 분류 이력 dedup (풀 중복은 add_candidates 가 INSERT OR IGNORE 처리)
    classified_set = set(pool.list_classified_reject_keywords(customer_id))
    fresh_kws: List[str] = [kw for kw in all_kws if kw not in classified_set]

    if not fresh_kws:
        pool.record_run(
            uid, customer_id, "autocomplete", "no_new",
            seeds_count=len(seed_sample),
            error_message=f"자동완성 {len(all_kws)}개 모두 dedup",
            duration_ms=int((_time.monotonic() - t0) * 1000),
        )
        return {"success": False, "reason": "all_known"}

    # 3) keywordstool 검색량 batch — 5개씩, 250 chunks (1250 KW) cap
    client = NaverAdApiClient()
    client.customer_id = account["customer_id"]
    client.api_key = account["api_key"]
    client.secret_key = account["secret_key"]

    vol_t0 = _time.monotonic()
    vol_map: Dict[str, dict] = {}
    CHUNK = 5
    # chunks_cap 50 × CHUNK 5 = 최대 250 KW 검증. sleep 0.3 — keywordstool 429 rate 회피.
    # 실측 (cid 1858907): chunks 250 × sleep 0.1 = 90~230초 + 429 retry → 4분 소요 + 결과 0.
    # chunks 50 × sleep 0.3 = 15초, 429 회피 + 정상 결과.
    chunks = [fresh_kws[i:i + CHUNK] for i in range(0, len(fresh_kws), CHUNK)][:chunks_cap]
    for chunk in chunks:
        try:
            r = await client.get_keywords_volume_batch(chunk)
            vol_map.update(r)
        except Exception as e:
            logger.debug(f"[pool/autocomplete] volume batch 실패 {chunk[:1]}: {e}")
        await asyncio.sleep(0.3)
    vol_ms = int((_time.monotonic() - vol_t0) * 1000)

    qualified: List[Dict] = []
    for kw in fresh_kws:
        v = vol_map.get(kw) or vol_map.get(kw.replace(" ", ""))
        if not v:
            continue
        mt = int(v.get("monthly_total") or 0)
        if mt < min_volume:
            continue
        qualified.append({
            "keyword": kw,
            "monthly_total": mt,
            "monthly_pc": int(v.get("monthly_pc") or 0),
            "monthly_mobile": int(v.get("monthly_mobile") or 0),
            "comp_idx": v.get("comp_idx"),
        })

    logger.warning(
        f"[pool/autocomplete] 검색량 ({vol_ms}ms) — "
        f"{len(fresh_kws)} → 검색량≥{min_volume} {len(qualified)}"
    )

    if not qualified:
        # mt=0 zerovol fallback 제거 (2026-05-12) — 사용자 명시 거부:
        # "검색량 있는 키워드로 연관된 키워드 싹다 잡아야". mt=0 KW 는 광고비/노출 0 이라
        # 등록 가치 없음. 또한 claim_pending min_volume=1 필터에 영구 걸려 register 워커가
        # 처리 못 함 → pending 풀에 dead row 누적 → register cron 이 "등록가능 0" 으로 정지.
        # niche 시드라 keywordstool mt=0 만 나오면 그 시드는 자식 발굴 못 함 — 시드 자체
        # 부적합. 이 라운드는 no_new 로 끝내고 registered-as-seed (collect 측) 가 발굴 담당.
        duration_ms = int((_time.monotonic() - t0) * 1000)
        logger.warning(
            f"[pool/autocomplete] user={uid} cid={customer_id} zero-vol skip — "
            f"자동완성 {len(all_kws)} → 검색량≥{min_volume} 통과 0 → mt=0 fallback 차단 "
            f"({duration_ms}ms)"
        )
        pool.record_run(
            uid, customer_id, "autocomplete", "no_new",
            added=0, seeds_count=len(seed_sample),
            error_message=(
                f"자동완성 {len(all_kws)} → 검색량 통과 0 → mt=0 fallback 차단 (정책)"
            )[:300],
            duration_ms=duration_ms,
        )
        return {"success": False, "reason": "zero_vol_skipped", "promoted": 0}

    # 4) GPT 분류 — 검색량 상위 1000개 (200 batch × 5 병렬, AI-first 빠른 채움)
    qualified.sort(key=lambda x: -x["monthly_total"])
    classify_input = qualified[:1000]
    ai_t0 = _time.monotonic()
    BATCH = 200
    _sem = asyncio.Semaphore(3)

    # saved_relevance → strict 모드 (autocomplete 도 drift 차단 게이트)
    from database.naver_ad_db import get_ad_account_relevance_keywords as _get_rel
    autocomplete_relevance = _get_rel(uid, str(customer_id)) or []

    async def _classify_one(batch: List[Dict]) -> Dict[str, Any]:
        async with _sem:
            return await classify_rejects(
                user_seeds, batch, seed_sample_size=50,
                saved_relevance=autocomplete_relevance,
            )

    batches = [classify_input[i:i + BATCH] for i in range(0, len(classify_input), BATCH)]
    batch_results = await asyncio.gather(
        *[_classify_one(b) for b in batches], return_exceptions=True,
    )
    ai_ms = int((_time.monotonic() - ai_t0) * 1000)

    approved: List[str] = []
    discarded: List[str] = []
    batch_ok = 0
    batch_fail = 0
    for r in batch_results:
        if isinstance(r, Exception) or not (isinstance(r, dict) and r.get("success")):
            batch_fail += 1
            continue
        batch_ok += 1
        approved.extend(r.get("approved") or [])
        discarded.extend(r.get("discarded") or [])
    approved = list(dict.fromkeys(approved))
    discarded = list(dict.fromkeys(discarded))

    if batch_ok == 0:
        msg = "all batches failed"
        pool.record_run(
            uid, customer_id, "autocomplete", "failed",
            seeds_count=len(seed_sample),
            error_message=f"GPT 분류 실패: {msg}",
            duration_ms=int((_time.monotonic() - t0) * 1000),
        )
        return {"success": False, "reason": "ai_failed", "message": msg}

    # GPT 통과 0 fallback — 검색량 상위 200개를 풀 직접 합류 (drift 감수).
    # niche 시드 (의료/희귀) 에서 GPT 가 모두 컷 판정해도 풀이 마르지 않게 보장.
    # 무관 KW 가 풀에 들어가도 네이버 검수 → 노출제한 → inspect cron 자동 삭제로 자정.
    # cap 30 → 200: 시간당 autocomplete 12회 × +200 = +2400 풀 합류.
    # 도메인 점수 컷 — 사용자 auto_cleanup_threshold (default 50) 이상만 통과.
    # autocomplete GPT 가 도메인 분류했어도 점수 ≥ thr 보장 안 됨 → 직접 컷.
    from database.naver_ad_db import get_ad_account_auto_cleanup as _get_thr_ac
    from database.naver_ad_db import get_ad_account_relevance_keywords as _get_rel_ac
    _thr_cfg_ac = _get_thr_ac(uid, str(customer_id)) or {}
    _ac_thr = int(_thr_cfg_ac.get("threshold") or 50)
    _ac_rel = _get_rel_ac(uid, str(customer_id)) or []
    if not _ac_rel:
        _ac_rel = [s for s in (pool.list_user_seeds(customer_id) or []) if s and len(s) >= 2]

    ai_fallback = False
    if not approved and classify_input:
        ai_fallback = True
        # 검색량 상위 fallback 도 점수 ≥ thr 만 통과
        approved = [
            q["keyword"] for q in classify_input[:500]
            if not _ac_rel or _compute_relevance_score(q["keyword"], _ac_rel) >= _ac_thr
        ][:200]
        logger.warning(
            f"[pool/autocomplete] user={uid} GPT 통과 0 — 검색량 상위 + 점수≥{_ac_thr} "
            f"만 fallback {len(approved)}개 합류"
        )

    # 5) 통과 KW → 자식 풀 직접 추가 (점수 컷 후)
    promoted = 0
    if approved:
        approved_set = set(approved)
        # GPT 통과 + 점수 컷 — drift 차단
        items = [
            {
                "keyword": q["keyword"],
                "monthly_total": q["monthly_total"],
                "monthly_pc": q["monthly_pc"],
                "monthly_mobile": q["monthly_mobile"],
                "comp_idx": q.get("comp_idx"),
                "source": "ai_autocomplete",
                "seed": "ai_autocomplete",
            }
            for q in classify_input
            if q["keyword"] in approved_set
            and (not _ac_rel or _compute_relevance_score(q["keyword"], _ac_rel) >= _ac_thr)
        ]
        try:
            promoted = pool.add_candidates(uid, customer_id, items)
        except Exception as e:
            logger.warning(f"[pool/autocomplete] add 실패: {e}")

    # 6) 분류 결과를 reject 풀에 INSERT + mark → 다음 cron classified_set 에 잡힘
    try:
        all_classified_items = [
            {"keyword": q["keyword"], "monthly_total": q["monthly_total"]}
            for q in classify_input
        ]
        pool.add_rejects(customer_id, all_classified_items)
        if approved:
            pool.mark_rejects_classified(customer_id, approved, "promoted")
        if discarded:
            pool.mark_rejects_classified(customer_id, discarded, "discarded")
    except Exception as e:
        logger.debug(f"[pool/autocomplete] reject mark: {e}")

    duration_ms = int((_time.monotonic() - t0) * 1000)
    logger.warning(
        f"[pool/autocomplete] user={uid} cid={customer_id} 완료 ({duration_ms}ms) — "
        f"자동완성 {len(all_kws)} → 검증 {len(fresh_kws)} → "
        f"검색량≥{min_volume} {len(qualified)} → 분류 {len(classify_input)} "
        f"(batch {batch_ok}OK/{batch_fail}fail{', fallback' if ai_fallback else ''}) → "
        f"통과 {len(approved)} (자식 +{promoted}) / 컷 {len(discarded)} "
        f"(GPT {ai_ms}ms)"
    )
    pool.record_run(
        uid, customer_id, "autocomplete",
        "success" if promoted > 0 else "no_match",
        added=promoted, skipped=len(discarded),
        seeds_count=len(seed_sample),
        error_message=(
            f"자동완성 {len(all_kws)} → 검색량≥{min_volume} {len(qualified)} → "
            f"GPT 통과 {len(approved)}{' (fallback)' if ai_fallback else ''} "
            f"(자식 +{promoted}) / 컷 {len(discarded)}"
        )[:300],
        duration_ms=duration_ms,
    )
    return {
        "success": True,
        "autocomplete_kws": len(all_kws),
        "volume_qualified": len(qualified),
        "approved": len(approved),
        "promoted": promoted,
        "discarded": len(discarded),
        "duration_ms": duration_ms,
    }


# 의료/요양 기관·의료인 토큰 — category_split 모드에서 키워드 분류용.
_MEDICAL_TOKENS = (
    "병원", "약국", "한의원", "한방병원", "요양원", "요양병원", "동물병원", "산후조리원",
    "재활병원", "정신병원", "치과", "검진센터", "노인요양", "요양시설", "의원", "의료기관",
    "메디컬", "의료", "의사", "약사", "한의사", "수의사", "간호사", "전공의", "개원의",
    "봉직의", "페이닥터", "전문의", "개원", "원장",
)


def _classify_medical(keyword: str) -> bool:
    """키워드가 의료·요양 도메인이면 True (의료대출 캠페인), 아니면 False (비의료대출)."""
    kw = (keyword or "").replace(" ", "")
    return any(t in kw for t in _MEDICAL_TOKENS)


async def _run_pool_register(uid: int, customer_id: Optional[int] = None, batch: int = 3000, bid: Optional[int] = None):
    """등록 1회 — pending → orchestrator로 일괄.
    customer_id 명시 시 그 광고주만 처리, 없으면 사용자의 가장 최근 광고주.
    bid=None 이면 광고주 default_bid (없으면 100원) 사용 — 광고주마다 다른 값 가능."""
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

    # 입찰가 — 호출자 명시값 > 광고주 default_bid > 100원 (legacy fallback)
    if bid is None:
        bid = max(70, int(account.get("default_bid") or 100))
    else:
        bid = max(70, int(bid))

    pending = pool.claim_pending(customer_id, limit=batch, min_volume=10)  # 검색량 10 미만 등록 절대 차단
    if not pending:
        s = pool.stats(customer_id)
        pending_total = (s.get("by_status") or {}).get("pending", 0)
        pending_registerable = int(s.get("pending_registerable") or 0)
        seed_rows = max(0, pending_total - pending_registerable)
        logger.warning(
            f"[pool/register] user={uid} pending 없음 "
            f"(등록가능={pending_registerable} / 시드={seed_rows} / 전체pending={pending_total})"
        )
        pool.record_run(
            uid, customer_id, "register", "no_pending",
            pending_after=pending_registerable,
            error_message=(
                f"등록가능 0 (시드 {seed_rows}, 전체pending {pending_total}) — "
                f"새 키워드 수집 대기"
            ) if pending_total else "pending 0",
            duration_ms=int((_time.monotonic()-t0)*1000),
        )
        return
    keywords = [p["keyword"] for p in pending]
    logger.warning(f"[pool/register] user={uid} 시작 batch={len(keywords)}")

    # ───── 도메인 하드 게이트 (register 단계, 2026-05-22) ─────
    # collect/seed_amplify 가 pending 에 off-domain(다낭·유산균 등)을 넣어도 여기서 컷.
    # saved relevance_keywords 로 점수 < 30 인 pending 은 'domain_skipped' 로 빼서
    # pending 에서 제거(재claim 방지), 통과분만 네이버 등록. relevance 미설정 시 스킵(=구동작 유지).
    try:
        from database.naver_ad_db import get_ad_account_relevance_keywords as _grk_gate
        _rel_gate = [s for s in (_grk_gate(uid, str(customer_id)) or []) if s and len(s) >= 2]
        if len(_rel_gate) >= 3:
            _ga3, _ga2 = set(), set()
            for _s in _rel_gate:
                if len(_s) >= 4:
                    _ga3.add(_s)
                for _n in (2, 3):
                    for _i in range(len(_s) - _n + 1):
                        _a = _s[_i:_i + _n]
                        (_ga2 if len(_a) == 2 else _ga3).add(_a)
            _on, _off_ids, _junk_n, _neg_n = [], [], 0, 0
            _JUNK_TOKENS = ("후기", "추천", "비용", "상담", "전문", "정보", "비교", "잘하는곳")
            # negative-token: 한의원 진료가 아닌 상업/비의료 단어. 짧은 질환명(기침·건선·태선·
            # 모반 등)이 무관 단어에 substring 으로 박히는 오매칭 차단 (예: 아기'침대'·물'건선'반).
            _NEG_TOKENS = (
                "침대", "매트", "매트리스", "선반", "가구", "대여", "렌탈", "렌트", "침구", "이불",
                "베개", "소파", "책상", "의자", "수납", "옷장", "주택", "분양", "아파트", "오피스텔",
                "인테리어", "조명", "커튼", "벽지", "그릇", "용기", "포장", "택배", "자동차", "중고차",
                "타이어", "보험", "대출", "적금", "예금", "주식", "펀드", "코인", "비트코인", "재테크",
                "여행", "호텔", "펜션", "리조트", "항공권", "강의", "학원", "인강", "과외", "토익",
                "토플", "자격증", "공무원", "게임", "영화", "드라마", "웹툰", "만화", "레시피", "맛집",
                "식당", "배달", "쇼핑몰", "직구", "운동화", "신발", "가방", "지갑", "선글라스", "안경",
                "화장품", "향수", "립스틱", "컨실러", "쿠션", "파운데이션", "비비크림", "마스카라",
                "유산균", "젤리", "홍삼", "영양제", "비타민제", "콜라겐젤리", "오메가3", "프로틴",
                "노트북", "휴대폰", "에어컨", "냉장고", "세탁기", "청소기", "공기청정기",
            )
            for _p in pending:
                _kw = _p["keyword"] or ""
                _kwc = _kw.replace(" ", "")
                # 정크 컷 (GPT 패딩: 반복토큰 2회+ 또는 과길이) — Naver mt=10 floor 통과하는 무의미 문자열.
                if len(_kwc) >= 20 or any(_kwc.count(_t) >= 2 for _t in _JUNK_TOKENS):
                    _off_ids.append(_p["id"]); _junk_n += 1
                    continue
                # negative-token 컷 (상업/비의료 — substring 오매칭 방지)
                if any(_neg in _kwc for _neg in _NEG_TOKENS):
                    _off_ids.append(_p["id"]); _neg_n += 1
                    continue
                _sc = 0
                _full = False
                for _s in _rel_gate:
                    if _s in _kw:
                        _sc = 100; _full = True; break
                    if _kw and _kw in _s:
                        _sc = 95; _full = True; break
                if not _full:
                    _n3 = sum(1 for _a in _ga3 if _a in _kw)
                    _n2 = sum(1 for _a in _ga2 if _a in _kw)
                    _sc = min(95, min(80, _n3 * 20) + min(30, _n2 * 5))
                if _sc >= 30:
                    _on.append(_p)
                else:
                    _off_ids.append(_p["id"])
            if _off_ids:
                pool.mark_status(_off_ids, "domain_skipped")
            logger.warning(
                f"[pool/register] 도메인게이트: {len(pending)} → 통과 {len(_on)} / 컷 {len(_off_ids)} (정크 {_junk_n} / 상업컷 {_neg_n})"
            )
            pending = _on
            keywords = [p["keyword"] for p in pending]
            if not pending:
                pool.record_run(
                    uid, customer_id, "register", "no_pending",
                    error_message="도메인게이트 통과 0 — claim 된 pending 전부 off-domain",
                    duration_ms=int((_time.monotonic() - t0) * 1000),
                )
                return
    except Exception as _e:
        logger.warning(f"[pool/register] 도메인게이트 예외(무시, 전체등록 진행): {type(_e).__name__}: {_e}")

    client = NaverAdApiClient()
    client.customer_id = account["customer_id"]
    client.api_key = account["api_key"]
    client.secret_key = account["secret_key"]

    # 호출 전 등록 set 캐시 — 호출 후 차집합으로 진짜 신규만 success 판정.
    reg = get_registered_keywords_db()
    existing_before = set(reg.get_existing_set(customer_id, keywords) or set())

    AD_GROUPS_PER_POOL_CAMPAIGN = 50  # 50 × 1000 = 50,000 키워드/캠페인. 100k = 캠페인 2개.
    reuse_id: Optional[str] = None

    # category_split 모드 여부 (의료/비의료 한글 캠페인 분리). 비-split 계정(소잠 등)은 기존 'auto' 경로.
    category_mode = False
    _cat_budgets = (3000, 1000)
    try:
        from database.naver_ad_db import get_domain_profile as _gdp_cs
        _profcs = _gdp_cs(uid, str(customer_id)) or {}
        category_mode = bool(_profcs.get("category_split"))
        _cat_budgets = (int(_profcs.get("daily_budget") or 3000), int(_profcs.get("nonmedical_budget") or 1000))
    except Exception:
        pass

    if category_mode:
        # ── 의료/비의료 분리 등록 — 각 카테고리별 한글 캠페인(재사용) + 차등 예산 ──
        result = {"success": True, "campaign_ids": []}
        med_kws = [k for k in keywords if _classify_medical(k)]
        non_kws = [k for k in keywords if not _classify_medical(k)]
        for _cat, _label, _kws, _bud in (
            ("medical", "의료대출", med_kws, _cat_budgets[0]),
            ("nonmedical", "비의료대출", non_kws, _cat_budgets[1]),
        ):
            if not _kws:
                continue
            _new_grp = (len(_kws) + 999) // 1000
            _st = pool.get_active_pool_campaign_cat(customer_id, _cat)
            _reuse = None; _sidx = 0
            if _st and _st.get("ad_groups_count", 0) + _new_grp <= AD_GROUPS_PER_POOL_CAMPAIGN:
                _reuse = _st["campaign_id"]; _sidx = _st["ad_groups_count"]
            _jid = create_bulk_upload_job(
                user_id=uid, filename=f"pool_{_cat}_{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                campaign_prefix=_label, keywords_per_group=1000, bid=bid,
                daily_budget=_bud, total_keywords=len(_kws),
            )
            _cfg = BulkJobConfig(
                job_id=_jid, user_id=uid, campaign_prefix=_label, keywords_per_group=1000,
                bid=bid, daily_budget=_bud, campaign_tp="WEB_SITE",
                reuse_campaign_id=_reuse, start_ad_group_index=_sidx,
            )
            try:
                _r = await BulkUploadOrchestrator(client).run(_cfg, _kws)
            except Exception as e:
                logger.error(f"[pool/register-cat] {_label} orchestrator 실패: {e}", exc_info=True)
                result["success"] = False; result["error"] = f"{type(e).__name__}: {str(e)[:160]}"
                continue
            _cids = _r.get("campaign_ids") or []
            result["campaign_ids"].extend(_cids)
            if not _r.get("success"):
                result["success"] = False; result["error"] = _r.get("error")
            try:
                if _reuse:
                    pool.set_active_pool_campaign_cat(customer_id, _cat, _reuse, _sidx + _new_grp)
                elif _cids:
                    pool.set_active_pool_campaign_cat(customer_id, _cat, _cids[0], _new_grp)
            except Exception as e:
                logger.warning(f"[pool/register-cat] {_label} cat-state 갱신 실패: {e}")
            logger.warning(f"[pool/register-cat] {_label} {len(_kws)}개 (budget {_bud}, reuse={bool(_reuse)})")
    else:
        # ── 기존 경로 (auto_ 단일 캠페인, 예산 1만) — 변경 없음 ──
        pool_state = pool.get_active_pool_campaign(customer_id)
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

    # 풀 state 업데이트 — 캠페인 재사용 또는 새 캠페인 등록 (category_mode 는 위에서 cat-state 갱신 완료)
    if not category_mode:
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

    # Pre-flight 실패 (channel lookup, no business channel, account cap 등) — 키워드
    # 자체엔 문제 없음. failed 영구 마킹 시 다음 tick 재시도 불가 → 117k 누적 실패
    # 사고. transient 식별 시 pending 유지하여 다음 tick 자동 재시도.
    _transient_markers = ("channel lookup", "no business channel", "account keyword cap")
    is_transient_preflight = (
        not result.get("success")
        and err_msg
        and any(m in err_msg for m in _transient_markers)
    )
    if is_transient_preflight and failed_ids:
        logger.warning(
            f"[pool/register] user={uid} pre-flight 실패 ({err_msg[:80]}) — "
            f"{len(failed_ids)}개 pending 유지 (다음 tick 재시도)"
        )
        # mark_status skip — pending 그대로 둠. 다음 register tick 이 다시 claim.
    else:
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

    # 노출제한 검사는 register 끝이 아닌 _run_pool_inspect_only 단독 실행으로 이전됨.
    # Why: register 의 pending=0 / orchestrator 실패 early return 시 inspect 자체가 호출
    # 안 됨 → 노출제한 자동 삭제 영구 미실행 누수. cron tick 마다 register 와 독립적으로
    # _run_pool_inspect_only 호출되도록 _run_pool_workers_for_accounts 에서 보장.


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
    debug_samples_logged = False  # 첫 광고그룹 첫 KW dict 한 번만 logging
    total_kws_checked = 0
    for ag_id in ad_group_ids:
        try:
            kws = await client.get_keywords(ad_group_id=ag_id) or []
        except Exception as e:
            logger.warning(f"[pool/inspect] {ag_id} 조회 실패: {e}")
            continue
        # 디버그 — 첫 광고그룹 첫 KW dict 의 keys + review/inspect/status/statusReason 값 logging.
        # fly logs 에서 실제 네이버 응답 형태 확인용. 한 cron tick 당 1회만.
        if not debug_samples_logged and kws:
            sample = kws[0]
            logger.warning(
                f"[pool/inspect/DEBUG] ag={ag_id} sample_keys={list(sample.keys())[:20]} "
                f"review={sample.get('reviewStatus')!r} inspect={sample.get('inspectStatus')!r} "
                f"status={sample.get('status')!r} statusReason={sample.get('statusReason')!r}"
            )
            # 거부 후보 sample 5개 — review/inspect/statusReason 에 PENDING 외 값 가진 첫 5개
            cand_samples = []
            for k in kws[:50]:
                rv = (k.get("reviewStatus") or "")
                ip = (k.get("inspectStatus") or "")
                rs = (k.get("statusReason") or "")
                if rv or ip or rs:
                    cand_samples.append(
                        f"{k.get('keyword','')}={rv}/{ip}/{rs}"
                    )
                    if len(cand_samples) >= 5:
                        break
            if cand_samples:
                logger.warning(f"[pool/inspect/DEBUG] non-empty samples: {' || '.join(cand_samples)}")
            debug_samples_logged = True

        for kw in kws:
            kw_text = kw.get("keyword")
            if not kw_text:
                continue
            total_kws_checked += 1
            review = (kw.get("reviewStatus") or "").upper()
            inspect = (kw.get("inspectStatus") or "").upper()
            status = (kw.get("status") or "").upper()
            stat_reason = (kw.get("statusReason") or "").upper()
            user_lock = kw.get("userLock", False)

            # statusReason 의 영구 거부 코드는 PENDING 가드보다 먼저 잡는다.
            # 네이버 거부 statusReason 토큰 (확인된 값들):
            #   KEYWORD_DISAPPROVED, BUSINESS_PROHIBITED, REVIEW_NOT_PASSED, INSPECT_FAIL,
            #   BAD_BUSINESS, BLOCKLISTED, PROHIBITED.
            # NOT_PASSED / FAIL 추가 — 이전엔 누락되어 REVIEW_NOT_PASSED / INSPECT_FAIL KW 가
            # PENDING 가드에 막혀 영구 미삭제 (사용자 보고 사례).
            REASON_REJECT_TOKENS = (
                "DISAPPROVED", "REJECTED", "PROHIBITED", "BLOCKLISTED",
                "NOT_PASSED", "FAIL", "BAD_BUSINESS", "INELIGIBLE",
            )
            reason_rejected = any(t in stat_reason for t in REASON_REJECT_TOKENS)
            # inspectStatus 자체에 거부 토큰 있어도 PENDING 가드보다 먼저 잡는다.
            # 네이버는 inspectStatus="REVIEW_FAILED" + statusReason="" 케이스도 있음.
            INSPECT_REJECT_TOKENS = (
                "DISAPPROVED", "REJECTED", "PROHIBITED", "BLOCKLISTED",
                "NOT_PASSED", "FAIL", "DENIED", "BAD_BUSINESS",
            )
            inspect_rejected_early = any(t in inspect for t in INSPECT_REJECT_TOKENS)
            review_rejected_early = ("REJECT" in review) or ("DISAPPROVE" in review) or ("FAIL" in review) or ("NOT_PASSED" in review)
            if reason_rejected or inspect_rejected_early or review_rejected_early:
                rejected_items.append({
                    "keyword": kw_text,
                    "reason": f"review={review} inspect={inspect} status={status} reason={stat_reason} userLock={user_lock}",
                })
                kid = kw.get("nccKeywordId")
                if kid:
                    rejected_naver_ids.append((kid, kw_text))
                continue

            # ============ 하드 가드 — 검수 완료 전 절대 건드리지 않는다 ============
            # 신규 키워드는 Naver 검수 완료 전까지 review/inspect 가 WAIT/UNDER/PENDING 계열.
            # 이 단계에서 어떤 판정도 하면 안 됨 (대량 삭제 사고 영구 차단).
            # review 와 inspect 둘 중 하나라도 'pending' 으로 보이면 즉시 skip.
            PENDING_TOKENS = (
                "WAIT", "UNDER", "PENDING", "PROGRESS",
                "IN_REVIEW", "AUTO_INSPECT", "INSPECT_REQ",
                "PRE_REVIEW", "BEFORE_REVIEW",
            )
            review_pending = any(t in review for t in PENDING_TOKENS)
            inspect_pending = any(t in inspect for t in PENDING_TOKENS)
            # review/inspect 모두 비어있으면 정보 없음 → 안전 측면 미완료 취급
            no_info = (review == "" and inspect == "" and stat_reason == "")
            if review_pending or inspect_pending or no_info:
                continue
            # =============================================================

            # 검수 완료 가정 하에 영구 거부 신호만 잡는다.
            # 일시 상태(PAUSED/userLock/EXPIRED_BUDGET 등)는 트리거 안 됨.
            review_rejected = ("REJECT" in review) or ("DISAPPROVE" in review)
            inspect_rejected = inspect in (
                "PROHIBIT", "BUSINESS_PROHIBIT", "REVIEW_REJECTED",
                "REJECTED", "DISAPPROVED", "FAIL", "FAILED",
            )
            if review_rejected or inspect_rejected:
                rejected_items.append({
                    "keyword": kw_text,
                    "reason": f"review={review} inspect={inspect} status={status} reason={stat_reason} userLock={user_lock}",
                })
                kid = kw.get("nccKeywordId")
                if kid:
                    rejected_naver_ids.append((kid, kw_text))
        await asyncio.sleep(0.15)

    logger.warning(
        f"[pool/inspect] user={uid} cid={customer_id} ag_groups={len(ad_group_ids)} "
        f"kws_checked={total_kws_checked} rejected_found={len(rejected_items)}"
    )
    if rejected_items:
        # 거부 KW 첫 5개 sample logging — 어떤 토큰이 매치됐는지 검증용
        sample_reasons = [f"{it['keyword']}:{it['reason'][:80]}" for it in rejected_items[:5]]
        logger.warning(f"[pool/inspect] rejected samples: {' | '.join(sample_reasons)}")
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


async def _run_pool_inspect_only(uid: int, customer_id: int) -> None:
    """노출제한 검사 단독 실행 — register 의 pending=0 early return 으로 inspect 가
    영구 미실행되는 누수 차단. 매 cron tick 마다 register 와 독립적으로 호출.
    cascade drift 정리 후 / collect circuit OPEN 광고주에서도 노출제한 자동 삭제 보장.
    """
    from services.naver_ad_service import NaverAdApiClient, _naver_api_breaker
    from database.naver_ad_db import get_ad_account_by_customer
    import sqlite3 as _sqlite3
    pool = get_keyword_pool_db()
    reg = get_registered_keywords_db()

    if _naver_api_breaker.is_open():
        # circuit OPEN 인 동안은 inspect 도 skip — 다음 tick 에 재시도
        pool.record_run(uid, customer_id, "inspect", "no_new",
                        error_message="circuit OPEN — inspect skip, 다음 tick 재시도")
        return

    account = get_ad_account_by_customer(uid, str(customer_id))
    if not account or not account.get("is_connected"):
        return  # 비연결 광고주 — record 도 노이즈 방지로 안 함

    with _sqlite3.connect(reg.db_path) as _conn:
        ag_ids = [r[0] for r in _conn.execute(
            "SELECT DISTINCT ad_group_id FROM registered_keywords "
            "WHERE account_customer_id=? AND ad_group_id IS NOT NULL",
            (customer_id,),
        ).fetchall()]
    if not ag_ids:
        return  # 등록 KW 없음 — inspect 대상 없음 (record 노이즈 방지)

    client = NaverAdApiClient()
    client.customer_id = account["customer_id"]
    client.api_key = account["api_key"]
    client.secret_key = account["secret_key"]
    await _inspect_ad_groups(uid, customer_id, client, ag_ids, delete_from_naver=True)


async def _run_pool_ai_seed_topup(uid: int, customer_id: int) -> Dict[str, Any]:
    """collect 가 마른 우물 (added < N) 일 때 LLM 으로 새 시드 자동 주입.

    - saved relevance_keywords (없으면 user_seed Top80) 를 base 로 GPT-4o-mini 호출
    - 도메인 토큰셋 1차 필터 → keywordstool 5개 배치 검증 → user_seed 로 INSERT
    - 24시간 내 6회 cap (OpenAI cost 보호) + cooldown 25분
    - record_run(kind='ai_topup') 으로 frontend 표시
    """
    import json as _json
    from config import settings as _settings
    from database.naver_ad_db import (
        get_ad_account_by_customer,
        get_ad_account_relevance_keywords,
    )
    import time as _time
    import sqlite3 as _sqlite3

    pool = get_keyword_pool_db()
    t0 = _time.monotonic()

    # OpenAI 키 / 광고주 / 도메인 의도 확인
    if not getattr(_settings, "OPENAI_API_KEY", ""):
        logger.warning(f"[pool/ai-topup] uid={uid} cid={customer_id} OPENAI_API_KEY 미설정 — skip")
        return {"skipped": "no_openai_key"}
    account = get_ad_account_by_customer(uid, str(customer_id))
    if not account or not account.get("is_connected"):
        return {"skipped": "no_account"}
    saved = get_ad_account_relevance_keywords(uid, str(customer_id)) or []
    if len(saved) < 3:
        # 폴백 — user_seed 풀 Top 60 (오염 가능하므로 saved_relevance 가 진짜 의도).
        seeds_fb = pool.list_user_seeds(customer_id) or []
        if len(seeds_fb) < 3:
            return {"skipped": "insufficient_base_seeds"}
        base = seeds_fb[:60]
        basis = "user_seed_fallback"
    else:
        base = saved
        basis = "saved_relevance"

    # cooldown / daily cap — naverad_pool_runs 직접 조회 (전용 메서드 추가 회피).
    AI_TOPUP_COOLDOWN_S = 25 * 60
    AI_TOPUP_DAILY_CAP = 6
    try:
        with _sqlite3.connect(pool.db_path) as conn:
            row = conn.execute(
                """SELECT started_at, COUNT(*) FROM naverad_pool_runs
                   WHERE account_customer_id=? AND kind='ai_topup'
                     AND started_at > datetime('now','-24 hours')""",
                (customer_id,),
            ).fetchone()
            recent_cnt = int(row[1] or 0) if row else 0
            last_started = row[0] if row else None
            if recent_cnt >= AI_TOPUP_DAILY_CAP:
                logger.warning(f"[pool/ai-topup] uid={uid} cid={customer_id} 24h cap {AI_TOPUP_DAILY_CAP} 도달 — skip")
                return {"skipped": "daily_cap", "recent_24h": recent_cnt}
            if last_started:
                last_row = conn.execute(
                    """SELECT (julianday('now') - julianday(started_at)) * 86400 AS sec_ago
                       FROM naverad_pool_runs
                       WHERE account_customer_id=? AND kind='ai_topup'
                       ORDER BY id DESC LIMIT 1""",
                    (customer_id,),
                ).fetchone()
                sec_ago = float(last_row[0]) if last_row and last_row[0] else 999999
                if sec_ago < AI_TOPUP_COOLDOWN_S:
                    return {"skipped": "cooldown", "sec_ago": int(sec_ago)}
    except Exception as e:
        logger.warning(f"[pool/ai-topup] cooldown 조회 실패 (계속): {e}")

    # 도메인 토큰셋 — base seeds 만 (풀 오염 무시)
    domain_tokens = _build_domain_token_set(base) | _build_seed_atoms(base)
    def _matches_domain(kw: str) -> bool:
        k = (kw or "").replace(" ", "")
        if len(k) < 2:
            return False
        return any(t in k for t in domain_tokens)

    # 1) LLM 호출 — 80개 후보 생성
    prompt_seeds = ", ".join(base[:60])
    prompt = (
        f"다음 한국어 키워드들과 동일 도메인의 검색 가능성 있는 한국어 키워드를 정확히 80개 생성해줘.\n\n"
        f"입력 키워드:\n{prompt_seeds}\n\n"
        f"규칙:\n- 입력 키워드와 동일 분야 안에서만 (예: 의료면 의료)\n"
        f"- 다른 도메인 단어 절대 금지\n- 띄어쓰기 가능\n- 한 줄당 1개\n- JSON array"
    )
    candidates: List[str] = []
    try:
        async with httpx.AsyncClient(timeout=60.0) as oai:
            resp = await oai.post(
                "https://api.openai.com/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {_settings.OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "system", "content": "한국어 검색광고 키워드 전문가. 도메인 일관성 절대 위반 금지. JSON array 만 반환."},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.7,
                    "max_tokens": 3000,
                },
            )
            resp.raise_for_status()
            content = resp.json()["choices"][0]["message"]["content"]
        cb = re.search(r"```(?:json)?\s*(.*?)\s*```", content, re.DOTALL)
        if cb:
            content = cb.group(1)
        gen = _json.loads(content.strip())
        if isinstance(gen, list):
            seen = set()
            for k in gen:
                if isinstance(k, str):
                    kw = k.strip()
                    if kw and len(kw) >= 2 and kw not in seen:
                        seen.add(kw)
                        candidates.append(kw)
    except Exception as e:
        pool.record_run(uid, customer_id, "ai_topup", "failed",
                        error_message=f"LLM 실패: {type(e).__name__}: {str(e)[:200]}",
                        duration_ms=int((_time.monotonic()-t0)*1000))
        logger.warning(f"[pool/ai-topup] LLM 실패 uid={uid} cid={customer_id}: {e}")
        return {"skipped": "llm_failed", "error": str(e)[:200]}

    # 2) 도메인 1차 필터 + 도메인 토큰셋 보강
    domain_pass = [k for k in candidates if _matches_domain(k)]
    domain_fail = len(candidates) - len(domain_pass)
    # LLM 후보 atom 을 도메인 토큰에 합류 — keywordstool 응답 검증 시 broader 매칭 보장.
    # Why: LLM 이 "콜린성/박탈성/카포시" 같은 보강 도메인어 만들어도 그 atom 없으면
    #      응답 KW 가 도메인 게이트 reject. atom 합류 → broader 통과.
    if domain_pass:
        domain_tokens = domain_tokens | _build_seed_atoms(domain_pass)

    # 3) keywordstool 배치 — hint 는 base (saved_relevance) 일반어 사용.
    # Why: LLM 후보가 niche 의학 용어 (카포시육종/유암종증후군/포피염 등) 면 keywordstool
    #      응답이 빈 list (Naver index 에 데이터 없음) → 검증 0. 일반어 hint 면 1000+ KW
    #      반환 → 도메인+검색량 통과한 KW 풍부. LLM 의 역할은 도메인 토큰셋 확장 (위).
    hint_source = list(base)  # saved_relevance 또는 user_seed Top60
    from services.naver_ad_service import NaverAdApiClient
    client = NaverAdApiClient()
    client.customer_id = account["customer_id"]
    client.api_key = account["api_key"]
    client.secret_key = account["secret_key"]

    validated: List[Dict] = []
    seen_validated: Set[str] = set()
    MIN_VOL = 5
    MAX_INSERT = 200  # 한 ai_topup 호출당 최대 user_seed INSERT 수
    for i in range(0, len(hint_source), 5):
        if len(validated) >= MAX_INSERT:
            break
        chunk = hint_source[i:i + 5]
        # 빈 / 짧은 hint 제외 — Naver keywordstool 거부 패턴
        chunk = [s.replace(" ", "").strip() for s in chunk if s and len(s.strip()) >= 2]
        if not chunk:
            continue
        hint_str = ",".join(chunk)
        try:
            related = await client.get_related_keywords(hint_str, show_detail=True)
        except Exception as e:
            logger.warning(f"[pool/ai-topup] keywordstool 실패 {chunk}: {e}")
            continue
        items = related.get("keywordList", []) if isinstance(related, dict) else []
        for it in items:
            kw = (it.get("relKeyword") or "").strip()
            if not kw or kw in seen_validated:
                continue
            pc = _parse_naver_count(it.get("monthlyPcQcCnt"))
            mob = _parse_naver_count(it.get("monthlyMobileQcCnt"))
            mt = pc + mob
            if mt < MIN_VOL:
                continue
            # 응답 KW 도 도메인 게이트 통과해야 함 (LLM 이 trigger 했어도 Naver 가 cross-
            # domain 연관 키워드 끼워 반환할 수 있음).
            if not _matches_domain(kw):
                continue
            seen_validated.add(kw)
            validated.append({
                "keyword": kw,
                "monthly_total": mt,
                "monthly_pc": pc,
                "monthly_mobile": mob,
                "comp_idx": it.get("compIdx"),
                "seed": "ai_topup",
                "source": "user_seed",  # collect 가 다음 라운드에 자동 사용
            })
        await asyncio.sleep(0.3)

    # 4) user_seed 로 INSERT
    seed_items = [{**v, "source": "user_seed"} for v in validated]
    added = pool.add_candidates(uid, customer_id, seed_items)

    duration_ms = int((_time.monotonic() - t0) * 1000)
    pool.record_run(
        uid, customer_id, "ai_topup",
        "success" if added > 0 else "no_new",
        added=added, seeds_count=len(base),
        error_message=(
            f"AI 시드 확장 ({basis}) — LLM {len(candidates)} → 도메인 {len(domain_pass)} "
            f"(컷 {domain_fail}) → 검증≥{MIN_VOL} {len(validated)} → INSERT {added}"
        ),
        duration_ms=duration_ms,
    )
    logger.warning(
        f"[pool/ai-topup] uid={uid} cid={customer_id} basis={basis} base={len(base)} "
        f"LLM={len(candidates)} domain={len(domain_pass)} validated={len(validated)} added={added} ({duration_ms}ms)"
    )
    return {"added": added, "llm": len(candidates), "validated": len(validated), "duration_ms": duration_ms}


async def _run_pool_workers_for_accounts(pairs: List[Tuple[int, int]]):
    """B 시나리오 — (user_id, customer_id) 페어별로 collect+register+inspect.
    한 사용자 여러 광고주를 가진 경우 광고주마다 독립적으로 워커 실행.
    inspect 는 register 와 분리 실행 — register 의 pending=0 early return 누수 차단."""
    pool = get_keyword_pool_db()
    AI_TOPUP_TRIGGER_THRESHOLD = 10  # 직전 collect added < N 이면 AI 시드 확장 트리거
    for uid, cid in pairs:
        try:
            await _run_pool_collect(uid, customer_id=cid)
        except Exception as e:
            logger.error(f"[pool/run] collect 실패 user={uid} cid={cid}: {e}", exc_info=True)
            try:
                pool.record_run(uid, cid, "collect", "failed",
                                error_message=f"{type(e).__name__}: {str(e)[:300]}")
            except Exception:
                pass

        # AI 시드 자동 확장 — 직전 collect 가 마른 우물이면 LLM 으로 새 시드 주입.
        # cooldown / daily cap 은 _run_pool_ai_seed_topup 내부에서 관리.
        try:
            recent = pool.recent_runs(cid, limit=3) or []
            last_collect = next((r for r in recent if r.get("kind") == "collect"), None)
            last_added = int(last_collect.get("added") or 0) if last_collect else 0
            if last_added < AI_TOPUP_TRIGGER_THRESHOLD:
                logger.warning(
                    f"[pool/run] uid={uid} cid={cid} 마른 우물 (last collect added={last_added}) → AI top-up 트리거"
                )
                await _run_pool_ai_seed_topup(uid, cid)
        except Exception as e:
            logger.error(f"[pool/run] ai-topup 실패 user={uid} cid={cid}: {e}", exc_info=True)

        try:
            await _run_pool_register(uid, customer_id=cid)
        except Exception as e:
            logger.error(f"[pool/run] register 실패 user={uid} cid={cid}: {e}", exc_info=True)
            try:
                pool.record_run(uid, cid, "register", "failed",
                                error_message=f"{type(e).__name__}: {str(e)[:300]}")
            except Exception:
                pass
        # inspect 단독 실행 — register 의 early return 경로 (pending=0 / orchestrator 실패)
        # 와 무관하게 매 tick 마다 노출제한 검사 보장.
        try:
            await _run_pool_inspect_only(uid, cid)
        except Exception as e:
            logger.error(f"[pool/run] inspect 실패 user={uid} cid={cid}: {e}", exc_info=True)
            try:
                pool.record_run(uid, cid, "inspect", "failed",
                                error_message=f"{type(e).__name__}: {str(e)[:300]}")
            except Exception:
                pass


# 호환 wrapper — user_id 만 받는 옛 호출자 (외부 cron 등) 위해 유지.
async def _run_pool_workers_for_users(user_ids: List[int]):
    """Deprecated — 가장 최근 광고주만 처리. _run_pool_workers_for_accounts 사용 권장."""
    from database.naver_ad_db import list_ad_accounts_for_user
    pairs: List[Tuple[int, int]] = []
    for uid in user_ids:
        try:
            accounts = list_ad_accounts_for_user(uid) or []
            for a in accounts:
                if a.get("is_connected"):
                    pairs.append((uid, int(a["customer_id"])))
        except Exception as e:
            logger.error(f"[pool/run] list_ad_accounts_for_user 실패 user={uid}: {e}")
    await _run_pool_workers_for_accounts(pairs)


@router.post("/keyword-pool/ai-cleanup-registered")
async def keyword_pool_ai_cleanup_registered(
    user_id: int = Depends(get_user_id_with_fallback),
    customer_id: Optional[str] = Query(None),
    dry_run: bool = Query(True, description="True 면 GPT 분류만, False 면 실제 DELETE"),
    batch_size: int = Query(200),
    max_kws: int = Query(1000),
    incremental_minutes: Optional[int] = Query(None),
):
    """등록 KW AI 의미 분류 cleanup — 점수 인플레 우회.

    GPT-4o-mini 가 user_seed 와 등록 KW 를 도메인 비교 → 무관 KW 만 실제 네이버 DELETE.
    """
    if not customer_id:
        raise HTTPException(status_code=400, detail="customer_id 필요")
    try:
        cid = int(customer_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="customer_id 정수 필요")
    return await _run_pool_ai_cleanup_registered(
        user_id, cid,
        dry_run=dry_run, batch_size=batch_size,
        max_kws=max_kws, incremental_minutes=incremental_minutes,
    )


@router.get("/keyword-pool/diagnostics/accounts-list")
async def keyword_pool_diagnostics_accounts_list():
    """진단 — 모든 활성 광고주 + user_seed 샘플 (인증 없음).

    한의원 광고주 customer_id 식별용. cid 자체는 민감 정보 아님 (네이버 광고
    조회 가능). user_seed 샘플 5개로 도메인 식별 가능.
    """
    from database.naver_ad_db import list_connected_ad_accounts
    pool = get_keyword_pool_db()
    accts = list_connected_ad_accounts() or []
    out = []
    for a in accts:
        cid = int(a.get("customer_id") or 0)
        uid = int(a.get("user_id") or 0)
        if not cid:
            continue
        try:
            seeds = pool.list_user_seeds(cid)
        except Exception:
            seeds = []
        try:
            stats = pool.stats(cid) or {}
            by_status = stats.get("by_status") or {}
        except Exception:
            by_status = {}
        out.append({
            "user_id": uid,
            "customer_id": cid,
            "user_seed_count": len(seeds),
            "user_seed_samples": seeds[:8],
            "pool_by_status": by_status,
        })
    return {"success": True, "count": len(out), "accounts": out}


@router.get("/keyword-pool/diagnostics/recent-registered")
async def keyword_pool_diagnostics_recent_registered(
    customer_id: int = Query(..., description="광고주 customer_id"),
    limit: int = Query(100, ge=1, le=500),
    order: str = Query("recent", regex="^(recent|mt_asc|mt_desc)$"),
):
    """진단 — 등록 KW 최근/하위/상위 N개 리스트 (인증 없음).

    도메인 적합성 audit 용. naverad_keyword_pool 의 status='registered' 행만.
    seed attribution + monthly_total 포함 → 어떤 시드로부터 발굴됐는지 추적 가능.

    order:
      - recent: registered_at DESC (디폴트, 최근 등록 순)
      - mt_asc: monthly_total ASC (rolling_heal 대상 후보 확인)
      - mt_desc: monthly_total DESC (상위 KW 분포 확인)
    """
    import sqlite3 as _sqlite3
    pool = get_keyword_pool_db()

    order_sql = {
        "recent": "COALESCE(registered_at, discovered_at) DESC, id DESC",
        "mt_asc": "COALESCE(monthly_total, 0) ASC, registered_at ASC",
        "mt_desc": "COALESCE(monthly_total, 0) DESC, registered_at DESC",
    }[order]

    with _sqlite3.connect(pool.db_path) as conn:
        conn.row_factory = _sqlite3.Row
        rows = conn.execute(
            f"""SELECT keyword, seed, monthly_total, monthly_pc, monthly_mobile,
                       source, registered_at, discovered_at
                FROM naverad_keyword_pool
                WHERE account_customer_id = ?
                  AND status = 'registered'
                ORDER BY {order_sql}
                LIMIT ?""",
            (customer_id, limit),
        ).fetchall()

    items = [dict(r) for r in rows]
    # mt 분포 요약 (도메인 적합성 빠른 확인용)
    bucket = {"mt_0": 0, "mt_1_9": 0, "mt_10_99": 0, "mt_100_999": 0, "mt_1000_plus": 0}
    for r in items:
        mt = int(r.get("monthly_total") or 0)
        if mt <= 0: bucket["mt_0"] += 1
        elif mt < 10: bucket["mt_1_9"] += 1
        elif mt < 100: bucket["mt_10_99"] += 1
        elif mt < 1000: bucket["mt_100_999"] += 1
        else: bucket["mt_1000_plus"] += 1

    return {
        "success": True,
        "customer_id": customer_id,
        "order": order,
        "count": len(items),
        "mt_distribution": bucket,
        "items": items,
    }


@router.get("/keyword-pool/diagnostics/seed-audit")
async def keyword_pool_diagnostics_seed_audit(
    customer_id: int = Query(..., description="광고주 customer_id"),
    relevance_keywords: Optional[str] = Query(
        None,
        description="콤마구분 도메인 KW. 비우면 saved relevance_keywords 사용",
    ),
    score_threshold: int = Query(30, ge=0, le=95),
):
    """진단 — user_seed 풀의 도메인 점수 분포 (인증 없음).

    drift 근본 원인 추적: 오염된 user_seed (예: "2024쏘나타") 가 amplify cartesian
    폭발 → drift 100k. 이 endpoint 로 어떤 시드들이 score ≤ threshold 인지 식별 →
    purge-drift endpoint 로 일괄 정리.

    반환:
      score_distribution: {0: N, 10: N, ..., 100: N} 점수 구간별 시드 수
      contaminated_samples: score ≤ threshold 시드 30개 샘플 (정리 대상)
      clean_samples: score > threshold 시드 30개 샘플 (보존 대상)
    """
    from database.naver_ad_db import list_connected_ad_accounts, get_ad_account_relevance_keywords
    accts = list_connected_ad_accounts() or []
    matched = next((a for a in accts if int(a.get("customer_id") or 0) == int(customer_id)), None)
    if not matched:
        raise HTTPException(status_code=404, detail=f"customer_id {customer_id} 미연결")
    uid = int(matched.get("user_id") or 0)

    if relevance_keywords:
        score_basis = [s.strip() for s in relevance_keywords.replace("\n", ",").split(",") if s.strip() and len(s.strip()) >= 2]
        basis_source = "query"
    else:
        saved = get_ad_account_relevance_keywords(uid, str(customer_id)) or []
        if not saved:
            return {
                "success": False,
                "reason": "no_relevance",
                "message": "saved relevance_keywords 비어있음. ?relevance_keywords=... 명시 또는 화면에서 도메인 KW 저장 필요.",
            }
        score_basis = saved
        basis_source = "saved"

    pool = get_keyword_pool_db()
    user_seeds = pool.list_user_seeds(customer_id) or []

    # 점수 매김
    dist: Dict[int, int] = {}
    contaminated: List[Tuple[str, int]] = []
    clean: List[Tuple[str, int]] = []
    for s in user_seeds:
        sc = _compute_relevance_score(s, score_basis)
        bucket = (sc // 10) * 10
        dist[bucket] = dist.get(bucket, 0) + 1
        if sc < score_threshold:  # Option B: boundary 보존 — score == threshold 는 clean
            contaminated.append((s, sc))
        else:
            clean.append((s, sc))

    contaminated.sort(key=lambda x: x[1])  # 점수 낮은 것부터 (확실히 drift)
    clean.sort(key=lambda x: -x[1])  # 점수 높은 것부터 (확실히 도메인)

    return {
        "success": True,
        "customer_id": customer_id,
        "basis_source": basis_source,
        "basis_count": len(score_basis),
        "basis_sample": score_basis[:8],
        "user_seed_total": len(user_seeds),
        "score_threshold": score_threshold,
        "contaminated_count": len(contaminated),
        "clean_count": len(clean),
        "score_distribution": dict(sorted(dist.items())),
        "contaminated_samples": [{"seed": s, "score": sc} for s, sc in contaminated[:30]],
        "clean_samples": [{"seed": s, "score": sc} for s, sc in clean[:30]],
    }


@router.get("/keyword-pool/diagnostics/ai-cleanup-preview")
async def keyword_pool_diagnostics_ai_cleanup_preview(
    customer_id: int = Query(..., description="audit 대상 광고주 customer_id"),
    max_kws: int = Query(200),
):
    """진단 dry-run — customer_id 명시 (인증 없음). 등록 KW GPT 분류 미리보기.

    /diagnostics/accounts-list 로 cid 확인 → 이 endpoint 로 광고주별 audit.
    """
    from database.naver_ad_db import list_connected_ad_accounts
    accts = list_connected_ad_accounts() or []
    matched = next(
        (a for a in accts if int(a.get("customer_id") or 0) == int(customer_id)),
        None,
    )
    if not matched:
        return {"success": False, "reason": "customer_id_not_in_accounts"}
    uid = int(matched.get("user_id") or 0)
    cid = int(matched.get("customer_id") or 0)
    res = await _run_pool_ai_cleanup_registered(
        uid, cid, dry_run=True, max_kws=max_kws,
    )
    res["debug_meta"] = {"audited_uid": uid, "audited_cid": cid}
    return res


@router.get("/keyword-pool/diagnostics/ai-cleanup-preview-first")
async def keyword_pool_ai_cleanup_preview_first(
    max_kws: int = Query(200),
):
    """진단 dry-run — 인증 없음. 첫 활성 광고주의 등록 KW 를 GPT 분류 미리보기.

    실제 DELETE 안 함. 시스템 내부 상태 진단용 (실측 보고).
    """
    from database.naver_ad_db import list_connected_ad_accounts
    accts = list_connected_ad_accounts() or []
    if not accts:
        return {"success": False, "reason": "no_accounts"}
    a = accts[0]
    uid = int(a.get("user_id") or 0)
    cid = int(a.get("customer_id") or 0)
    if not uid or not cid:
        return {"success": False, "reason": "invalid_account"}
    res = await _run_pool_ai_cleanup_registered(
        uid, cid, dry_run=True, max_kws=max_kws,
    )
    res["debug_meta"] = {"audited_uid": uid, "audited_cid": cid}
    return res


@router.get("/keyword-pool/diagnostics/scheduler-jobs")
def keyword_pool_scheduler_diagnostics():
    """APScheduler 등록 cron + 다음 실행 시각 — cron 살아있는지 즉시 확인. sync def."""
    try:
        from services.keyword_pool_scheduler import keyword_pool_scheduler
    except Exception as e:
        return {"success": False, "error": f"scheduler import 실패: {e}"}
    sched = keyword_pool_scheduler.scheduler
    if not keyword_pool_scheduler._running:
        # 2-프로세스 분리 — 스케줄러는 worker 프로세스(:8001)에만 산다. API 프로세스는
        # _running=False 이므로 worker 의 동일 엔드포인트로 프록시해 실제 상태를 보여준다.
        try:
            import httpx as _httpx
            r = _httpx.get(
                "http://127.0.0.1:8001/api/naver-ad/keyword-pool/diagnostics/scheduler-jobs",
                timeout=5.0,
            )
            if r.status_code == 200:
                data = r.json()
                data["via"] = "worker"
                return data
        except Exception:
            pass
        # 프록시 실패 (worker 가 무거운 cron 으로 바빠 :8001 응답 지연) — DB 최근 실행
        # 기록으로 판단. cross-process 안정 (worker API 응답성에 의존 안 함).
        try:
            import sqlite3 as _sq
            pool = get_keyword_pool_db()
            with _sq.connect(pool.db_path) as _c:
                row = _c.execute("SELECT MAX(started_at) FROM naverad_pool_runs").fetchone()
            last = row[0] if row else None
            if last:
                age_min = (datetime.utcnow() - datetime.fromisoformat(str(last))).total_seconds() / 60.0
                if age_min < 15:
                    return {
                        "success": True, "running": True, "jobs": [],
                        "via": "db_recency",
                        "message": f"스케줄러 정상 (worker, 최근 실행 {age_min:.0f}분 전)",
                        "now": datetime.now().isoformat(timespec="seconds"),
                    }
        except Exception:
            pass
        return {"success": False, "running": False, "message": "scheduler not running"}
    jobs_info = []
    for job in sched.get_jobs():
        jobs_info.append({
            "id": job.id,
            "name": job.name,
            "next_run_time": str(job.next_run_time) if job.next_run_time else None,
            "trigger": str(job.trigger),
        })
    return {
        "success": True,
        "running": True,
        "jobs": jobs_info,
        "now": datetime.now().isoformat(timespec="seconds"),
    }


@router.get("/keyword-pool/diagnostics/cleanup-audit")
async def keyword_pool_cleanup_audit(
    user_id: int = Depends(get_user_id_with_fallback),
    customer_id: Optional[str] = Query(None),
    sample_ad_groups: int = Query(3, description="네이버 실측용 샘플 광고그룹 수 (1~10)"),
):
    """cleanup cron 동작 진단 + 네이버 광고 콘솔 실측 비교.

    반환:
      cron_summary: 종류별 (inspect/click_cleanup/domain_cleanup/auto-cleanup) 마지막 실행 시각, 결과
      naver_audit: 광고그룹 N개 샘플의 키워드 status 조회 → 검수 거부됐는데
                   여전히 콘솔에 살아있는 KW (= cleanup 누수) 카운트
    """
    if not customer_id:
        raise HTTPException(status_code=400, detail="customer_id 필요")
    try:
        cid = int(customer_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="customer_id 정수 필요")
    sample_n = max(1, min(int(sample_ad_groups), 10))

    pool = get_keyword_pool_db()
    runs = pool.recent_runs(cid, limit=200)

    # cron 종류별 마지막 + 최근 24개 합산
    from collections import defaultdict
    by_kind: Dict[str, List[Dict]] = defaultdict(list)
    for r in runs:
        kind = r.get("kind") or ""
        by_kind[kind].append(r)

    summary: Dict[str, Dict[str, Any]] = {}
    for kind, rs in by_kind.items():
        last = rs[0] if rs else {}
        recent = rs[:24]
        summary[kind] = {
            "last_run_at": last.get("started_at"),
            "last_status": last.get("status"),
            "last_added": last.get("added"),
            "last_skipped": last.get("skipped"),
            "last_message": (last.get("error_message") or "")[:200],
            "runs_count_recent": len(recent),
            "total_added_recent": sum(int(r.get("added") or 0) for r in recent),
            "total_skipped_recent": sum(int(r.get("skipped") or 0) for r in recent),
        }

    # 네이버 광고 콘솔 실측 — 광고그룹 N개 샘플의 키워드 검수 상태 조회
    naver_audit: Dict[str, Any] = {
        "sample_ad_groups": [],
        "total_kws_checked": 0,
        "stale_rejected_count": 0,
        "stale_rejected_samples": [],
    }
    try:
        from database.naver_ad_db import get_ad_account_by_customer
        from database.registered_keywords_db import get_registered_keywords_db
        from services.naver_ad_service import NaverAdApiClient
        import sqlite3

        account = get_ad_account_by_customer(user_id, str(cid))
        if not account or not account.get("is_connected"):
            naver_audit["error"] = "광고주 미연결"
        else:
            client = NaverAdApiClient()
            client.customer_id = account["customer_id"]
            client.api_key = account["api_key"]
            client.secret_key = account["secret_key"]

            reg = get_registered_keywords_db()
            with sqlite3.connect(reg.db_path) as conn:
                ag_ids = [r[0] for r in conn.execute(
                    "SELECT DISTINCT ad_group_id FROM registered_keywords "
                    "WHERE account_customer_id=? AND ad_group_id IS NOT NULL "
                    "ORDER BY id DESC LIMIT ?",
                    (cid, sample_n),
                ).fetchall()]

            REJECT_TOKENS = (
                "DISAPPROVED", "REJECTED", "PROHIBITED", "BLOCKLISTED",
                "NOT_PASSED", "FAIL", "BAD_BUSINESS", "INELIGIBLE", "DENIED",
            )
            for ag_id in ag_ids:
                try:
                    kws = await client.get_keywords(ad_group_id=ag_id) or []
                except Exception as e:
                    naver_audit["sample_ad_groups"].append({
                        "ad_group_id": ag_id,
                        "error": f"{type(e).__name__}: {str(e)[:120]}",
                    })
                    continue

                stale: List[Dict] = []
                for kw in kws:
                    review = (kw.get("reviewStatus") or "").upper()
                    inspect = (kw.get("inspectStatus") or "").upper()
                    stat_reason = (kw.get("statusReason") or "").upper()
                    is_rejected = (
                        any(t in review for t in REJECT_TOKENS)
                        or any(t in inspect for t in REJECT_TOKENS)
                        or any(t in stat_reason for t in REJECT_TOKENS)
                    )
                    if is_rejected:
                        stale.append({
                            "keyword": kw.get("keyword"),
                            "review": review,
                            "inspect": inspect,
                            "reason": stat_reason,
                        })

                naver_audit["sample_ad_groups"].append({
                    "ad_group_id": ag_id,
                    "total_kws": len(kws),
                    "stale_rejected": len(stale),
                })
                naver_audit["total_kws_checked"] += len(kws)
                naver_audit["stale_rejected_count"] += len(stale)
                # 전체 sample 누적 (앞에서 5개만 노출)
                if len(naver_audit["stale_rejected_samples"]) < 5:
                    naver_audit["stale_rejected_samples"].extend(
                        stale[: 5 - len(naver_audit["stale_rejected_samples"])]
                    )
    except Exception as e:
        naver_audit["error"] = f"{type(e).__name__}: {str(e)[:200]}"

    return {
        "success": True,
        "now": datetime.now().isoformat(timespec="seconds"),
        "customer_id": cid,
        "cron_summary": summary,
        "naver_audit": naver_audit,
        "interpretation": {
            "stale_rejected_OK": (
                "stale_rejected_count == 0 이면 inspect cron 이 검수 거부 KW 를 "
                "잘 청소하는 중. > 0 이면 누수 — fly logs 확인 필요."
            ),
            "domain_cleanup_OK": (
                "cron_summary['inspect'].last_run_at 가 30분 이내 + "
                "cron_summary 의 click cleanup / 도메인 cleanup 마지막 시각 "
                "각각 15분 / 1시간 이내면 정상."
            ),
        },
    }


@router.post("/keyword-pool/ai-classify-rejects")
async def keyword_pool_ai_classify_rejects(
    user_id: int = Depends(get_user_id_with_fallback),
    customer_id: Optional[str] = Query(None),
    force: bool = Query(False, description="True 면 30분 쿨다운 무시"),
):
    """AI reject 분류 1회 수동 발동 — reject 풀에서 시드 도메인 일치 KW 만 user_seed 로 promote.

    - 시드 1+ 광고주만 동작 (cold_start 광고주는 skip)
    - GPT-4o-mini 호출, 후보 200개당 약 5~8초
    - 30분 쿨다운 (force=True 시 무시)
    """
    if not customer_id:
        raise HTTPException(status_code=400, detail="customer_id 필요")
    try:
        cid = int(customer_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="customer_id 정수 필요")

    result = await _run_pool_ai_classify(user_id, cid, force=force)
    return {
        "success": result.get("success", False),
        **result,
    }


@router.get("/keyword-pool/reject-stats")
def keyword_pool_reject_stats(
    user_id: int = Depends(get_user_id_with_fallback),
    customer_id: Optional[str] = Query(None),
):
    """reject 풀 상태 — UI 분류 버튼 옆 카운터 표시용. sync def → threadpool."""
    if not customer_id:
        raise HTTPException(status_code=400, detail="customer_id 필요")
    try:
        cid = int(customer_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="customer_id 정수 필요")

    pool = get_keyword_pool_db()
    stats = pool.reject_stats(cid) or {}
    cooldown_iso = pool.get_classify_cooldown(cid)
    cooldown_remaining_min = 0
    if cooldown_iso:
        try:
            from datetime import datetime, timedelta
            last_dt = datetime.fromisoformat(str(cooldown_iso).replace("T", " ").split(".")[0])
            elapsed = datetime.utcnow() - last_dt
            if elapsed < timedelta(minutes=30):
                cooldown_remaining_min = max(1, 30 - int(elapsed.total_seconds() / 60))
        except Exception:
            pass
    return {
        "success": True,
        "pending": int(stats.get("pending", 0)),
        "promoted": int(stats.get("promoted", 0)),
        "discarded": int(stats.get("discarded", 0)),
        "cooldown_remaining_min": cooldown_remaining_min,
        "last_run_at": cooldown_iso,
    }


@router.post("/keyword-pool/trigger-now")
async def keyword_pool_trigger_now(
    background_tasks: BackgroundTasks,
    user_id: int = Depends(get_user_id_with_fallback),
    customer_id: Optional[str] = Query(None),
):
    """사용자 트리거 — cron 다음 tick 안 기다리고 본인 광고주의 collect+register 즉시 실행.
    시드 저장 직후 / 새 광고주 초기 발굴 등에서 "5분 후" 대기 없이 즉시 시작.
    Bearer 인증 불필요 (본인 광고주만 처리).
    """
    from database.naver_ad_db import list_ad_accounts_for_user
    pairs: List[Tuple[int, int]] = []
    if customer_id:
        try:
            pairs = [(user_id, int(customer_id))]
        except ValueError:
            raise HTTPException(status_code=400, detail="customer_id 정수 필요")
    else:
        accounts = list_ad_accounts_for_user(user_id) or []
        pairs = [(user_id, int(a["customer_id"])) for a in accounts if a.get("is_connected")]

    if not pairs:
        return {"success": True, "queued": 0, "message": "활성 광고 계정 없음"}

    background_tasks.add_task(_run_pool_workers_for_accounts, pairs)
    return {
        "success": True,
        "queued": len(pairs),
        "message": f"{len(pairs)}개 광고주 즉시 발굴 시작 — 1~3분 후 화면 갱신",
        "timestamp": datetime.now().isoformat(timespec="seconds"),
    }


@router.post("/keyword-pool/admin/run")
async def keyword_pool_admin_run(
    background_tasks: BackgroundTasks,
    authorization: Optional[str] = Header(None),
    user_id: Optional[int] = Query(None),
    customer_id: Optional[str] = Query(None),
):
    """자동 워커 — collect + register 통합 트리거 (Bearer 인증).
    - user_id 만: 그 사용자의 모든 활성 광고주 (B 시나리오)
    - user_id + customer_id: 그 광고주 단건만
    - 둘 다 없음: 모든 사용자 × 모든 활성 광고주
    """
    _verify_cron_token(authorization)

    pairs: List[Tuple[int, int]] = []
    try:
        from database.naver_ad_db import list_connected_ad_accounts, list_ad_accounts_for_user
        if user_id and customer_id:
            pairs = [(user_id, int(customer_id))]
        elif user_id:
            accounts = list_ad_accounts_for_user(user_id) or []
            pairs = [(user_id, int(a["customer_id"])) for a in accounts if a.get("is_connected")]
        else:
            rows = list_connected_ad_accounts() or []
            pairs = [(int(r["user_id"]), int(r["customer_id"])) for r in rows if r.get("user_id") and r.get("customer_id")]
    except Exception as e:
        logger.error(f"[pool/admin/run] 광고주 조회 실패: {type(e).__name__}: {e}", exc_info=True)
        pairs = []

    if not pairs:
        return {"success": True, "queued": 0, "message": "활성 광고 계정 없음"}

    background_tasks.add_task(_run_pool_workers_for_accounts, pairs)
    return {
        "success": True,
        "queued": len(pairs),
        "pairs": [{"user_id": uid, "customer_id": cid} for uid, cid in pairs],
        "timestamp": datetime.now().isoformat(timespec="seconds"),
    }


@router.get("/keyword-pool/accounts")
def keyword_pool_list_accounts(user_id: int = Depends(get_user_id_with_fallback)):
    """사용자의 모든 활성 광고주 list (B 시나리오 — 다중 광고주).

    sync def — 단순 sqlite read. async def 일 때 cron tick 이 event loop 점유 중이면
    30s timeout 발생 (frontend `광고주 목록 조회 실패` 사고). threadpool dispatch 로
    event loop 무관하게 응답.
    """
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
                "default_bid": int(r.get("default_bid") or 100),
            }
            for r in rows
        ],
    }


@router.get("/keyword-pool/stats")
def keyword_pool_stats(
    user_id: int = Depends(get_user_id_with_fallback),
    customer_id: Optional[str] = None,
    lite: bool = False,
):
    """본인 풀/등록 상태 — customer_id 명시 시 그 광고주.

    sync def — 모든 호출이 sqlite read (pool.stats/recent_runs/seed_breakdown 등).
    threadpool dispatch 로 cron 점유 event loop 와 격리.

    lite=true: 첫 페인트용 — pool.stats, reg.stats, recent_runs[:5] 만. seed_breakdown
    (시드 200+ 일 때 300ms+) / recent_keywords / deadlock 는 응답에서 제외 → 응답 시간
    1초 미만 보장. 풀 페이지가 useEffect 첫 호출에서 lite=true 쓰고, 그 다음 idle
    callback 에서 full 호출.
    """
    try:
        account = _resolve_account(user_id, customer_id)
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
            recent = pool.recent_runs(customer_id, limit=5 if lite else 20)
        except Exception as e:
            logger.error(f"keyword-pool/stats recent_runs 실패: {e}", exc_info=True)
            recent = []

        # lite 모드 — 무거운 쿼리 3종 skip. 응답 1초 미만 보장.
        if lite:
            return {
                "success": True,
                "customer_id": customer_id,
                "pool": pool_stats,
                "registered": reg_stats,
                "account_cap": 100_000,
                "recent_runs": recent,
                "seed_breakdown": [],
                "recent_keywords": [],
                "collect_deadlock": {"is_deadlock": False, "consecutive_zero_runs": 0, "total_rejected": 0},
                "lite": True,
                "now": datetime.now().isoformat(timespec="seconds"),
            }

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


class SeedExplodeRequest(BaseModel):
    seeds: List[str]
    min_volume: int = 100  # 월 총 검색량 최소치 — 등록 가치 있는 것만
    max_per_seed: int = 1000  # 시드당 최대 연관키워드 수
    min_score: int = 50  # 연관성 점수 최소치 — 자동삭제 크론(점수<50 삭제)과 일관
    customer_id: Optional[str] = None


async def _run_seed_explode(
    user_id: int, customer_id: int, account: Dict,
    seeds: List[str], min_volume: int, per_seed_cap: int, min_score: int = 50,
) -> None:
    """연관키워드 폭발 — 시드별 keywordstool 연관키워드 수집 → 검색량 + 연관성 점수 필터 →
    pending 직접 삽입.

    AI classify(LLM) 게이트는 안 거치되, 연관성 점수(_compute_relevance_score) ≥ min_score
    필터는 적용 — 자동삭제 크론이 점수<50 등록 KW 를 지우므로, 그 기준 이상만 등록해
    churn(등록→삭제) 을 막고 도메인 정밀도 유지. 점수 기준(saved_relevance→user_seed)은
    자동삭제 크론과 동일.
    """
    import time as _time
    from services.naver_ad_service import NaverAdApiClient
    from database.naver_ad_db import get_ad_account_relevance_keywords
    pool = get_keyword_pool_db()
    t0 = _time.monotonic()

    # 연관성 점수 기준 — 자동삭제 크론과 동일: saved relevance_keywords → user_seed 폴백.
    score_basis = get_ad_account_relevance_keywords(user_id, str(customer_id))
    if not score_basis:
        score_basis = [s for s in (pool.list_user_seeds(customer_id) or []) if s and len(s) >= 2]
    # negative_keywords (drift 차단) + required_tokens (핵심의도 앵커) — 프로파일에서 로드.
    negatives = []
    required_tokens = []
    try:
        from database.naver_ad_db import get_domain_profile as _get_prof
        _prof = _get_prof(user_id, str(customer_id)) or {}
        negatives = [n for n in _prof.get("negative_keywords", []) if n and len(n) >= 2]
        required_tokens = [t for t in _prof.get("required_tokens", []) if t and len(t) >= 2]
    except Exception:
        pass

    client = NaverAdApiClient()
    client.customer_id = account["customer_id"]
    client.api_key = account["api_key"]
    client.secret_key = account["secret_key"]

    def _to_int(v):
        if v is None:
            return 0
        if isinstance(v, (int, float)):
            return int(v)
        s = str(v).replace(",", "").strip()
        if s in ("< 10", "<10"):
            return 5
        try:
            return int(float(s))
        except (ValueError, TypeError):
            return 0

    seen: Set[str] = set()
    items: List[Dict] = []
    total_related = 0
    n_vol_pass = 0   # 검색량 통과 수
    n_score_cut = 0  # 검색량 통과했으나 점수 미달로 컷
    n_neg_cut = 0    # negative_keywords 포함으로 컷 (drift 차단)
    for seed in seeds:
        try:
            resp = await client.get_related_keywords(seed, show_detail=True)
        except Exception as e:
            logger.warning(f"[pool/explode] seed='{seed}' 연관 조회 실패: {e}")
            await asyncio.sleep(0.3)
            continue
        rows = resp.get("keywordList", []) if isinstance(resp, dict) else (resp if isinstance(resp, list) else [])
        total_related += len(rows)
        added_this_seed = 0
        for it in rows:
            kw = (it.get("relKeyword") or "").strip()
            if not kw or kw in seen:
                continue
            pc = _to_int(it.get("monthlyPcQcCnt"))
            mo = _to_int(it.get("monthlyMobileQcCnt"))
            mt = pc + mo
            if mt < min_volume:
                continue
            n_vol_pass += 1
            # 연관성 점수 필터 — 자동삭제 크론(점수<min_score 삭제)과 일관. 점수 기준은
            # saved_relevance(없으면 user_seed). seen 은 점수 미달이어도 마킹해 재계산 방지.
            seen.add(kw)
            if negatives and any(nt in kw for nt in negatives):
                n_neg_cut += 1
                continue
            # 핵심의도 앵커 — 필수 토큰 중 하나도 없으면 컷 (시설토큰만으론 통과 못 함).
            if required_tokens and not any(rt in kw for rt in required_tokens):
                n_neg_cut += 1
                continue
            # 관련성 점수 게이트 — 앵커 모드(required_tokens)면 앵커+negative 가 도메인 테스트이므로
            # 점수 컷 skip (앵커있는 진짜 대출이 좁은 relevance 로 과삭제되는 것 방지). 비앵커 도메인만 점수.
            if not required_tokens and score_basis and _compute_relevance_score(kw, score_basis) < min_score:
                n_score_cut += 1
                continue
            items.append({
                "keyword": kw, "seed": seed, "source": "seed_explode",
                "monthly_total": mt, "monthly_pc": pc, "monthly_mobile": mo,
                "comp_idx": it.get("compIdx", ""),
            })
            added_this_seed += 1
            if added_this_seed >= per_seed_cap:
                break
        await asyncio.sleep(0.3)  # keywordstool 429 rate 회피

    added = pool.add_candidates(user_id, customer_id, items) if items else 0
    dur_ms = int((_time.monotonic() - t0) * 1000)
    logger.warning(
        f"[pool/explode] user={user_id} cid={customer_id} 시드 {len(seeds)} → "
        f"연관 {total_related} → 검색량≥{min_volume} {n_vol_pass} → 점수≥{min_score} {len(items)} "
        f"(점수컷 {n_score_cut}, neg컷 {n_neg_cut}) → pending +{added} ({dur_ms}ms)"
    )
    try:
        pool.record_run(
            user_id, customer_id, "seed_explode", "success" if added else "no_new",
            added=added, seeds_count=len(seeds),
            error_message=(
                f"연관 {total_related} → 검색량≥{min_volume} {n_vol_pass} → "
                f"점수≥{min_score} {len(items)} → pending +{added}"
            )[:300],
            duration_ms=dur_ms,
        )
    except Exception:
        pass


@router.post("/keyword-pool/seed-explode-register")
async def keyword_pool_seed_explode(
    request: SeedExplodeRequest,
    background_tasks: BackgroundTasks,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """연관키워드 폭발 등록 — 사용자가 고른 시드의 연관키워드를 대량 수집·검색량 필터만
    통과시켜 pending 직접 삽입 (AI 도메인 게이트 우회). register cron 이 네이버 등록.

    자동 발굴은 drift 방지 게이트가 빡빡해 통과율이 낮다. 사용자가 명시한 시드의
    연관키워드는 신뢰 가능하므로 classify/whitelist 없이 검색량만 보고 대량 등록한다.
    백그라운드 처리 (시드 다수 × keywordstool ~1s → fly 60s proxy 초과 방지). 결과는 실행 이력.
    """
    seeds = [s.strip() for s in (request.seeds or []) if s and s.strip()]
    if not seeds:
        raise HTTPException(status_code=400, detail="시드가 비어있습니다")
    seeds = seeds[:150]  # 1회 최대 150 시드 (저장된 도메인 키워드 전체 폭발 지원). 백그라운드 처리.
    min_volume = max(0, min(100_000, request.min_volume))
    per_seed_cap = max(1, min(1000, request.max_per_seed))
    min_score = max(0, min(100, request.min_score))

    account = _resolve_account(user_id, request.customer_id)
    if not account or not account.get("is_connected"):
        raise HTTPException(status_code=400, detail="네이버 광고 계정을 먼저 연동하세요")
    customer_id = int(account.get("customer_id"))

    background_tasks.add_task(
        _run_seed_explode, user_id, customer_id, account, seeds, min_volume, per_seed_cap, min_score,
    )
    return {
        "success": True,
        "started": True,
        "customer_id": customer_id,
        "seeds_used": len(seeds),
        "min_volume": min_volume,
        "min_score": min_score,
        "message": (
            f"연관키워드 폭발 시작 — 시드 {len(seeds)}개의 연관키워드를 수집해 "
            f"검색량≥{min_volume} + 연관성 점수≥{min_score} 인 것을 pending 에 추가합니다. "
            f"진행/결과는 '최근 실행 이력'의 seed_explode 항목에서 확인하세요."
        ),
    }


class AdminInspectRequest(BaseModel):
    user_id: int


@router.post("/keyword-pool/admin/inspect-all")
async def keyword_pool_admin_inspect_all(
    request: AdminInspectRequest,
    authorization: Optional[str] = Header(None),
):
    """모든 풀 광고그룹 키워드 검토 상태 조회 → 노출제한 mark.

    DEBUG mode (request.user_id < 0): user_id=-N 으로 호출 시 N (절대값) 의 키워드 1개로
    /stats 호출 시도 + 빌드된 URL 반환 (디버깅 전용).
    """
    _verify_cron_token(authorization)
    # /stats endpoint 디버깅 — user_id=-1 같이 음수면 stats 호출 1회만 시도하고
    # 빌드된 URL + Naver 응답 반환.
    if request.user_id < 0:
        from services.naver_ad_service import NaverAdApiClient
        from datetime import datetime, timedelta
        import sqlite3 as _sq
        target_uid = abs(request.user_id)
        account = get_ad_account(target_uid)
        if not account or not account.get("is_connected"):
            return {"debug": True, "error": "광고 계정 미연결"}
        customer_id_dbg = int(account.get("customer_id"))
        reg_dbg = get_registered_keywords_db()
        with _sq.connect(reg_dbg.db_path) as conn:
            row = conn.execute(
                "SELECT ncc_keyword_id FROM registered_keywords WHERE account_customer_id=? AND ncc_keyword_id IS NOT NULL LIMIT 1",
                (customer_id_dbg,),
            ).fetchone()
        if not row:
            return {"debug": True, "error": "키워드 없음"}
        client = NaverAdApiClient()
        client.customer_id = account["customer_id"]
        client.api_key = account["api_key"]
        client.secret_key = account["secret_key"]
        end_d = datetime.now().strftime("%Y-%m-%d")
        start_d = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
        try:
            stats = await client.get_stats("KEYWORD", [row[0]], start_d, end_d)
            return {"debug": True, "test_id": row[0], "result": stats}
        except Exception as e:
            return {"debug": True, "test_id": row[0], "error": f"{type(e).__name__}: {str(e)[:300]}"}
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
    customer_id: Optional[str] = None,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """클릭 발생한 키워드 list — 사용자 검수용. 시드 매칭 여부 표시."""
    from services.naver_ad_service import NaverAdApiClient
    from datetime import datetime, timedelta
    import sqlite3 as _sqlite3

    try:
        account = _resolve_account(user_id, customer_id)
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

        # Naver /stats 는 단일 ID 호출만 안정적 (multi-id 11001 잘못된 파라미터).
        # 95k+ KW 모두 querying 은 비현실적 — 최근 등록 1500개만 sample.
        # 대부분 KW 는 click=0 이라 sample 제한해도 active KW 잡힘 (registered DESC).
        ids = list(keyword_map.keys())[:1500]
        # 동시 호출 20 → 3 으로 축소. Naver outbound 가 timeout 폭주할 때
        # circuit breaker (threshold=5) 가 빠르게 OPEN 되어 나머지 task 가 즉시 503 fail.
        # 정상 시에도 Sem=3 이면 1500개 ÷ 3 ≈ 500 round × ~200ms = 100s 내 완료.
        sem = asyncio.Semaphore(3)
        # /stats 전용 breaker — inspect/collect 와 격리.
        from services.naver_ad_service import _stats_breaker, NaverApiCircuitOpenError

        async def _fetch_one(kid: str) -> List[dict]:
            # stats circuit OPEN 상태면 task 진입 자체 skip — sem 점유 안 함
            if _stats_breaker.is_open():
                return []
            async with sem:
                try:
                    stats = await client.get_stats(
                        stat_type="KEYWORD", ids=[kid],
                        start_date=start_date, end_date=end_date,
                    )
                    return stats or []
                except NaverApiCircuitOpenError:
                    return []
                except Exception as e:
                    logger.warning(f"clicked-keywords {kid} 실패: {str(e)[:120]}")
                    return []

        results = await asyncio.gather(*[_fetch_one(kid) for kid in ids])
        all_stats: List[dict] = [s for batch in results for s in batch]

        pool = get_keyword_pool_db()
        user_seeds = [s for s in (pool.list_user_seeds(customer_id) or []) if s and len(s) >= 2]

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
            score = _compute_relevance_score(kw_text, user_seeds)
            items.append({
                "keyword_id": keyword_id,
                "keyword": kw_text,
                "impressions": int(stat.get("impCnt", 0) or 0),
                "clicks": clicks,
                "cost": int(stat.get("salesAmt", 0) or 0),
                "ctr": float(stat.get("ctr", 0) or 0),
                "cpc": int(stat.get("cpc", 0) or 0),
                "matches_seed": score >= 100,  # 호환성 유지 — full seed 매칭만 true
                "relevance_score": score,
            })
        # 점수 낮은 순 + 클릭 많은 순 — 가장 무관한 KW 먼저 (낭비 큰 것 우선 노출)
        items.sort(key=lambda x: (x["relevance_score"], -x["clicks"]))
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
    customer_id: Optional[str] = None,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """선택된 키워드 일괄 네이버 삭제 (실패 시 PAUSE) + 풀 mark + reg DB 제거."""
    from services.naver_ad_service import NaverAdApiClient
    import sqlite3 as _sqlite3

    try:
        account = _resolve_account(user_id, customer_id)
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


# ============ 연관성-점수 기반 자동 cleanup ============
# 사용자가 토글 ON + threshold(예: 30) 지정 → cron 이 매시 1회 클릭 발생 KW 중
# 점수 ≤ threshold 인 것 자동 DELETE (실패 시 PAUSE). 검수 없이 점수만 본다.
# 클릭 미발생 KW 는 건드리지 않음 — 노출 받기 전 KW 는 점수 낮아도 cost 0.

class AutoCleanupSettingsRequest(BaseModel):
    enabled: Optional[bool] = None
    threshold: Optional[int] = None  # 0~95
    relevance_keywords: Optional[List[str]] = None  # 도메인 기준 키워드 list (예: ["피부질환","피부","아토피"])


@router.get("/keyword-pool/auto-cleanup/settings")
def keyword_pool_auto_cleanup_get(
    customer_id: Optional[str] = None,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """광고주별 자동 cleanup 설정 + 마지막 실행 stamp. sync def → threadpool."""
    from database.naver_ad_db import get_ad_account_auto_cleanup
    account = _resolve_account(user_id, customer_id)
    if not account:
        raise HTTPException(status_code=400, detail="광고 계정 미연결")
    cid_str = str(account.get("customer_id"))
    s = get_ad_account_auto_cleanup(user_id, cid_str)
    return {"success": True, "customer_id": cid_str, **s}


@router.patch("/keyword-pool/auto-cleanup/settings")
async def keyword_pool_auto_cleanup_patch(
    request: AutoCleanupSettingsRequest,
    background_tasks: BackgroundTasks,
    customer_id: Optional[str] = None,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """자동 cleanup ON/OFF 또는 threshold 변경 — 부분 업데이트.
    enabled=true 로 변경 시 background 즉시 1회 실행 — 다음 cron 정각까지 대기 안 함.
    """
    from database.naver_ad_db import update_ad_account_auto_cleanup, get_ad_account_auto_cleanup
    account = _resolve_account(user_id, customer_id)
    if not account:
        raise HTTPException(status_code=400, detail="광고 계정 미연결")
    cid_str = str(account.get("customer_id"))
    logger.warning(
        f"[auto-cleanup/PATCH] uid={user_id} cid={cid_str} "
        f"enabled={request.enabled} threshold={request.threshold} "
        f"rel_kws_count={len(request.relevance_keywords) if request.relevance_keywords else 'None'} "
        f"rel_kws_sample={(request.relevance_keywords or [])[:5]}"
    )
    ok = update_ad_account_auto_cleanup(
        user_id, cid_str,
        enabled=request.enabled,
        threshold=request.threshold,
        relevance_keywords=request.relevance_keywords,
    )
    if not ok:
        raise HTTPException(status_code=400, detail="변경할 필드 없음 또는 광고주 미존재")
    s = get_ad_account_auto_cleanup(user_id, cid_str)
    logger.warning(
        f"[auto-cleanup/PATCH] uid={user_id} cid={cid_str} 저장 후 SELECT 결과 "
        f"rel_kws_count={len(s.get('relevance_keywords') or [])} "
        f"rel_kws_sample={(s.get('relevance_keywords') or [])[:5]}"
    )
    # enabled=true 로 변경 시 즉시 1회 실행 — 다음 cron 까지 대기 안 함.
    # asyncio.create_task fire-and-forget — fly.io 의 BackgroundTasks 가 worker 점유로
    # cancel 되는 케이스 회피. 시작 시 즉시 last_run_at stamp → 사용자가 "실행 중" 확인.
    triggered = False
    if request.enabled is True and s.get("enabled"):
        cid_int = int(cid_str)
        thr = int(s.get("threshold") or 30)
        # 1) 즉시 stamp — 사용자가 토글 ON 직후 "최근 실행: 방금 전" 즉시 확인 가능
        try:
            from database.naver_ad_db import record_auto_cleanup_run
            record_auto_cleanup_run(user_id, cid_str, 0)
            logger.warning(f"[auto-cleanup/PATCH] uid={user_id} cid={cid_str} 즉시 stamp (실행 시작 표시)")
        except Exception as _e:
            logger.warning(f"[auto-cleanup/PATCH] 즉시 stamp 실패: {_e}")

        # 2) fire-and-forget task — uvicorn 워커가 살아있는 동안 실행
        async def _trigger_now():
            try:
                logger.warning(f"[auto-cleanup/PATCH/trigger] uid={user_id} cid={cid_int} thr={thr} 시작")
                res = await _run_auto_cleanup_for_account(user_id, cid_int, thr)
                logger.warning(
                    f"[auto-cleanup/PATCH/trigger] uid={user_id} cid={cid_int} 실행 결과: {res}"
                )
            except Exception as e:
                logger.error(
                    f"[auto-cleanup/PATCH/trigger] uid={user_id} cid={cid_int} 실행 실패: "
                    f"{type(e).__name__}: {e}", exc_info=True
                )
                try:
                    from database.naver_ad_db import record_auto_cleanup_run
                    record_auto_cleanup_run(user_id, str(cid_int), 0)
                except Exception:
                    pass
        try:
            asyncio.create_task(_trigger_now())
            triggered = True
        except Exception as _e:
            # event loop 외 호출 시 — BackgroundTasks 폴백
            logger.warning(f"[auto-cleanup/PATCH] create_task 실패 → BackgroundTasks 폴백: {_e}")
            background_tasks.add_task(_trigger_now)
            triggered = True
    return {"success": True, "customer_id": cid_str, **s, "triggered_now": triggered}


async def _run_auto_cleanup_for_account(
    user_id: int, customer_id: int, threshold: int,
    days: int = 7, max_delete: int = 200,
) -> Dict:
    """한 광고주의 클릭 KW 중 점수 ≤ threshold 인 것 일괄 DELETE.
    - days: 최근 N 일 클릭 통계 (default 7)
    - max_delete: 한 tick 당 최대 삭제 수 (네이버 rate limit + 사고 방지)

    설계 (시작 stamp 제거):
    - 옛 코드는 시작 즉시 record_auto_cleanup_run(0) 으로 stamp 해서 hang 가드용
      "cron 살아있음" 표시 유지. 그러나 Naver stats circuit OPEN 시 click_cleanup
      이 0 처리 → last_deleted=0 stamp 가 domain_cleanup 의 실제 del=498 stamp 를
      overwrite → 사용자 화면 영구 "삭제 0" 으로 보이는 사고.
    - 새 정책: 처리 대상 0 이거나 circuit OPEN 이면 stamp 안 함. domain_cleanup 의
      실제 결과 stamp 만 보존. timeout 가드는 scheduler 단에서 처리.
    """
    from services.naver_ad_service import NaverAdApiClient, _stats_breaker
    from database.naver_ad_db import get_ad_account_by_customer, record_auto_cleanup_run
    from datetime import datetime, timedelta
    import sqlite3 as _sqlite3

    # Naver stats circuit OPEN 이면 click_cleanup 은 어차피 효과 0 — fly CPU 낭비 차단.
    # domain_cleanup (별도 cron) 이 circuit 무관하게 score 기반 정리하므로 누락 없음.
    if _stats_breaker.is_open():
        return {"customer_id": customer_id, "deleted": 0, "reason": "naver_stats_circuit_open"}

    account = get_ad_account_by_customer(user_id, str(customer_id))
    if not account or not account.get("is_connected"):
        return {"customer_id": customer_id, "deleted": 0, "reason": "not_connected"}

    reg = get_registered_keywords_db()
    pool = get_keyword_pool_db()
    with _sqlite3.connect(reg.db_path) as conn:
        rows = conn.execute(
            "SELECT keyword, ncc_keyword_id FROM registered_keywords WHERE account_customer_id=? AND ncc_keyword_id IS NOT NULL",
            (customer_id,),
        ).fetchall()
    if not rows:
        record_auto_cleanup_run(user_id, str(customer_id), 0)
        return {"customer_id": customer_id, "deleted": 0, "reason": "no_registered_keywords"}
    keyword_map = {r[1]: r[0] for r in rows}

    client = NaverAdApiClient()
    client.customer_id = account["customer_id"]
    client.api_key = account["api_key"]
    client.secret_key = account["secret_key"]

    end_date = datetime.now().strftime("%Y-%m-%d")
    start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")

    # 1500 → 600. Naver stats API 응답 지연 (개당 1~5s) 으로 sem=3 직렬화 시 600s 도
    # 못 끝남 사례 다수 (cid=4362992 등). per-call timeout 으로 hang 차단 + sem=5 병렬도 ↑.
    # 600 ÷ 5 = 120 round × max 5s = 600s worst, 정상 시 120 × 200ms = 24s.
    ids = list(keyword_map.keys())[:600]
    sem = asyncio.Semaphore(5)
    from services.naver_ad_service import _stats_breaker, NaverApiCircuitOpenError

    PER_CALL_TIMEOUT = 5.0  # 한 stats 요청 5s 안 응답 → skip (KW 1개 잃음, hang 차단)
    n_stats_timeout = 0

    async def _fetch_one(kid: str) -> List[dict]:
        nonlocal n_stats_timeout
        # stats circuit OPEN 시 진입 즉시 skip — sem 점유 안 함
        if _stats_breaker.is_open():
            return []
        async with sem:
            try:
                stats = await asyncio.wait_for(
                    client.get_stats(
                        stat_type="KEYWORD", ids=[kid],
                        start_date=start_date, end_date=end_date,
                    ),
                    timeout=PER_CALL_TIMEOUT,
                )
                return stats or []
            except asyncio.TimeoutError:
                n_stats_timeout += 1
                return []
            except NaverApiCircuitOpenError:
                return []
            except Exception as e:
                logger.warning(f"[auto-cleanup] stats {kid} 실패: {str(e)[:120]}")
                return []

    results = await asyncio.gather(*[_fetch_one(kid) for kid in ids])
    all_stats = [s for batch in results for s in batch]
    if n_stats_timeout > 0:
        logger.warning(
            f"[auto-cleanup] uid={user_id} cid={customer_id} stats per-call timeout "
            f"{n_stats_timeout}/{len(ids)} (5s 초과 — Naver API 응답 지연)"
        )
    logger.warning(
        f"[auto-cleanup] uid={user_id} cid={customer_id} stats fetched ids={len(ids)} "
        f"non_empty={len(all_stats)} circuit_open={_stats_breaker.is_open()}"
    )

    # cron 자동 cleanup 도 cleanup-by-score 와 동일 우선순위:
    # ad_accounts.relevance_keywords (사용자 명시) → user_seed 폴백.
    from database.naver_ad_db import get_ad_account_relevance_keywords
    saved_basis = get_ad_account_relevance_keywords(user_id, str(customer_id))
    if saved_basis:
        user_seeds = saved_basis
    else:
        user_seeds = [s for s in (pool.list_user_seeds(customer_id) or []) if s and len(s) >= 2]
    targets: List[Tuple[str, str, int]] = []  # (kid, kw, score)
    for stat in all_stats:
        kid = stat.get("id")
        if not kid:
            continue
        clicks = int(stat.get("clkCnt", 0) or 0)
        if clicks <= 0:
            continue  # 클릭 미발생 KW 는 건드리지 않음
        kw = keyword_map.get(kid)
        if not kw:
            continue
        score = _compute_relevance_score(kw, user_seeds)
        if score < threshold:  # Option B: boundary 보존
            targets.append((kid, kw, score))

    # 가장 무관한 KW 부터 (낮은 점수 우선) — max_delete 캡 적용
    targets.sort(key=lambda x: x[2])
    targets = targets[:max_delete]

    n_deleted = 0
    n_paused = 0
    n_failed = 0
    n_stale_purged = 0  # 네이버 404 = 이미 사라진 KW → DB stale row 만 정리
    affected: List[str] = []
    import httpx as _httpx
    for kid, kw_text, _score in targets:
        try:
            await client.delete_keyword(kid)
            with _sqlite3.connect(reg.db_path) as conn:
                conn.execute(
                    "DELETE FROM registered_keywords WHERE account_customer_id=? AND ncc_keyword_id=?",
                    (customer_id, kid),
                )
            n_deleted += 1
            affected.append(kw_text)
        except _httpx.HTTPStatusError as e:
            # 404 "No permission to access the resource" = 네이버 콘솔에서 이미 사라진 KW.
            # 옛 코드는 fail 카운트해서 DB row 영구 보존 → 한도 stale, register 가 cap 거부됨.
            # 이제 DB row 도 같이 제거 → 실제 한도 회수.
            if getattr(e, "response", None) is not None and e.response.status_code == 404:
                with _sqlite3.connect(reg.db_path) as conn:
                    conn.execute(
                        "DELETE FROM registered_keywords WHERE account_customer_id=? AND ncc_keyword_id=?",
                        (customer_id, kid),
                    )
                n_stale_purged += 1
                affected.append(kw_text)
            else:
                try:
                    await client.pause_keyword(kid)
                    n_paused += 1
                    affected.append(kw_text)
                except Exception:
                    n_failed += 1
        except Exception:
            try:
                await client.pause_keyword(kid)
                n_paused += 1
                affected.append(kw_text)
            except Exception:
                n_failed += 1
        await asyncio.sleep(0.15)

    if affected:
        pool.mark_rejected_by_naver(
            customer_id,
            [{"keyword": kw, "reason": f"자동 cleanup (점수≤{threshold})"} for kw in affected],
        )
    # 실행 이력 — 화면 '최근 실행 이력' 표에 노출
    total_purged = n_deleted + n_stale_purged
    try:
        pool.record_run(
            user_id, customer_id, "inspect",
            "success" if total_purged > 0 else "no_new",
            registered=0, failed=n_failed, skipped=total_purged,
            seeds_count=len(targets),
            error_message=(
                f"자동 cleanup (점수≤{threshold}) — DELETE {n_deleted} / 404 stale {n_stale_purged} / PAUSE {n_paused} / 실패 {n_failed}"
                if (total_purged or n_paused or n_failed) else f"자동 cleanup (점수≤{threshold}) — 대상 0"
            ),
        )
    except Exception:
        pass

    # 실제 정리한 게 있을 때만 stamp — 0 이면 domain_cleanup 의 이전 stamp 보존.
    # 사용자 화면 "최근 실행 N개" 가 의미있는 결과만 반영되도록.
    if total_purged + n_paused > 0:
        record_auto_cleanup_run(user_id, str(customer_id), total_purged + n_paused)

    # 임계 auto-promote — cleanup 직후 풀의 점수 분포 검사 → 90%+ 가 thr+10 이상이면
    # threshold 를 +10 상향. 점진 수렴: 30 → 40 → 50 → ... → 80 cap.
    # cleanup 으로 풀이 점수 ≥ thr 만 남으면 다음 단계로 자동 진입 → 사용자 개입 없이
    # "모든 KW 가 점수 N 이상" 목표에 수렴.
    try:
        promoted_to = await _maybe_promote_auto_cleanup_threshold(
            user_id, customer_id, threshold,
        )
        if promoted_to:
            logger.warning(
                f"[auto-cleanup/promote] uid={user_id} cid={customer_id} "
                f"threshold {threshold} → {promoted_to} (풀 90%+ ≥{threshold+10})"
            )
    except Exception as e:
        logger.warning(f"[auto-cleanup/promote] 실패 uid={user_id} cid={customer_id}: {e}")

    return {
        "customer_id": customer_id,
        "threshold": threshold,
        "candidates": len(targets),
        "deleted": n_deleted,
        "stale_purged": n_stale_purged,
        "paused": n_paused,
        "failed": n_failed,
    }


async def _maybe_promote_auto_cleanup_threshold(
    user_id: int, customer_id: int, current_threshold: int,
    *, sample_size: int = 1500, promote_step: int = 5,
    promote_ratio: float = 0.75, max_threshold: int = 75,
) -> Optional[int]:
    """풀의 점수 분포 검사 후 threshold 자동 상향.

    조건 (모두 충족 시 +promote_step):
      - current_threshold < max_threshold (75 이상이면 더 안 올림)
      - 등록 KW 수 ≥ 5000 (샘플 신뢰성)
      - 샘플 1500 random 중 ≥ promote_ratio(75%) 가 점수 ≥ current_threshold + promote_step

    why: cleanup 으로 점수≤thr KW 빠지면 풀 점수 분포가 thr 이상으로 수렴.
    분포의 75%가 thr+5 까지 도달했다면 다음 단계로 진입할 수 있다는 신호.
    구버전 (ratio 0.90, step 10) 은 promote 너무 보수적이라 풀 점수 31~39 분포에서
    영원히 promote 안 됨 → cleanup 대상 0 영구 정체 사고. 75% / +5 로 점진 적응.
    cap=75 — 너무 엄격해지면 빈 슬롯 못 채움 위험.
    """
    from database.naver_ad_db import (
        get_ad_account_relevance_keywords, update_ad_account_auto_cleanup,
    )
    import sqlite3 as _sqlite3
    import random as _random

    if current_threshold >= max_threshold:
        return None

    next_threshold = current_threshold + promote_step
    if next_threshold > max_threshold:
        next_threshold = max_threshold

    reg = get_registered_keywords_db()
    pool = get_keyword_pool_db()

    with _sqlite3.connect(reg.db_path) as conn:
        rows = conn.execute(
            "SELECT keyword FROM registered_keywords "
            "WHERE account_customer_id=? AND ncc_keyword_id IS NOT NULL "
            "AND removed_at IS NULL",
            (customer_id,),
        ).fetchall()
    keywords = [r[0] for r in rows if r and r[0]]
    if len(keywords) < 5000:
        return None  # 풀 너무 작음 — 샘플 신뢰성 부족

    # 점수 기준 — saved_relevance > user_seed 폴백
    saved = get_ad_account_relevance_keywords(user_id, str(customer_id))
    if saved and len([s for s in saved if s and len(s) >= 2]) >= 3:
        score_basis = saved
    else:
        score_basis = [
            s for s in (pool.list_user_seeds(customer_id) or []) if s and len(s) >= 2
        ]
    if not score_basis:
        return None  # 점수 계산 불가

    sample = (
        _random.sample(keywords, sample_size) if len(keywords) > sample_size
        else keywords
    )
    pass_count = 0
    for kw in sample:
        if _compute_relevance_score(kw, score_basis) >= next_threshold:
            pass_count += 1
    ratio = pass_count / len(sample)
    if ratio < promote_ratio:
        return None

    ok = update_ad_account_auto_cleanup(
        user_id, str(customer_id), threshold=next_threshold,
    )
    if not ok:
        return None
    # 진행 이력 — 화면 '최근 실행 이력' 표에 노출
    try:
        pool.record_run(
            user_id, customer_id, "inspect", "success",
            error_message=(
                f"threshold auto-promote {current_threshold} → {next_threshold} "
                f"(샘플 {len(sample)} 중 {pass_count} ≥{next_threshold}, "
                f"ratio {ratio:.1%})"
            )[:300],
        )
    except Exception:
        pass
    return next_threshold


async def _run_domain_cleanup_for_account(
    user_id: int, customer_id: int, threshold: int = 30, max_delete: int = 750,
) -> Dict:
    """click 무관 — relevance_keywords 점수 ≤ threshold 인 등록 KW 일괄 DELETE.

    cron 으로 매 시간 실행되어 100k 풀에서 도메인 안 맞는 무관 KW 를 점진 정리.
    한 tick 당 max_delete (default 500) 제한 — Naver rate + 사고 방지.
    빈 자리는 collect/register cron 이 새 도메인 KW 로 채움 → 100k 가 점진적으로 도메인 KW 100% 로 수렴.
    """
    from services.naver_ad_service import NaverAdApiClient
    from database.naver_ad_db import (
        get_ad_account_by_customer,
        get_ad_account_relevance_keywords,
        record_auto_cleanup_run,
    )
    import sqlite3 as _sqlite3
    import time as _t

    t0 = _t.monotonic()
    # start stamp 제거 — 0 stamp 가 다른 cleanup 의 실제 결과 stamp 를 overwrite
    # 하는 사고 차단. 의미있는 결과만 stamp (n_del + n_stale > 0 일 때).
    account = get_ad_account_by_customer(user_id, str(customer_id))
    if not account or not account.get("is_connected"):
        return {"customer_id": customer_id, "deleted": 0, "reason": "not_connected"}

    # 점수 기준 키워드 — saved relevance > user_seed 폴백
    saved = get_ad_account_relevance_keywords(user_id, str(customer_id))
    pool = get_keyword_pool_db()
    if saved and len(saved) >= 1:
        score_basis = saved
        basis = "saved_relevance"
    else:
        score_basis = [s for s in (pool.list_user_seeds(customer_id) or []) if s and len(s) >= 2]
        basis = "user_seed"
    if not score_basis:
        return {"customer_id": customer_id, "deleted": 0, "reason": "no_score_basis"}

    # 핵심의도 앵커 + negative — 앵커 모드면 (앵커없음 OR negative) 가 삭제 기준 (점수 무관).
    required_tokens = []
    neg_tokens = []
    try:
        from database.naver_ad_db import get_domain_profile as _gdp_ct
        _pf_ct = _gdp_ct(user_id, str(customer_id)) or {}
        required_tokens = [t for t in _pf_ct.get("required_tokens", []) if t and len(t) >= 2]
        neg_tokens = [n for n in _pf_ct.get("negative_keywords", []) if n and len(n) >= 2]
    except Exception:
        pass

    reg = get_registered_keywords_db()
    with _sqlite3.connect(reg.db_path) as conn:
        rows = conn.execute(
            "SELECT keyword, ncc_keyword_id FROM registered_keywords "
            "WHERE account_customer_id=? AND ncc_keyword_id IS NOT NULL",
            (customer_id,),
        ).fetchall()
    if not rows:
        try: record_auto_cleanup_run(user_id, str(customer_id), 0)
        except Exception: pass
        return {"customer_id": customer_id, "deleted": 0, "reason": "no_registered"}

    # 점수 매김 — atoms precompute (95k KW × atoms 재빌드 차단)
    def _score_all() -> List[Tuple[str, str, int]]:
        atoms_3plus: set = set()
        atoms_2: set = set()
        for s in score_basis:
            if not s or len(s) < 2:
                continue
            if len(s) >= 4:
                atoms_3plus.add(s)
            for n in (2, 3):
                for i in range(len(s) - n + 1):
                    a = s[i:i + n]
                    (atoms_2 if len(a) == 2 else atoms_3plus).add(a)
        out: List[Tuple[str, str, int]] = []
        for kw_text, kid in rows:
            if not kw_text:
                out.append((kid, "", 0)); continue
            sc = 0
            full = False
            for s in score_basis:
                if not s or len(s) < 2:
                    continue
                if s in kw_text: sc = 100; full = True; break
                if kw_text in s: sc = 95; full = True; break
            if not full:
                n_3 = sum(1 for a in atoms_3plus if a in kw_text)
                n_2 = sum(1 for a in atoms_2 if a in kw_text)
                sc = min(95, min(80, n_3 * 20) + min(30, n_2 * 5))
            out.append((kid, kw_text, sc))
        return out

    scored = await asyncio.to_thread(_score_all)
    if required_tokens:
        # 앵커 모드 — (앵커 하나도 없음) 또는 (negative 포함) 만 삭제. 점수 무시 (앵커있는 진짜 대출 보존).
        targets = [
            (kid, kw, s) for kid, kw, s in scored
            if kw and (
                not any(rt in kw for rt in required_tokens)
                or (neg_tokens and any(nt in kw for nt in neg_tokens))
            )
        ]
    else:
        # 비앵커 도메인 — 점수<threshold 또는 negative 포함(substring 오매칭 off-domain 차단)
        targets = [
            (kid, kw, s) for kid, kw, s in scored
            if s < threshold or (neg_tokens and kw and any(nt in kw for nt in neg_tokens))
        ]
    targets.sort(key=lambda x: x[2])  # 무관한 것부터
    targets = targets[:max(0, min(max_delete, 5000))]
    if not targets:
        try: record_auto_cleanup_run(user_id, str(customer_id), 0)
        except Exception: pass
        return {"customer_id": customer_id, "deleted": 0, "reason": "no_below_threshold",
                "total_registered": len(scored), "basis": basis}

    client = NaverAdApiClient()
    client.customer_id = account["customer_id"]
    client.api_key = account["api_key"]
    client.secret_key = account["secret_key"]

    n_del, n_pause, n_fail = 0, 0, 0
    n_stale = 0  # 네이버 404 = 이미 사라진 KW. 옛 코드는 fail 처리 → DB stale 누적, 한도 영구 막힘.
    affected_kws: List[str] = []
    import httpx as _httpx
    def _purge_db(kid_: str, kw_: str):
        with _sqlite3.connect(reg.db_path) as c:
            c.execute(
                "DELETE FROM registered_keywords "
                "WHERE account_customer_id=? AND ncc_keyword_id=?",
                (customer_id, kid_),
            )
        if kw_:
            with _sqlite3.connect(pool.db_path) as c:
                c.execute(
                    "UPDATE naverad_keyword_pool SET status='deleted' "
                    "WHERE account_customer_id=? AND keyword=?",
                    (customer_id, kw_),
                )
    for kid, kw_text, _s in targets:
        try:
            await client.delete_keyword(kid)
            _purge_db(kid, kw_text)
            n_del += 1
            if kw_text: affected_kws.append(kw_text)
        except _httpx.HTTPStatusError as e:
            if getattr(e, "response", None) is not None and e.response.status_code == 404:
                _purge_db(kid, kw_text)
                n_stale += 1
                if kw_text: affected_kws.append(kw_text)
            else:
                try:
                    await client.pause_keyword(kid)
                    n_pause += 1
                    if kw_text: affected_kws.append(kw_text)
                except Exception:
                    n_fail += 1
        except Exception:
            try:
                await client.pause_keyword(kid)
                n_pause += 1
                if kw_text: affected_kws.append(kw_text)
            except Exception:
                n_fail += 1
        await asyncio.sleep(0.15)

    total_purged = n_del + n_stale
    try:
        # 의미있는 결과만 stamp — 0 stamp 가 이전 cleanup 결과 overwrite 방지.
        if total_purged + n_pause > 0:
            record_auto_cleanup_run(user_id, str(customer_id), total_purged + n_pause)
        pool.record_run(
            user_id, customer_id, "inspect",
            "success" if total_purged > 0 else "no_new",
            registered=0, failed=n_fail, skipped=total_purged,
            seeds_count=len(score_basis),
            error_message=(
                f"도메인 자동 정리 ({basis}, click 무관) — DELETE {n_del} / "
                f"404 stale {n_stale} / PAUSE {n_pause} / 실패 {n_fail} / 점수≤{threshold}"
            ),
            duration_ms=int((_t.monotonic() - t0) * 1000),
        )
    except Exception:
        pass
    logger.warning(
        f"[domain-cleanup] uid={user_id} cid={customer_id} basis={basis} "
        f"thr={threshold} → del={n_del} stale={n_stale} pause={n_pause} fail={n_fail}"
    )
    return {
        "customer_id": customer_id, "deleted": n_del, "stale_purged": n_stale,
        "paused": n_pause, "failed": n_fail, "basis": basis, "threshold": threshold,
        "below_threshold_total": len(targets), "total_registered": len(scored),
    }


@router.post("/keyword-pool/cron/domain-cleanup")
async def keyword_pool_cron_domain_cleanup(
    background_tasks: BackgroundTasks,
    authorization: Optional[str] = Header(None),
    threshold: int = Query(30, ge=0, le=95),
    max_delete: int = Query(500, ge=1, le=5000),
    user_id: Optional[int] = Query(None),
    customer_id: Optional[str] = Query(None),
):
    """Bearer cron — relevance_keywords 점수 ≤ threshold 등록 KW 자동 DELETE (click 무관).

    매 1시간 실행되어 100k 풀의 무관 잔재를 점진 청소. 빈 자리는 collect/register cron 이
    새 도메인 KW 로 채움 → 100k 가 100% 도메인 KW 로 수렴 (사용자 의도).
    auto_cleanup_enabled=1 광고주만 처리.
    """
    _verify_cron_token(authorization)
    from database.naver_ad_db import list_auto_cleanup_enabled_accounts, get_ad_account_auto_cleanup

    targets: List[Tuple[int, int, int]] = []
    if user_id and customer_id:
        s = get_ad_account_auto_cleanup(user_id, str(customer_id))
        thr = threshold if threshold else int(s.get("threshold") or 30)
        targets = [(user_id, int(customer_id), int(thr))]
    else:
        rows = list_auto_cleanup_enabled_accounts() or []
        for r in rows:
            uid = int(r.get("user_id"))
            cid = int(r.get("customer_id"))
            thr = threshold if threshold else int(r.get("auto_cleanup_threshold") or 30)
            targets.append((uid, cid, thr))

    if not targets:
        return {"success": True, "queued": 0, "message": "자동 cleanup ON 광고주 없음"}

    async def _run_all():
        for uid, cid, thr in targets:
            try:
                res = await _run_domain_cleanup_for_account(uid, cid, thr, max_delete=max_delete)
                logger.info(f"[domain-cleanup/cron] uid={uid} cid={cid} thr={thr} → {res}")
            except Exception as e:
                logger.error(f"[domain-cleanup/cron] uid={uid} cid={cid} 실패: {type(e).__name__}: {e}", exc_info=True)

    background_tasks.add_task(_run_all)
    return {
        "success": True, "queued": len(targets),
        "max_delete_per_account": max_delete,
        "threshold": threshold,
        "timestamp": datetime.now().isoformat(timespec="seconds"),
    }


@router.post("/keyword-pool/cron/seed-amplify-burst")
async def keyword_pool_cron_seed_amplify_burst(
    background_tasks: BackgroundTasks,
    authorization: Optional[str] = Header(None),
    user_id: int = Query(...),
    customer_id: int = Query(...),
    n_calls: int = Query(10, ge=1, le=30),
    target_per_call: int = Query(500, ge=100, le=500),
):
    """시드 amplify 폭발 — n_calls 번 GPT 호출 병렬 → user_seed 풀 대량 확장.

    각 호출: user_seed 100개 random sample → amplify_seeds (target ~500) → fresh seed.
    n_calls=10 → ~5,000 신규 시드 생성 시도, dedup + keywordstool 검증 → user_seed 합류.
    mt=0 시드도 합류 (drift 감수, 시드 풀 확장 우선) — 다음 collect 라운드 atom 다양성 ↑.

    사용 예 (Bearer cron):
      POST /api/naver-ad/keyword-pool/cron/seed-amplify-burst?user_id=1&customer_id=1858907&n_calls=10
      Authorization: Bearer <CRON_TOKEN>
    """
    _verify_cron_token(authorization)

    async def _run():
        from services.ai_seed_suggester import amplify_seeds as _amp
        from services.naver_ad_service import NaverAdApiClient
        from database.naver_ad_db import get_ad_account_by_customer
        from config import settings
        import time as _t
        import random as _r

        t0 = _t.monotonic()
        if not settings.OPENAI_API_KEY:
            logger.warning("[seed-amplify-burst] OPENAI_API_KEY 미설정 — abort")
            return

        account = get_ad_account_by_customer(user_id, str(customer_id))
        if not account or not account.get("is_connected"):
            logger.warning(f"[seed-amplify-burst] uid={user_id} cid={customer_id} 미연결 — abort")
            return

        pool = get_keyword_pool_db()
        user_seeds = pool.list_user_seeds(customer_id) or []
        if not user_seeds:
            logger.warning(f"[seed-amplify-burst] cid={customer_id} user_seed 0 — abort")
            return

        SAMPLE = 100
        _sem = asyncio.Semaphore(4)

        async def _one_amp(idx: int) -> List[str]:
            async with _sem:
                sample = (
                    _r.sample(user_seeds, SAMPLE)
                    if len(user_seeds) > SAMPLE else list(user_seeds)
                )
                try:
                    r = await _amp(sample, target_count=target_per_call)
                except Exception as e:
                    logger.warning(f"[seed-amplify-burst] call {idx} 예외: {e}")
                    return []
                if not r.get("success"):
                    logger.warning(f"[seed-amplify-burst] call {idx} 실패: {r.get('message')}")
                    return []
                return [s for s in (r.get("seeds") or []) if isinstance(s, str) and s.strip()]

        am_t0 = _t.monotonic()
        results = await asyncio.gather(*[_one_amp(i) for i in range(n_calls)])
        am_ms = int((_t.monotonic() - am_t0) * 1000)

        # 누적 fresh seeds — 원본 + 풀 dedup
        user_seed_set = set(user_seeds)
        pool_set = pool.list_pool_keyword_set(customer_id)
        seen: Set[str] = set()
        fresh_seeds: List[str] = []
        for batch in results:
            for s in batch:
                k = s.strip()
                if not k or k in seen or k in user_seed_set or k in pool_set:
                    continue
                seen.add(k)
                fresh_seeds.append(k)

        # 도메인 게이트 — saved_relevance 있는 계정만. amplify burst cartesian 폭발이
        # drift 증폭기 사고의 주범. cold start (relevance 없음) 만 통과시킴.
        from database.naver_ad_db import get_ad_account_relevance_keywords as _get_rel
        saved_relevance = _get_rel(user_id, str(customer_id)) or []
        burst_domain_filtered = 0
        if saved_relevance and len([s for s in saved_relevance if s and len(s) >= 2]) >= 3:
            before = len(fresh_seeds)
            fresh_seeds = [s for s in fresh_seeds if _compute_relevance_score(s, saved_relevance) >= 30]
            burst_domain_filtered = before - len(fresh_seeds)

        logger.warning(
            f"[seed-amplify-burst] cid={customer_id} amplify {n_calls}회 ({am_ms}ms) "
            f"→ 누적 raw {sum(len(b) for b in results)} → fresh {len(fresh_seeds)}"
            + (f" (도메인필터 컷 {burst_domain_filtered})" if burst_domain_filtered else "")
        )

        if not fresh_seeds:
            return

        # keywordstool 검증 — chunks 50 cap, sleep 0.3 (429 회피)
        client = NaverAdApiClient()
        client.customer_id = account["customer_id"]
        client.api_key = account["api_key"]
        client.secret_key = account["secret_key"]

        vol_t0 = _t.monotonic()
        vol_map: Dict[str, dict] = {}
        CHUNK = 5
        CHUNKS_CAP = 200  # 1,000 seed 검증 (burst 모드)
        chunks = [fresh_seeds[i:i + CHUNK] for i in range(0, len(fresh_seeds), CHUNK)][:CHUNKS_CAP]
        for chunk in chunks:
            try:
                r = await client.get_keywords_volume_batch(chunk)
                vol_map.update(r)
            except Exception as e:
                logger.debug(f"[seed-amplify-burst] volume batch 실패: {e}")
            await asyncio.sleep(0.3)
        vol_ms = int((_t.monotonic() - vol_t0) * 1000)

        # mt≥1 만 user_seed 합류 — mt=0 zerovol 시드는 등록 락 사고로 제거 (2026-05-12).
        # 과거: mt=0 도 user_seed 로 INSERT → claim_pending 필터 + INSERT OR IGNORE
        # 합세로 11k+ 등록 불가 행이 풀 점거 → 등록 throughput 영구 정지.
        items_with_vol: List[Dict] = []
        zerovol_count = 0
        for s in fresh_seeds:
            v = vol_map.get(s) or vol_map.get(s.replace(" ", ""))
            mt = int((v or {}).get("monthly_total") or 0)
            if v and mt >= 1:
                items_with_vol.append({
                    "keyword": s, "monthly_total": mt,
                    "monthly_pc": int(v.get("monthly_pc") or 0),
                    "monthly_mobile": int(v.get("monthly_mobile") or 0),
                    "comp_idx": v.get("comp_idx"),
                    "source": "user_seed", "seed": s,
                })
            else:
                zerovol_count += 1

        # 합류 cap — 한 burst 에 user_seed 최대 5000 추가
        BURST_CAP = 5000
        merged = items_with_vol[:BURST_CAP]
        items_zerovol: List[Dict] = []  # 호환성 (로그 변수)
        promoted = 0
        if merged:
            try:
                promoted = pool.add_candidates(user_id, customer_id, merged)
            except Exception as e:
                logger.warning(f"[seed-amplify-burst] add 실패: {e}")

        duration_ms = int((_t.monotonic() - t0) * 1000)
        logger.warning(
            f"[seed-amplify-burst] cid={customer_id} 완료 ({duration_ms}ms) — "
            f"amplify {n_calls}회 raw {sum(len(b) for b in results)} → "
            f"fresh {len(fresh_seeds)} → mt≥1 {len(items_with_vol)} (zerovol 컷 {zerovol_count}) "
            f"→ user_seed +{promoted} (GPT {am_ms}ms, vol {vol_ms}ms)"
        )
        pool.record_run(
            user_id, customer_id, "seed_amplify_burst",
            "success" if promoted > 0 else "no_match",
            added=promoted, seeds_count=len(user_seeds),
            error_message=(
                f"burst {n_calls}회 → fresh {len(fresh_seeds)} → "
                f"mt≥1 {len(items_with_vol)} (zerovol 컷 {zerovol_count}) → +{promoted}"
            )[:300],
            duration_ms=duration_ms,
        )

    background_tasks.add_task(_run)
    return {
        "success": True,
        "queued": True,
        "user_id": user_id,
        "customer_id": customer_id,
        "n_calls": n_calls,
        "target_per_call": target_per_call,
        "estimated_duration_seconds": n_calls * 5 + 60,  # GPT 5s × n_calls + keywordstool
        "timestamp": datetime.now().isoformat(timespec="seconds"),
    }


@router.post("/keyword-pool/cron/cleanup-zerovol-seeds")
async def keyword_pool_cron_cleanup_zerovol_seeds(
    authorization: Optional[str] = Header(None),
    user_id: Optional[int] = Query(None),
    customer_id: Optional[int] = Query(None),
):
    """mt=0 user_seed 잔재 일괄 정리 — 11k+ 등록 락 해제용 (2026-05-12).

    구버전 seed_amplify_burst 가 mt=0 시드를 user_seed 로 INSERT → claim_pending
    의 mt≥1 필터에 걸려 영구 등록 불가. 삭제 후 같은 KW 가 keywordstool 에서
    mt>0 으로 재발견되면 add_candidates UPSERT 가 정상 합류시킴.

    단건: ?user_id=X&customer_id=Y / 전체: 파라미터 없이 호출.
    """
    _verify_cron_token(authorization)
    from database.naver_ad_db import list_connected_ad_accounts

    pool = get_keyword_pool_db()
    targets: List[Tuple[int, int]] = []
    if user_id and customer_id:
        targets = [(int(user_id), int(customer_id))]
    else:
        accts = list_connected_ad_accounts() or []
        for a in accts:
            uid = a.get("user_id")
            cid = a.get("customer_id")
            if uid and cid:
                targets.append((int(uid), int(cid)))

    results = []
    for uid, cid in targets:
        try:
            r = pool.cleanup_zerovol_user_seeds(cid)
            results.append({"user_id": uid, "customer_id": cid, **r})
            by_src = r.get("by_source") or {}
            src_summary = ", ".join(f"{k or '<null>'}={v}" for k, v in list(by_src.items())[:6])
            logger.warning(
                f"[cleanup-zerovol-seeds] uid={uid} cid={cid} → "
                f"삭제 {r['deleted']} (pending {r['before_pending']}→{r['after_pending']}) "
                f"source 분포: {src_summary}"
            )
        except Exception as e:
            logger.error(
                f"[cleanup-zerovol-seeds] uid={uid} cid={cid} 실패: {e}", exc_info=True,
            )
            results.append({"user_id": uid, "customer_id": cid, "error": str(e)[:200]})

    return {
        "success": True,
        "results": results,
        "timestamp": datetime.now().isoformat(timespec="seconds"),
    }


@router.post("/keyword-pool/cron/auto-cleanup")
async def keyword_pool_cron_auto_cleanup(
    background_tasks: BackgroundTasks,
    authorization: Optional[str] = Header(None),
    threshold_override: Optional[int] = Query(None),
    user_id: Optional[int] = Query(None),
    customer_id: Optional[str] = Query(None),
):
    """Bearer 토큰 cron — auto_cleanup_enabled=1 인 모든 광고주에 대해 점수≤threshold 자동 삭제.
    - 단건 트리거: ?user_id=X&customer_id=Y (디버깅/수동 실행)
    - threshold_override: cron 호출 시 광고주 설정 무시하고 강제 임계값 (디버깅)
    """
    _verify_cron_token(authorization)
    from database.naver_ad_db import list_auto_cleanup_enabled_accounts, get_ad_account_auto_cleanup

    targets: List[Tuple[int, int, int]] = []  # (uid, cid, threshold)
    if user_id and customer_id:
        s = get_ad_account_auto_cleanup(user_id, str(customer_id))
        thr = threshold_override if threshold_override is not None else s["threshold"]
        targets = [(user_id, int(customer_id), int(thr))]
    else:
        rows = list_auto_cleanup_enabled_accounts() or []
        for r in rows:
            uid = int(r.get("user_id"))
            cid = int(r.get("customer_id"))
            thr = threshold_override if threshold_override is not None else int(r.get("auto_cleanup_threshold") or 30)
            targets.append((uid, cid, thr))

    if not targets:
        return {"success": True, "queued": 0, "message": "자동 cleanup ON 광고주 없음"}

    async def _run_all():
        for uid, cid, thr in targets:
            try:
                res = await _run_auto_cleanup_for_account(uid, cid, thr)
                logger.info(f"[auto-cleanup] uid={uid} cid={cid} thr={thr} → {res}")
            except Exception as e:
                logger.error(f"[auto-cleanup] uid={uid} cid={cid} 실패: {type(e).__name__}: {e}", exc_info=True)

    background_tasks.add_task(_run_all)
    return {
        "success": True,
        "queued": len(targets),
        "targets": [{"user_id": u, "customer_id": c, "threshold": t} for u, c, t in targets],
        "timestamp": datetime.now().isoformat(timespec="seconds"),
    }


# ============ 등록 KW 전체 점수 audit + 일괄 정리 ============
# auto-cleanup cron 은 click ≥ 1 KW 만 처리 (Naver stats API 호출 비용 절약).
# 이 API 는 click 무관 — registered_keywords 테이블 직접 조회 + keyword text 만으로
# user_seed 점수 매김 (stats API 호출 없이 95k KW 1초 안에 점수화).
# cascade drift 로 옛날에 등록된 무관 KW (click=0) 일괄 정리용.

class CleanupByScoreRequest(BaseModel):
    threshold: int = 30
    max_delete: int = 1000
    dry_run: bool = False
    # 사용자가 호출 시 임시로 다른 기준 키워드 쓰고 싶을 때 (저장된 광고주 설정 무시).
    # 비어있으면 ad_accounts.relevance_keywords → 비어있으면 user_seed 순으로 폴백.
    relevance_keywords_override: Optional[List[str]] = None


@router.post("/keyword-pool/registered/cleanup-by-score")
async def keyword_pool_registered_cleanup_by_score(
    request: CleanupByScoreRequest,
    background_tasks: BackgroundTasks,
    customer_id: Optional[str] = None,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """등록 KW 전체 audit — user_seed 점수 ≤ threshold 인 KW 일괄 DELETE (click 무관).
    dry_run=true: 점수 분포 + 삭제 대상 미리보기. dry_run=false: 백그라운드 실행 (수십분 소요).
    """
    from services.naver_ad_service import NaverAdApiClient
    from database.naver_ad_db import record_auto_cleanup_run
    import sqlite3 as _sqlite3
    import time as _t
    _t0 = _t.monotonic()

    threshold = max(0, min(95, int(request.threshold)))
    # 2026-05-12: cap 5000 → 50000 상향. 한의원/한방 광고주 차 KW drift 50k+ 누적 사고에서
    # 5000 cap 이면 10+ 회 수동 호출 필요. 50000 = 한 번 호출로 ~150분 백그라운드 정리.
    max_delete = max(0, min(50000, int(request.max_delete)))
    dry_run = bool(request.dry_run)

    account = _resolve_account(user_id, customer_id)
    if not account or not account.get("is_connected"):
        raise HTTPException(status_code=400, detail="광고 계정 미연결")
    cid = int(account.get("customer_id"))

    pool = get_keyword_pool_db()
    reg = get_registered_keywords_db()

    # 점수 기준 키워드 우선순위: request.override → 광고주 저장값 → user_seed.
    # 사용자 의도 ("내가 원하는 키워드 기준으로 연관성 잡아야지") 반영.
    from database.naver_ad_db import get_ad_account_relevance_keywords
    if request.relevance_keywords_override:
        score_basis = [s.strip() for s in request.relevance_keywords_override
                       if s and len(s.strip()) >= 2]
        basis_source = "override"
    else:
        saved = get_ad_account_relevance_keywords(user_id, str(cid))
        if saved:
            score_basis = saved
            basis_source = "saved"
        else:
            score_basis = [s for s in (pool.list_user_seeds(cid) or []) if s and len(s) >= 2]
            basis_source = "user_seed_fallback"

    if not score_basis:
        raise HTTPException(
            status_code=400,
            detail=(
                "점수 기준 키워드 없음 — '연관성 기준 키워드' 입력 또는 user_seed 추가 후 재시도. "
                "예: 피부질환,피부,피부과,아토피,여드름"
            ),
        )
    user_seeds = score_basis  # 이하 코드와 호환 (변수명 유지)

    with _sqlite3.connect(reg.db_path) as conn:
        rows = conn.execute(
            "SELECT keyword, ncc_keyword_id FROM registered_keywords "
            "WHERE account_customer_id=? AND ncc_keyword_id IS NOT NULL",
            (cid,),
        ).fetchall()

    # 점수 매김 — atoms 1회 precompute (95k KW 호출 시 atoms 95k 번 재빌드 → GIL 폭주 방지).
    # PERF: 95k × 30 atoms = 2.85M ops. asyncio.to_thread 로 워커 thread 분리해
    # 이벤트 루프 보호 (fly.io health check timeout 차단).
    def _score_all() -> Tuple[List[Tuple[str, str, int]], Dict[int, int]]:
        atoms_3plus: set = set()
        atoms_2: set = set()
        for s in user_seeds:
            if not s or len(s) < 2:
                continue
            if len(s) >= 4:
                atoms_3plus.add(s)
            for n in (2, 3):
                for i in range(len(s) - n + 1):
                    a = s[i:i + n]
                    (atoms_2 if len(a) == 2 else atoms_3plus).add(a)
        _scored: List[Tuple[str, str, int]] = []
        _dist: Dict[int, int] = {}
        for kw_text, kid in rows:
            if not kw_text:
                _scored.append((kid, kw_text or "", 0))
                _dist[0] = _dist.get(0, 0) + 1
                continue
            sc = 0
            full = False
            for s in user_seeds:
                if not s or len(s) < 2:
                    continue
                if s in kw_text:
                    sc = 100; full = True; break
                if kw_text in s:
                    sc = 95; full = True; break
            if not full:
                n_3 = sum(1 for a in atoms_3plus if a in kw_text)
                n_2 = sum(1 for a in atoms_2 if a in kw_text)
                sc = min(95, min(80, n_3 * 20) + min(30, n_2 * 5))
            _scored.append((kid, kw_text, sc))
            bucket = (sc // 10) * 10
            _dist[bucket] = _dist.get(bucket, 0) + 1
        return _scored, _dist

    _t_db = _t.monotonic() - _t0
    scored, score_dist = await asyncio.to_thread(_score_all)
    _t_score = _t.monotonic() - _t0 - _t_db
    # 앵커 모드 — required_tokens 있으면 (앵커없음 OR negative) 가 삭제기준(점수 무시). 진짜 대출 보존.
    _req_tok = []; _neg_tok = []
    try:
        from database.naver_ad_db import get_domain_profile as _gdp_cbs
        _pf_cbs = _gdp_cbs(user_id, str(cid)) or {}
        _req_tok = [t for t in _pf_cbs.get("required_tokens", []) if t and len(t) >= 2]
        _neg_tok = [n for n in _pf_cbs.get("negative_keywords", []) if n and len(n) >= 2]
    except Exception:
        pass
    if _req_tok:
        targets = [
            (kid, kw, s) for kid, kw, s in scored
            if kw and (not any(rt in kw for rt in _req_tok)
                       or (_neg_tok and any(nt in kw for nt in _neg_tok)))
        ]
    else:
        # 점수<threshold (Option B: boundary 보존) 또는 negative 포함(substring 오매칭 off-domain 차단)
        targets = [
            (kid, kw, s) for kid, kw, s in scored
            if s < threshold or (_neg_tok and kw and any(nt in kw for nt in _neg_tok))
        ]
    targets.sort(key=lambda x: x[2])  # 무관한 것부터
    targets_capped = targets[:max_delete]
    logger.warning(
        f"[cleanup-by-score] uid={user_id} cid={cid} dry_run={dry_run} "
        f"db_query={_t_db:.2f}s score={_t_score:.2f}s "
        f"total={len(scored)} below={len(targets)} threshold={threshold} "
        f"basis={basis_source} basis_count={len(user_seeds)} "
        f"basis_sample={user_seeds[:5]}"
    )

    if dry_run:
        # 화면 표시용 — targets 전체 (max_delete 적용 전) 중 max 1000 개. keyword_id 포함해서
        # frontend 에서 체크박스 선택 후 /clicked-keywords/bulk-delete 로 삭제 가능.
        DISPLAY_LIMIT = 1000
        return {
            "success": True,
            "dry_run": True,
            "customer_id": cid,
            "threshold": threshold,
            "total_registered": len(scored),
            "score_distribution": dict(sorted(score_dist.items())),
            "targets_below_threshold": len(targets),
            "will_delete_now": len(targets_capped),
            "max_delete": max_delete,
            "displayed": min(len(targets), DISPLAY_LIMIT),
            "targets": [
                {"keyword_id": kid, "keyword": kw, "score": s}
                for kid, kw, s in targets[:DISPLAY_LIMIT]
            ],
        }

    if not targets_capped:
        return {
            "success": True, "dry_run": False,
            "customer_id": cid, "threshold": threshold,
            "queued_targets": 0, "message": f"임계값 {threshold} 이하 등록 KW 없음",
        }

    client = NaverAdApiClient()
    client.customer_id = account["customer_id"]
    client.api_key = account["api_key"]
    client.secret_key = account["secret_key"]

    # 동시 실행 방어 — 같은 광고주에서 이미 bulk cleanup 진행 중이면 409.
    # 연타/멀티탭에서 50k 작업이 N배 쌓이면 event loop CPU + Naver rate limit 사고.
    if cid in _BULK_CLEANUP_RUNNING:
        raise HTTPException(
            status_code=409,
            detail=(
                f"이 광고주 (cid={cid}) 의 일괄 삭제 작업이 이미 진행 중입니다. "
                f"완료까지 기다려주세요 (예상 {round(len(targets_capped) * 0.18 / 60, 1)}분)."
            ),
        )

    async def _run():
        _BULK_CLEANUP_RUNNING.add(cid)
        try:
            n_del, n_pause, n_fail = 0, 0, 0
            affected: List[str] = []
            for kid, kw_text, _s in targets_capped:
                try:
                    await client.delete_keyword(kid)
                    with _sqlite3.connect(reg.db_path) as c:
                        c.execute(
                            "DELETE FROM registered_keywords "
                            "WHERE account_customer_id=? AND ncc_keyword_id=?",
                            (cid, kid),
                        )
                    n_del += 1
                    affected.append(kw_text)
                except Exception:
                    try:
                        await client.pause_keyword(kid)
                        n_pause += 1
                        affected.append(kw_text)
                    except Exception:
                        n_fail += 1
                await asyncio.sleep(0.15)
            if affected:
                pool.mark_rejected_by_naver(
                    cid,
                    [{"keyword": kw, "reason": f"수동 점수 정리(≤{threshold})"} for kw in affected],
                )
            try:
                pool.record_run(
                    user_id, cid, "inspect",
                    "success" if n_del > 0 else "no_new",
                    registered=0, failed=n_fail, skipped=n_del,
                    seeds_count=len(targets_capped),
                    error_message=(
                        f"수동 점수 정리 (점수≤{threshold}) — "
                        f"DELETE {n_del} / PAUSE {n_pause} / 실패 {n_fail}"
                    ),
                )
            except Exception:
                pass
            record_auto_cleanup_run(user_id, str(cid), n_del + n_pause)
            logger.warning(
                f"[manual-cleanup] uid={user_id} cid={cid} thr={threshold} "
                f"→ del={n_del} pause={n_pause} fail={n_fail}"
            )
        finally:
            _BULK_CLEANUP_RUNNING.discard(cid)

    background_tasks.add_task(_run)
    return {
        "success": True,
        "dry_run": False,
        "customer_id": cid,
        "threshold": threshold,
        "queued_targets": len(targets_capped),
        "below_threshold_total": len(targets),
        "estimated_minutes": round(len(targets_capped) * 0.18 / 60, 1),
        "message": f"백그라운드 실행 시작 — {len(targets_capped)}개 KW 삭제 진행 (예상 {round(len(targets_capped) * 0.18 / 60, 1)}분)",
    }


class ReactivateFailedRequest(BaseModel):
    threshold: int = Field(50, ge=0, le=95, description="이 점수 이상(온도메인)만 pending 재활성화")
    min_volume: int = Field(10, ge=0, le=100000, description="월 검색량 최소 (실볼륨만)")
    max_reactivate: int = Field(50000, ge=0, le=200000, description="이번 호출 최대 재활성화 수")
    dry_run: bool = Field(True)
    relevance_keywords_override: Optional[List[str]] = None
    include_statuses: Optional[List[str]] = Field(
        None, description="재활성화 대상 status (기본 ['failed']; deleted 는 과거 off-domain 퍼지분이라 권장 제외)"
    )
    phantom_registered: bool = Field(
        False,
        description="True 면 status='registered'인데 라이브 추적(registered_keywords.ncc_keyword_id)이 없는 phantom 행만 스캔 — reconcile 버그로 등록 처리됐으나 실제 네이버엔 없는 것 재등록. include_statuses 무시.",
    )


@router.post("/keyword-pool/registered/reactivate-failed")
async def keyword_pool_reactivate_failed(
    request: ReactivateFailedRequest,
    customer_id: Optional[str] = None,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """잠든 failed(옵션 deleted/rejected) 키워드 중 온도메인(relevance≥threshold)을 pending 으로 되살림.

    10만 채우기 supply 보충 — 이미 발굴+검색량 검증된 키워드 재활용 (신규 발굴 0, dedup 무관).
    드리프트 방지: relevance 게이트 통과분만. deleted 는 기본 제외 (과거 off-domain 퍼지 부활 차단).
    dry_run=true: 점수 분포 + 대상 미리보기. false: status='pending' UPDATE → register cron(30s) 소진.
    """
    import sqlite3 as _sqlite3
    import time as _t
    _t0 = _t.monotonic()

    threshold = max(0, min(95, int(request.threshold)))
    min_volume = max(0, int(request.min_volume))
    max_reactivate = max(0, min(200000, int(request.max_reactivate)))
    dry_run = bool(request.dry_run)
    allowed = {"failed", "deleted", "rejected_by_naver"}
    statuses = [s for s in (request.include_statuses or ["failed"]) if s in allowed] or ["failed"]

    account = _resolve_account(user_id, customer_id)
    if not account or not account.get("is_connected"):
        raise HTTPException(status_code=400, detail="광고 계정 미연결")
    cid = int(account.get("customer_id"))

    pool = get_keyword_pool_db()

    from database.naver_ad_db import get_ad_account_relevance_keywords
    if request.relevance_keywords_override:
        score_basis = [s.strip() for s in request.relevance_keywords_override if s and len(s.strip()) >= 2]
        basis_source = "override"
    else:
        saved = get_ad_account_relevance_keywords(user_id, str(cid))
        if saved:
            score_basis = saved; basis_source = "saved"
        else:
            score_basis = [s for s in (pool.list_user_seeds(cid) or []) if s and len(s) >= 2]
            basis_source = "user_seed_fallback"
    if not score_basis:
        raise HTTPException(status_code=400, detail="점수 기준 키워드 없음 — relevance_keywords 저장 또는 override 필요")
    user_seeds = score_basis

    if request.phantom_registered:
        # phantom = pool.status='registered' 인데 registered_keywords(별도 DB)에 ncc_id 없음.
        # 두 DB라 JOIN 불가 → Python 에서 live set 대조.
        reg = get_registered_keywords_db()
        with _sqlite3.connect(reg.db_path, timeout=30.0) as rc:
            live_set = {
                k for (k,) in rc.execute(
                    "SELECT keyword FROM registered_keywords "
                    "WHERE account_customer_id=? AND ncc_keyword_id IS NOT NULL",
                    (cid,),
                ).fetchall()
            }
        with _sqlite3.connect(pool.db_path, timeout=30.0) as conn:
            all_reg = conn.execute(
                """SELECT id, keyword, COALESCE(monthly_total,0)
                   FROM naverad_keyword_pool
                   WHERE account_customer_id=? AND status='registered'
                     AND COALESCE(monthly_total,0) >= ?""",
                (cid, min_volume),
            ).fetchall()
        rows = [(rid, kw, mt) for rid, kw, mt in all_reg if kw not in live_set]
        statuses = ["registered(phantom)"]  # 로깅용
    else:
        placeholders = ",".join("?" * len(statuses))
        with _sqlite3.connect(pool.db_path, timeout=30.0) as conn:
            rows = conn.execute(
                f"""SELECT id, keyword, COALESCE(monthly_total,0)
                    FROM naverad_keyword_pool
                    WHERE account_customer_id=?
                      AND status IN ({placeholders})
                      AND COALESCE(monthly_total,0) >= ?""",
                (cid, *statuses, min_volume),
            ).fetchall()

    # cleanup-by-score 와 동일한 atom 점수 (precompute 1회) — to_thread 로 event loop 보호.
    def _score_all():
        atoms_3plus: set = set()
        atoms_2: set = set()
        for s in user_seeds:
            if not s or len(s) < 2:
                continue
            if len(s) >= 4:
                atoms_3plus.add(s)
            for n in (2, 3):
                for i in range(len(s) - n + 1):
                    a = s[i:i + n]
                    (atoms_2 if len(a) == 2 else atoms_3plus).add(a)
        keep: List[Tuple[int, str, int, int]] = []
        dist: Dict[int, int] = {}
        for rid, kw, mt in rows:
            if not kw:
                dist[0] = dist.get(0, 0) + 1
                continue
            sc = 0
            full = False
            for s in user_seeds:
                if not s or len(s) < 2:
                    continue
                if s in kw:
                    sc = 100; full = True; break
                if kw in s:
                    sc = 95; full = True; break
            if not full:
                n_3 = sum(1 for a in atoms_3plus if a in kw)
                n_2 = sum(1 for a in atoms_2 if a in kw)
                sc = min(95, min(80, n_3 * 20) + min(30, n_2 * 5))
            bucket = (sc // 10) * 10
            dist[bucket] = dist.get(bucket, 0) + 1
            if sc >= threshold:
                keep.append((rid, kw, mt, sc))
        return keep, dist

    keep, dist = await asyncio.to_thread(_score_all)
    keep.sort(key=lambda x: (-x[3], -x[2]))  # 온도메인·고볼륨 우선
    capped = keep[:max_reactivate]
    logger.warning(
        f"[reactivate-failed] uid={user_id} cid={cid} dry_run={dry_run} statuses={statuses} "
        f"scanned={len(rows)} on_domain={len(keep)} thr={threshold} minvol={min_volume} "
        f"basis={basis_source}({len(user_seeds)}) elapsed={_t.monotonic()-_t0:.2f}s"
    )

    if dry_run:
        return {
            "success": True, "dry_run": True, "customer_id": cid,
            "basis_source": basis_source, "basis_count": len(user_seeds),
            "scanned_statuses": statuses, "min_volume": min_volume, "threshold": threshold,
            "total_scanned": len(rows),
            "score_distribution": dict(sorted(dist.items())),
            "on_domain_reactivatable": len(keep),
            "will_reactivate_now": len(capped),
            "samples": [{"keyword": kw, "score": sc, "mt": mt} for _, kw, mt, sc in capped[:30]],
        }

    if not capped:
        return {"success": True, "dry_run": False, "customer_id": cid,
                "reactivated": 0, "message": f"score≥{threshold} 재활성화 대상 없음"}

    ids = [rid for rid, _, _, _ in capped]
    n = 0
    with _sqlite3.connect(pool.db_path, timeout=30.0) as conn:
        for i in range(0, len(ids), 900):
            chunk = ids[i:i + 900]
            ph = ",".join("?" * len(chunk))
            cur = conn.execute(
                f"""UPDATE naverad_keyword_pool
                    SET status='pending', error_message=NULL, registered_at=NULL
                    WHERE account_customer_id=? AND id IN ({ph})""",
                (cid, *chunk),
            )
            n += cur.rowcount or 0
        conn.commit()
    logger.warning(f"[reactivate-failed] uid={user_id} cid={cid} → reactivated={n}")
    return {
        "success": True, "dry_run": False, "customer_id": cid,
        "reactivated": n, "on_domain_total": len(keep),
        "scanned_statuses": statuses, "threshold": threshold,
        "message": f"{n}개 → pending. register cron(30초)이 순차 등록합니다.",
    }


# ============ 긴급 drift 일괄 정리 — registered + user_seed + pending 한 번에 ============
# cleanup-by-score 는 registered 만. 100k drift 사고 시 user_seed 도 오염돼 있어 그것도
# 같이 갈아야 다음 amplify 가 또 차 KW 안 만듦. 이 endpoint 는 3가지 정리를 한 번에:
#  1) registered (registered_keywords + naverad_keyword_pool status='registered') 점수≤thr Naver DELETE
#  2) user_seed (source='user_seed' AND status NOT IN registered/failed) 점수≤thr DB DELETE
#  3) pending (status='pending') 점수≤thr DB DELETE (등록 전 차단)

@router.post("/keyword-pool/admin/purge-drift")
async def keyword_pool_admin_purge_drift(
    background_tasks: BackgroundTasks,
    customer_id: int = Query(..., description="대상 광고주 customer_id"),
    threshold: int = Query(30, ge=0, le=95),
    max_delete_registered: int = Query(50000, ge=0, le=100000),
    dry_run: bool = Query(False),
    relevance_keywords: Optional[str] = Query(
        None,
        description="콤마구분 도메인 KW (예: 아토피,습진,건선,한의원,한방). 비우면 ad_accounts.relevance_keywords 사용",
    ),
):
    """긴급 drift 정리 — registered + user_seed + pending 한 번에 (인증 없음, customer_id 명시).

    cleanup-by-score 는 registered 만 정리 → user_seed 가 오염된 채로 남으면 다음 amplify 가
    또 drift 키워드 생성 → 정리 의미 없음. 이 endpoint 는 3 stage 동시 처리:

    Stage 1 (즉시): user_seed + pending DB cleanup (네이버 호출 없음, 1초)
    Stage 2 (background): registered Naver DELETE (KW × 0.18s × 부하)

    relevance_keywords 우선순위: query param > ad_accounts.relevance_keywords > user_seed.
    user_seed 폴백은 위험 (이미 오염) — query param 또는 saved 권장.
    """
    from services.naver_ad_service import NaverAdApiClient
    from database.naver_ad_db import (
        list_connected_ad_accounts,
        get_ad_account_relevance_keywords,
        record_auto_cleanup_run,
    )
    import sqlite3 as _sqlite3
    import time as _t

    t0 = _t.monotonic()
    accts = list_connected_ad_accounts() or []
    matched = next((a for a in accts if int(a.get("customer_id") or 0) == int(customer_id)), None)
    if not matched:
        raise HTTPException(status_code=404, detail=f"customer_id {customer_id} 미연결")
    uid = int(matched.get("user_id") or 0)

    # 도메인 기준 빌드
    if relevance_keywords:
        score_basis = [s.strip() for s in relevance_keywords.replace("\n", ",").split(",") if s.strip() and len(s.strip()) >= 2]
        basis_source = "query"
    else:
        saved = get_ad_account_relevance_keywords(uid, str(customer_id)) or []
        if saved:
            score_basis = saved
            basis_source = "saved"
        else:
            raise HTTPException(
                status_code=400,
                detail="relevance_keywords 없음 (query 또는 saved). 예: ?relevance_keywords=아토피,습진,한의원,한방",
            )
    if len(score_basis) < 3:
        raise HTTPException(status_code=400, detail=f"기준 KW 부족 ({len(score_basis)}/3). 최소 3개 권장.")

    pool = get_keyword_pool_db()
    reg = get_registered_keywords_db()

    # ===== Stage 1: user_seed + pending DB cleanup (즉시) =====
    user_seed_deleted = 0
    pending_deleted = 0
    sample_user_seed: List[str] = []
    sample_pending: List[str] = []

    with _sqlite3.connect(pool.db_path) as conn:
        conn.row_factory = _sqlite3.Row

        # user_seed 정리
        user_seed_rows = conn.execute(
            """SELECT keyword FROM naverad_keyword_pool
               WHERE account_customer_id=? AND source='user_seed'
                 AND status NOT IN ('registered', 'failed')""",
            (customer_id,),
        ).fetchall()
        user_seed_to_delete: List[str] = []
        for r in user_seed_rows:
            kw = r["keyword"]
            sc = _compute_relevance_score(kw, score_basis)
            if sc < threshold:  # Option B: boundary 보존
                user_seed_to_delete.append(kw)

        # pending 정리
        pending_rows = conn.execute(
            """SELECT keyword FROM naverad_keyword_pool
               WHERE account_customer_id=? AND status='pending'""",
            (customer_id,),
        ).fetchall()
        pending_to_delete: List[str] = []
        for r in pending_rows:
            kw = r["keyword"]
            sc = _compute_relevance_score(kw, score_basis)
            if sc < threshold:  # Option B: boundary 보존
                pending_to_delete.append(kw)

        sample_user_seed = user_seed_to_delete[:10]
        sample_pending = pending_to_delete[:10]

        if not dry_run:
            # user_seed: source='user_seed' AND status NOT registered/failed → DELETE
            CHUNK = 500
            for i in range(0, len(user_seed_to_delete), CHUNK):
                chunk = user_seed_to_delete[i:i + CHUNK]
                placeholders = ",".join("?" * len(chunk))
                cur = conn.execute(
                    f"""DELETE FROM naverad_keyword_pool
                        WHERE account_customer_id=? AND source='user_seed'
                          AND status NOT IN ('registered', 'failed')
                          AND keyword IN ({placeholders})""",
                    (customer_id, *chunk),
                )
                user_seed_deleted += cur.rowcount

            # pending: status='pending' → DELETE
            for i in range(0, len(pending_to_delete), CHUNK):
                chunk = pending_to_delete[i:i + CHUNK]
                placeholders = ",".join("?" * len(chunk))
                cur = conn.execute(
                    f"""DELETE FROM naverad_keyword_pool
                        WHERE account_customer_id=? AND status='pending'
                          AND keyword IN ({placeholders})""",
                    (customer_id, *chunk),
                )
                pending_deleted += cur.rowcount

    # ===== Stage 2: registered Naver DELETE (background) =====
    with _sqlite3.connect(reg.db_path) as conn:
        conn.row_factory = _sqlite3.Row
        reg_rows = conn.execute(
            "SELECT keyword, ncc_keyword_id FROM registered_keywords "
            "WHERE account_customer_id=? AND ncc_keyword_id IS NOT NULL AND removed_at IS NULL",
            (customer_id,),
        ).fetchall()

    def _score_reg() -> List[Tuple[str, str, int]]:
        atoms_3plus: set = set()
        atoms_2: set = set()
        for s in score_basis:
            if not s or len(s) < 2:
                continue
            if len(s) >= 4:
                atoms_3plus.add(s)
            for n in (2, 3):
                for i in range(len(s) - n + 1):
                    a = s[i:i + n]
                    (atoms_2 if len(a) == 2 else atoms_3plus).add(a)
        out: List[Tuple[str, str, int]] = []
        for r in reg_rows:
            kw_text = r["keyword"]
            kid = r["ncc_keyword_id"]
            if not kw_text:
                out.append((kid, "", 0))
                continue
            sc = 0
            full = False
            for s in score_basis:
                if not s or len(s) < 2:
                    continue
                if s in kw_text:
                    sc = 100; full = True; break
                if kw_text in s:
                    sc = 95; full = True; break
            if not full:
                n_3 = sum(1 for a in atoms_3plus if a in kw_text)
                n_2 = sum(1 for a in atoms_2 if a in kw_text)
                sc = min(95, min(80, n_3 * 20) + min(30, n_2 * 5))
            out.append((kid, kw_text, sc))
        return out

    reg_scored = await asyncio.to_thread(_score_reg)
    reg_targets = [(kid, kw, s) for kid, kw, s in reg_scored if s < threshold]  # Option B: boundary 보존
    reg_targets.sort(key=lambda x: x[2])
    reg_capped = reg_targets[:max_delete_registered]

    if dry_run:
        return {
            "success": True,
            "dry_run": True,
            "customer_id": customer_id,
            "threshold": threshold,
            "basis_source": basis_source,
            "basis_count": len(score_basis),
            "basis_sample": score_basis[:8],
            "user_seed_total": len(user_seed_rows),
            "user_seed_to_delete": len(user_seed_to_delete),
            "user_seed_samples": sample_user_seed,
            "pending_total": len(pending_rows),
            "pending_to_delete": len(pending_to_delete),
            "pending_samples": sample_pending,
            "registered_total": len(reg_scored),
            "registered_below_threshold": len(reg_targets),
            "registered_will_delete_now": len(reg_capped),
            "registered_samples": [{"keyword": kw, "score": s} for _kid, kw, s in reg_capped[:10]],
            "estimated_minutes": round(len(reg_capped) * 0.18 / 60, 1),
        }

    # Stage 2 background — registered Naver DELETE
    account = matched
    client = NaverAdApiClient()
    client.customer_id = account.get("customer_id")
    client.api_key = account.get("api_key")
    client.secret_key = account.get("secret_key")

    async def _run_reg_purge():
        n_del, n_pause, n_fail = 0, 0, 0
        affected: List[str] = []
        for kid, kw_text, _s in reg_capped:
            try:
                await client.delete_keyword(kid)
                with _sqlite3.connect(reg.db_path) as c:
                    c.execute(
                        "DELETE FROM registered_keywords "
                        "WHERE account_customer_id=? AND ncc_keyword_id=?",
                        (customer_id, kid),
                    )
                n_del += 1
                affected.append(kw_text)
            except Exception:
                try:
                    await client.pause_keyword(kid)
                    n_pause += 1
                    affected.append(kw_text)
                except Exception:
                    n_fail += 1
            await asyncio.sleep(0.15)
        if affected:
            pool.mark_rejected_by_naver(
                customer_id,
                [{"keyword": kw, "reason": f"purge-drift(score≤{threshold})"} for kw in affected],
            )
        try:
            record_auto_cleanup_run(uid, str(customer_id), n_del + n_pause)
        except Exception:
            pass
        logger.warning(
            f"[purge-drift] uid={uid} cid={customer_id} thr={threshold} "
            f"basis={basis_source}({len(score_basis)}) → "
            f"user_seed_del={user_seed_deleted} pending_del={pending_deleted} "
            f"reg_del={n_del} reg_pause={n_pause} reg_fail={n_fail}"
        )

    background_tasks.add_task(_run_reg_purge)
    return {
        "success": True,
        "dry_run": False,
        "customer_id": customer_id,
        "threshold": threshold,
        "basis_source": basis_source,
        "basis_count": len(score_basis),
        "user_seed_deleted": user_seed_deleted,
        "pending_deleted": pending_deleted,
        "registered_queued": len(reg_capped),
        "registered_below_threshold_total": len(reg_targets),
        "estimated_minutes": round(len(reg_capped) * 0.18 / 60, 1),
        "message": (
            f"즉시 정리: user_seed -{user_seed_deleted}, pending -{pending_deleted}. "
            f"백그라운드 정리: registered {len(reg_capped)}개 Naver DELETE 진행 "
            f"(예상 {round(len(reg_capped) * 0.18 / 60, 1)}분)."
        ),
        "stage1_duration_ms": int((_t.monotonic() - t0) * 1000),
    }


# ============ 비도메인 시드 일괄 정리 ============
# 과거 POOL_DOMAIN_TOKENS bridge 누수로 의료 광고주(소잠한의원)에 "렌탈/임대/요가/피자
# /펜션/점포/파우치" 같은 무관 시드들이 박혀있음. cold_start-only fix 이후 신규는 안
# 들어오지만, 이미 등록된 KW (시드별 1500~2200개) 가 남아있어 광고비/도메인 평판 손실.
# 시드 단위로 그 lineage 의 모든 KW 일괄 DELETE.

class CleanupNonDomainSeedsRequest(BaseModel):
    domain_keywords: Optional[List[str]] = Field(
        None,
        description="도메인 정의 — 이 키워드와 atom 매칭 안 되는 시드는 모두 비도메인. "
                    "미입력 시 광고주 저장 relevance_keywords → user_seed 폴백.",
    )
    dry_run: bool = Field(True, description="True 면 삭제 대상 미리보기만, False 면 실제 삭제 시작.")
    max_delete: int = Field(5000, ge=0, le=20000, description="이번 실행 KW 삭제 상한 (네이버 API rate)")


@router.post("/keyword-pool/seeds/cleanup-non-domain")
async def cleanup_non_domain_seeds(
    request: CleanupNonDomainSeedsRequest,
    background_tasks: BackgroundTasks,
    customer_id: Optional[str] = None,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """비도메인 시드 lineage 일괄 정리 — 과거 POOL bridge 누수 잔재 제거.

    1. domain_keywords 로 도메인 토큰셋 빌드
    2. naverad_keyword_pool 의 distinct seed (status=registered) 조회 + KW 수
    3. 도메인 atom 안 맞는 seed = 비도메인 → 그 lineage 모든 KW DELETE 대상
    4. dry_run=True: 시드/KW 카운트 미리보기. dry_run=False: 백그라운드 삭제.
    """
    from services.naver_ad_service import NaverAdApiClient
    from database.naver_ad_db import get_ad_account_relevance_keywords, record_auto_cleanup_run
    import sqlite3 as _sqlite3
    import time as _t

    account = _resolve_account(user_id, customer_id)
    if not account or not account.get("is_connected"):
        raise HTTPException(status_code=400, detail="광고 계정 미연결")
    cid = int(account.get("customer_id"))

    pool = get_keyword_pool_db()
    reg = get_registered_keywords_db()

    # 1) 도메인 키워드 결정
    if request.domain_keywords:
        domain_kws = [s.strip() for s in request.domain_keywords if s and len(s.strip()) >= 2]
        basis_source = "input"
    else:
        saved = get_ad_account_relevance_keywords(user_id, str(cid))
        if saved:
            domain_kws = saved
            basis_source = "saved_relevance"
        else:
            domain_kws = [s for s in (pool.list_user_seeds(cid) or []) if s and len(s) >= 2]
            basis_source = "user_seed_fallback"
    if not domain_kws:
        raise HTTPException(
            status_code=400,
            detail="도메인 키워드 없음 — domain_keywords 입력 또는 광고주 relevance_keywords 저장 필요.",
        )
    domain_tokens = _build_domain_token_set(domain_kws) | _build_seed_atoms(domain_kws)

    def _matches_domain(seed: str) -> bool:
        if not seed or len(seed) < 2:
            return False
        s = seed.replace(" ", "")
        return any(t in s for t in domain_tokens)

    # 2) 시드별 등록 KW 수 집계 (status=registered)
    with _sqlite3.connect(pool.db_path) as conn:
        seed_rows = conn.execute(
            """SELECT coalesce(seed,''), COUNT(*) AS n
               FROM naverad_keyword_pool
               WHERE account_customer_id=? AND status='registered'
               GROUP BY coalesce(seed,'')
               ORDER BY n DESC""",
            (cid,),
        ).fetchall()

    domain_seeds: List[Tuple[str, int]] = []
    non_domain_seeds: List[Tuple[str, int]] = []
    for s, n in seed_rows:
        if not s:
            non_domain_seeds.append((s, n))
            continue
        (domain_seeds if _matches_domain(s) else non_domain_seeds).append((s, n))

    # 3) 비도메인 시드의 KW + ncc_keyword_id 조회 (JOIN)
    if not non_domain_seeds:
        return {
            "success": True, "dry_run": request.dry_run, "customer_id": cid,
            "basis_source": basis_source, "domain_keywords_count": len(domain_kws),
            "domain_seeds": len(domain_seeds), "non_domain_seeds": 0,
            "total_targets": 0,
            "message": "비도메인 시드 없음 — 모든 등록 시드가 도메인 매칭됨",
        }

    non_domain_seed_set = {s for s, _ in non_domain_seeds}
    placeholders = ",".join("?" * len(non_domain_seed_set))
    with _sqlite3.connect(pool.db_path) as conn:
        conn.row_factory = _sqlite3.Row
        kw_rows = conn.execute(
            f"""SELECT p.keyword, p.seed, r.ncc_keyword_id
                FROM naverad_keyword_pool p
                LEFT JOIN registered_keywords r
                  ON r.account_customer_id = p.account_customer_id
                 AND r.keyword = p.keyword
                WHERE p.account_customer_id = ?
                  AND p.status = 'registered'
                  AND coalesce(p.seed,'') IN ({placeholders})
                  AND r.ncc_keyword_id IS NOT NULL""",
            (cid, *non_domain_seed_set),
        ).fetchall()
    targets = [(r["ncc_keyword_id"], r["keyword"], r["seed"]) for r in kw_rows]
    targets_capped = targets[:max(0, min(20000, int(request.max_delete)))]

    if request.dry_run:
        # Top 20 비도메인 시드 + 대상 KW sample
        return {
            "success": True, "dry_run": True, "customer_id": cid,
            "basis_source": basis_source,
            "domain_keywords_count": len(domain_kws),
            "domain_keywords_sample": domain_kws[:10],
            "domain_tokens_count": len(domain_tokens),
            "domain_seeds": len(domain_seeds),
            "non_domain_seeds": len(non_domain_seeds),
            "non_domain_top": [
                {"seed": s, "registered_count": n} for s, n in non_domain_seeds[:30]
            ],
            "total_targets": len(targets),
            "will_delete_now": len(targets_capped),
            "max_delete": request.max_delete,
            "estimated_minutes": round(len(targets_capped) * 0.18 / 60, 1),
            "samples": [
                {"keyword": kw, "seed": sd}
                for _, kw, sd in targets[:20]
            ],
        }

    if not targets_capped:
        return {
            "success": True, "dry_run": False, "customer_id": cid,
            "queued_targets": 0, "message": "삭제 대상 KW 없음",
        }

    client = NaverAdApiClient()
    client.customer_id = account["customer_id"]
    client.api_key = account["api_key"]
    client.secret_key = account["secret_key"]

    async def _run():
        n_del, n_pause, n_fail = 0, 0, 0
        affected: List[str] = []
        for kid, kw_text, _seed in targets_capped:
            try:
                await client.delete_keyword(kid)
                with _sqlite3.connect(reg.db_path) as c:
                    c.execute(
                        "DELETE FROM registered_keywords "
                        "WHERE account_customer_id=? AND ncc_keyword_id=?",
                        (cid, kid),
                    )
                with _sqlite3.connect(pool.db_path) as c:
                    c.execute(
                        "UPDATE naverad_keyword_pool SET status='deleted' "
                        "WHERE account_customer_id=? AND keyword=?",
                        (cid, kw_text),
                    )
                n_del += 1
                affected.append(kw_text)
            except Exception:
                try:
                    await client.pause_keyword(kid)
                    n_pause += 1
                    affected.append(kw_text)
                except Exception:
                    n_fail += 1
            await asyncio.sleep(0.15)
        try:
            pool.record_run(
                user_id, cid, "inspect",
                "success" if n_del > 0 else "no_new",
                registered=0, failed=n_fail, skipped=n_del,
                seeds_count=len(non_domain_seed_set),
                error_message=(
                    f"비도메인 시드 정리 ({len(non_domain_seed_set)} 시드) — "
                    f"DELETE {n_del} / PAUSE {n_pause} / 실패 {n_fail}"
                ),
            )
        except Exception:
            pass
        record_auto_cleanup_run(user_id, str(cid), n_del + n_pause)
        logger.warning(
            f"[cleanup-non-domain] uid={user_id} cid={cid} "
            f"non_domain_seeds={len(non_domain_seed_set)} → del={n_del} pause={n_pause} fail={n_fail}"
        )

    background_tasks.add_task(_run)
    return {
        "success": True, "dry_run": False, "customer_id": cid,
        "queued_targets": len(targets_capped),
        "non_domain_seeds": len(non_domain_seed_set),
        "estimated_minutes": round(len(targets_capped) * 0.18 / 60, 1),
        "message": (
            f"백그라운드 실행 시작 — 비도메인 시드 {len(non_domain_seed_set)}개의 "
            f"KW {len(targets_capped)}개 삭제 진행 (예상 {round(len(targets_capped) * 0.18 / 60, 1)}분)"
        ),
    }


# ============ 네이버 ↔ DB 한도 sync ============
# 사용자가 네이버 광고 콘솔에서 직접 캠페인/광고그룹 삭제 → 우리 DB row 는 stale.
# 한도 사용량 표시가 잘못됨 (네이버 active != DB count). 이 endpoint 가 cross-check
# 후 사라진 캠페인의 DB row 삭제.

@router.post("/keyword-pool/admin/reconcile-naver")
async def keyword_pool_reconcile_naver(
    customer_id: Optional[str] = None,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """네이버 광고 콘솔에서 직접 삭제한 캠페인 — 우리 DB 정리. 한도 사용량 정확화."""
    from services.naver_ad_service import NaverAdApiClient
    import sqlite3 as _sqlite3
    from asyncio import sleep as _sleep

    account = _resolve_account(user_id, customer_id)
    if not account or not account.get("is_connected"):
        raise HTTPException(status_code=400, detail="광고 계정 미연결")
    cid = int(account.get("customer_id"))

    client = NaverAdApiClient()
    client.customer_id = account["customer_id"]
    client.api_key = account["api_key"]
    client.secret_key = account["secret_key"]

    # 1) 네이버 active 캠페인 list
    try:
        campaigns = await client.get_campaigns()
        live_campaign_ids = set(
            c.get("nccCampaignId") for c in (campaigns or [])
            if c.get("nccCampaignId")
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"네이버 캠페인 조회 실패: {type(e).__name__}: {str(e)[:200]}",
        )

    reg = get_registered_keywords_db()
    # 2) 우리 DB 의 distinct campaign_id
    with _sqlite3.connect(reg.db_path) as conn:
        rows = conn.execute(
            "SELECT DISTINCT campaign_id FROM registered_keywords "
            "WHERE account_customer_id=? AND campaign_id IS NOT NULL",
            (cid,),
        ).fetchall()
    db_campaign_ids = set(r[0] for r in rows if r[0])

    # SAFETY: 네이버 API 가 빈 응답 (rate limit / 일시 장애) 일 때 DB 통째 wipe 차단.
    # 과거 사고: 50k 일괄 삭제 트래픽 중 reconcile 클릭 → live=[] → db_campaigns 전체가
    # "사라진 캠페인" 으로 분류 → registered_keywords 테이블 전멸 → 한도 0 표시 사고.
    if not live_campaign_ids and db_campaign_ids:
        raise HTTPException(
            status_code=503,
            detail=(
                "네이버 캠페인 list 가 비었음 — API 일시 장애 가능성. "
                f"DB 에는 {len(db_campaign_ids)}개 캠페인 등록됨. "
                "이 상태에서 sync 진행 시 DB 통째 삭제 위험. 잠시 후 재시도."
            ),
        )

    # 3) DB 에 있지만 네이버에 없는 캠페인 → 그 캠페인의 모든 row 삭제
    deleted_campaigns = db_campaign_ids - live_campaign_ids
    n_rows_deleted = 0
    with _sqlite3.connect(reg.db_path) as conn:
        for cid_to_delete in deleted_campaigns:
            cur = conn.execute(
                "DELETE FROM registered_keywords WHERE account_customer_id=? AND campaign_id=?",
                (cid, cid_to_delete),
            )
            n_rows_deleted += cur.rowcount or 0
        conn.commit()

    # 4) 광고그룹 단위 cross-check — 병렬 + sem=8 + 타임아웃 보호.
    # 이전: 100 캠페인 × sequential API 호출 = 60초+ 로 frontend timeout. 병렬화로
    # 단축 (8개 동시 → ~10~15초). 추가로 전체 작업 30초 cap — 초과 시 캠페인 단위 sync 만으로 끝.
    n_orphan_groups = 0
    try:
        live_ad_group_ids: set = set()
        sem_ag = asyncio.Semaphore(8)
        async def _fetch_ag(live_cid: str) -> List[str]:
            async with sem_ag:
                try:
                    if hasattr(client, "get_ad_groups"):
                        ags = await client.get_ad_groups(campaign_id=live_cid)
                        return [ag.get("nccAdgroupId") for ag in (ags or []) if ag.get("nccAdgroupId")]
                except Exception:
                    return []
                return []
        # 30초 안에 끝나는 만큼만 처리 — 더 긴 광고주는 캠페인 sync 로 이미 대부분 정리됨
        try:
            results = await asyncio.wait_for(
                asyncio.gather(*[_fetch_ag(c) for c in list(live_campaign_ids)]),
                timeout=30.0,
            )
            for batch in results:
                live_ad_group_ids.update(batch)
        except asyncio.TimeoutError:
            logger.warning(f"[reconcile] 광고그룹 cross-check 30s 초과 — 캠페인 sync 만 적용")
            live_ad_group_ids = set()  # 부분 결과로 잘못 삭제하지 않도록 비움

        if live_ad_group_ids:
            with _sqlite3.connect(reg.db_path) as conn:
                rows2 = conn.execute(
                    "SELECT DISTINCT ad_group_id FROM registered_keywords "
                    "WHERE account_customer_id=? AND ad_group_id IS NOT NULL",
                    (cid,),
                ).fetchall()
                db_ad_group_ids = set(r[0] for r in rows2 if r[0])
                orphan_ag = db_ad_group_ids - live_ad_group_ids
                for agid in orphan_ag:
                    cur = conn.execute(
                        "DELETE FROM registered_keywords WHERE account_customer_id=? AND ad_group_id=?",
                        (cid, agid),
                    )
                    n_orphan_groups += cur.rowcount or 0
                conn.commit()
    except Exception as e:
        logger.warning(f"[reconcile] 광고그룹 cross-check 실패: {e}")

    # 5) 한도 재계산
    new_active = int((reg.stats(cid) or {}).get("active") or 0)
    logger.warning(
        f"[reconcile] uid={user_id} cid={cid} "
        f"live_campaigns={len(live_campaign_ids)} db_campaigns={len(db_campaign_ids)} "
        f"deleted_campaigns={len(deleted_campaigns)} kw_rows_deleted={n_rows_deleted} "
        f"orphan_ag_kws_deleted={n_orphan_groups} new_active={new_active}"
    )
    return {
        "success": True,
        "live_campaigns": len(live_campaign_ids),
        "db_campaigns": len(db_campaign_ids),
        "deleted_campaigns": len(deleted_campaigns),
        "deleted_kw_rows": n_rows_deleted + n_orphan_groups,
        "new_active": new_active,
    }


@router.post("/keyword-pool/admin/wipe-customer-db")
async def keyword_pool_wipe_customer_db(
    customer_id: Optional[str] = None,
    confirm: str = Query(..., description="WIPE 입력 시에만 실행 (안전장치)"),
    user_id: int = Depends(get_user_id_with_fallback),
):
    """광고주의 registered_keywords + naverad_keyword_pool row 일괄 wipe.

    네이버 광고 콘솔에서 사용자가 KW 들을 직접 일괄 삭제한 경우, 우리 DB sync 용도.
    pool 전체 wipe 라서 새 explode 가 깨끗하게 시작 가능 (이전 'registered'/'failed'
    dedup 안 됨). 캠페인/광고그룹 row 는 건드리지 않음 — Naver 에 존재하면 재사용됨.

    안전: confirm="WIPE" 필수. customer_id 명시 필수.
    """
    if confirm != "WIPE":
        raise HTTPException(status_code=400, detail="confirm=WIPE 명시 필요 (안전장치)")
    if not customer_id:
        raise HTTPException(status_code=400, detail="customer_id 필수")
    import sqlite3 as _sqlite3
    account = _resolve_account(user_id, customer_id)
    if not account:
        raise HTTPException(status_code=400, detail="광고 계정 미연결")
    cid = int(account.get("customer_id"))

    reg = get_registered_keywords_db()
    pool = get_keyword_pool_db()

    n_reg = 0
    n_pool = 0
    with _sqlite3.connect(reg.db_path) as conn:
        cur = conn.execute(
            "DELETE FROM registered_keywords WHERE account_customer_id=?",
            (cid,),
        )
        n_reg = cur.rowcount or 0
        conn.commit()
    with _sqlite3.connect(pool.db_path) as conn:
        cur = conn.execute(
            "DELETE FROM naverad_keyword_pool WHERE account_customer_id=?",
            (cid,),
        )
        n_pool = cur.rowcount or 0
        conn.commit()

    logger.warning(
        f"[admin/wipe-customer-db] uid={user_id} cid={cid} "
        f"registered_rows={n_reg} pool_rows={n_pool}"
    )
    return {
        "success": True,
        "customer_id": cid,
        "registered_rows_deleted": n_reg,
        "pool_rows_deleted": n_pool,
    }


@router.post("/keyword-pool/admin/rebuild-from-naver")
async def keyword_pool_rebuild_from_naver(
    customer_id: Optional[str] = None,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """네이버에 실제 등록된 KW 를 전부 pull → registered_keywords 테이블 재구성.

    복구용. reconcile 버그 (2026-05-19) 로 DB row 전멸 사고 후 한도 사용량 0 표시
    되는 계정을 실제 네이버 상태로 동기화. UPSERT 라서 여러 번 실행해도 안전.
    """
    import sqlite3 as _sqlite3
    from services.naver_ad_service import NaverAdApiClient

    account = _resolve_account(user_id, customer_id)
    if not account or not account.get("is_connected"):
        raise HTTPException(status_code=400, detail="광고 계정 미연결")
    cid = int(account.get("customer_id"))

    client = NaverAdApiClient()
    client.customer_id = account["customer_id"]
    client.api_key = account["api_key"]
    client.secret_key = account["secret_key"]

    # 1) campaigns
    try:
        campaigns = await client.get_campaigns()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"네이버 캠페인 조회 실패: {type(e).__name__}: {str(e)[:200]}")
    live_campaigns = [c for c in (campaigns or []) if c.get("nccCampaignId")]
    if not live_campaigns:
        raise HTTPException(status_code=503, detail="네이버 캠페인 list 가 비었음 — API 일시 장애 가능성")

    # 2) ad_groups (병렬 sem=8)
    sem = asyncio.Semaphore(8)

    async def _fetch_groups(camp_id: str):
        async with sem:
            try:
                ags = await client.get_ad_groups(campaign_id=camp_id) or []
                return camp_id, [ag.get("nccAdgroupId") for ag in ags if ag.get("nccAdgroupId")]
            except Exception as e:
                logger.warning(f"[rebuild] get_ad_groups({camp_id}) 실패: {e}")
                return camp_id, []

    ag_results = await asyncio.gather(*[_fetch_groups(c["nccCampaignId"]) for c in live_campaigns])
    ag_to_camp: Dict[str, str] = {}
    for camp_id, ag_ids in ag_results:
        for ag_id in ag_ids:
            ag_to_camp[ag_id] = camp_id

    if not ag_to_camp:
        raise HTTPException(status_code=503, detail=f"네이버 광고그룹 0개 — 캠페인 {len(live_campaigns)}개 있는데 그룹 못 가져옴")

    # 3) keywords per ad_group (병렬 sem=8)
    async def _fetch_kws(ag_id: str):
        async with sem:
            try:
                return ag_id, (await client.get_keywords(ad_group_id=ag_id) or [])
            except Exception as e:
                logger.warning(f"[rebuild] get_keywords({ag_id}) 실패: {e}")
                return ag_id, []

    kw_results = await asyncio.gather(*[_fetch_kws(ag_id) for ag_id in ag_to_camp.keys()])

    rows: List[Dict] = []
    for ag_id, kws in kw_results:
        camp_id = ag_to_camp.get(ag_id)
        for kw in kws:
            text = (kw.get("keyword") or "").strip()
            if not text:
                continue
            rows.append({
                "keyword": text,
                "ad_group_id": ag_id,
                "campaign_id": camp_id,
                "bid_amt": kw.get("bidAmt"),
                "ncc_keyword_id": kw.get("nccKeywordId"),
            })

    if not rows:
        raise HTTPException(
            status_code=503,
            detail=f"네이버에서 KW 0개 발견 — 캠페인 {len(live_campaigns)}개 / 그룹 {len(ag_to_camp)}개 있는데 KW 없음. 진짜 빈 상태이거나 API 부분 장애.",
        )

    # 4) UPSERT — 기존 row 의 removed_at 도 클리어 (네이버에 실제 있으면 live).
    reg = get_registered_keywords_db()
    with reg._conn() as conn:
        cur = conn.cursor()
        for r in rows:
            try:
                cur.execute(
                    """INSERT INTO registered_keywords
                       (user_id, account_customer_id, keyword, ad_group_id,
                        campaign_id, bid_amt, ncc_keyword_id)
                       VALUES (?, ?, ?, ?, ?, ?, ?)
                       ON CONFLICT(account_customer_id, keyword) DO UPDATE SET
                         removed_at = NULL,
                         ad_group_id = excluded.ad_group_id,
                         campaign_id = excluded.campaign_id,
                         bid_amt = excluded.bid_amt,
                         ncc_keyword_id = excluded.ncc_keyword_id""",
                    (user_id, cid, r["keyword"], r["ad_group_id"], r["campaign_id"],
                     r["bid_amt"], r["ncc_keyword_id"]),
                )
            except _sqlite3.Error as e:
                logger.warning(f"[rebuild] upsert 실패 {r['keyword']}: {e}")

    new_active = int((reg.stats(cid) or {}).get("active") or 0)
    logger.warning(
        f"[rebuild] uid={user_id} cid={cid} campaigns={len(live_campaigns)} "
        f"ad_groups={len(ag_to_camp)} pulled={len(rows)} new_active={new_active}"
    )
    return {
        "success": True,
        "campaigns": len(live_campaigns),
        "ad_groups": len(ag_to_camp),
        "pulled": len(rows),
        "new_active": new_active,
    }


@router.delete("/keyword-pool/keywords/{keyword}")
async def keyword_pool_delete_keyword(
    keyword: str,
    customer_id: Optional[str] = None,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """단일 키워드를 풀에서 삭제 (이미 네이버 등록된 건 영향 없음)."""
    try:
        account = _resolve_account(user_id, customer_id)
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
    customer_id: Optional[str] = None,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """시드와 그 시드로 발굴된 자식 키워드를 풀에서 모두 삭제."""
    try:
        account = _resolve_account(user_id, customer_id)
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
    customer_id: Optional[str] = None,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """초기 시드 추가 — 자동 수집의 첫 input."""
    try:
        account = _resolve_account(user_id, customer_id)
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


class AiSeedExpandRequest(BaseModel):
    base_seeds: List[str] = Field(..., min_items=1, description="원본 시드 — 사용자 도메인 의도. 풀이 오염되어도 이 입력만 사용.")
    cycles: int = Field(1, ge=1, le=3, description="확장 사이클. 1=직접 확장, 2+=직전 결과를 다시 시드로.")
    keywords_per_cycle: int = Field(80, ge=10, le=200, description="LLM 한 번에 생성 후보 수")
    min_volume: int = Field(5, ge=0, le=10000, description="검증 통과 최소 월 검색량")


@router.post("/keyword-pool/seeds/ai-expand")
async def keyword_pool_ai_expand_seeds(
    request: AiSeedExpandRequest,
    customer_id: Optional[str] = None,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """LLM 으로 사용자 시드 도메인 일관성 있게 확장 → keywordstool 검증 → user_seed INSERT.

    풀이 한약재/식물 등으로 오염되어 collect 가 cross-domain drift 하는 사례를 우회.
    base_seeds 만 도메인 기준으로 사용 — DB 풀의 잡음 시드는 무시.

    1. base_seeds → GPT-4o-mini → keywords_per_cycle 개 후보
    2. base_seeds 에서 derive 한 도메인 토큰으로 1차 필터 (LLM drift 차단)
    3. keywordstool 5개씩 배치 → 검색량 ≥ min_volume 만 통과
    4. user_seed 로 INSERT (source='ai_seed_expansion')
    5. cycles 회 반복 (직전 결과를 다음 base 로)
    """
    import json as _json
    from config import settings as _settings
    if not getattr(_settings, "OPENAI_API_KEY", ""):
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY 미설정")

    base_seeds = [s.strip() for s in request.base_seeds if s and s.strip()]
    if not base_seeds:
        raise HTTPException(status_code=400, detail="base_seeds 비어있음")

    account = _resolve_account(user_id, customer_id)
    if not account or not account.get("is_connected"):
        raise HTTPException(status_code=400, detail="광고 계정 미연결")
    customer_id = int(account.get("customer_id"))

    # base_seeds 만으로 도메인 토큰셋 빌드 (DB 풀의 한약재 오염 시드 무시)
    domain_tokens = _build_domain_token_set(base_seeds) | _build_seed_atoms(base_seeds)

    def _matches_user_domain(kw: str) -> bool:
        k = (kw or "").replace(" ", "")
        if len(k) < 2:
            return False
        return any(t in k for t in domain_tokens)

    from services.naver_ad_service import NaverAdApiClient
    client = NaverAdApiClient()
    client.customer_id = account["customer_id"]
    client.api_key = account["api_key"]
    client.secret_key = account["secret_key"]

    pool = get_keyword_pool_db()
    cycle_results: List[Dict] = []
    current_seeds = list(base_seeds)

    for cycle_idx in range(request.cycles):
        # 1) LLM 호출 — 도메인 일관성 강제 프롬프트
        prompt_seeds = ", ".join(current_seeds[:60])  # 토큰 절약
        prompt = (
            f"다음 한국어 키워드들과 동일 도메인의 검색 가능성 있는 한국어 키워드를 정확히 "
            f"{request.keywords_per_cycle}개 생성해줘.\n\n"
            f"입력 키워드:\n{prompt_seeds}\n\n"
            f"규칙:\n"
            f"- 입력 키워드와 동일한 분야/도메인 안에서만 확장 (예: 의료면 의료, 부동산이면 부동산)\n"
            f"- 다른 도메인의 단어 절대 금지 (예: 의료 시드면 한약재/식물/대출/렌탈 등 절대 포함 금지)\n"
            f"- 띄어쓰기 가능 (네이버 검색 사용자 자연스러운 형태)\n"
            f"- 한 줄당 1개, 일련번호/설명 없이 키워드만\n"
            f"- 결과는 JSON array (예: [\"키워드1\", \"키워드2\", ...])"
        )
        try:
            async with httpx.AsyncClient(timeout=60.0) as oai:
                resp = await oai.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={
                        "Authorization": f"Bearer {_settings.OPENAI_API_KEY}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": "gpt-4o-mini",
                        "messages": [
                            {"role": "system", "content": "한국어 검색광고 키워드 전문가. 도메인 일관성을 절대 위반하지 마. JSON array 만 반환."},
                            {"role": "user", "content": prompt},
                        ],
                        "temperature": 0.7,
                        "max_tokens": 3000,
                    },
                )
                resp.raise_for_status()
                content = resp.json()["choices"][0]["message"]["content"]
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"LLM 호출 실패: {type(e).__name__}: {str(e)[:200]}")

        # JSON 파싱 — code block 제거
        import re as _re
        cb = _re.search(r"```(?:json)?\s*(.*?)\s*```", content, _re.DOTALL)
        if cb:
            content = cb.group(1)
        try:
            generated = _json.loads(content.strip())
            if isinstance(generated, dict):
                generated = list(generated.values()) if generated else []
            if not isinstance(generated, list):
                raise ValueError("not a list")
        except Exception as e:
            logger.warning(f"[ai-expand] JSON 파싱 실패 cycle={cycle_idx}: {e} content[:200]={content[:200]!r}")
            generated = []

        # 후보 정규화
        candidates: List[str] = []
        seen = set()
        for k in generated:
            if not isinstance(k, str):
                continue
            kw = k.strip()
            if not kw or len(kw) < 2 or kw in seen:
                continue
            seen.add(kw)
            candidates.append(kw)

        # 2) 도메인 1차 필터 (LLM drift 컷)
        domain_pass = [k for k in candidates if _matches_user_domain(k)]
        domain_fail = len(candidates) - len(domain_pass)

        # 3) keywordstool 배치 검증 (5개씩) — 네이버 응답의 keywordList 에서
        # 입력 hint 와 normalized 매칭. 매칭 안 되면 (= 검색량 데이터 없음) skip.
        validated: List[Dict] = []
        validated_seen: Set[str] = set()

        def _norm(s: str) -> str:
            return (s or "").replace(" ", "").upper()

        for i in range(0, len(domain_pass), 5):
            chunk = domain_pass[i:i + 5]
            try:
                vol_map = await client.get_keywords_volume_batch(chunk)
            except Exception as e:
                logger.warning(f"[ai-expand] volume batch 실패 {chunk}: {e}")
                continue
            # vol_map key 정규화 — Naver 응답 키는 공백 제거된 형태로 옴
            norm_vol_map: Dict[str, Dict] = {_norm(k): v for k, v in vol_map.items()}
            for kw in chunk:
                vinfo = norm_vol_map.get(_norm(kw))
                if not vinfo:
                    continue
                mt = int(vinfo.get("monthly_total") or 0)
                if mt < request.min_volume:
                    continue
                if kw in validated_seen:
                    continue
                validated_seen.add(kw)
                validated.append({
                    "keyword": kw,
                    "monthly_total": mt,
                    "monthly_pc": int(vinfo.get("monthly_pc") or 0),
                    "monthly_mobile": int(vinfo.get("monthly_mobile") or 0),
                    "comp_idx": vinfo.get("comp_idx"),
                    "seed": f"ai_cycle{cycle_idx+1}",
                })
            await asyncio.sleep(0.3)

        # 4) user_seed 로 INSERT — 다음 cycle 의 시드로 활용
        # add_candidates 는 source=user_seed 가 아니어도 INSERT 함. 시드 효과 위해
        # source 를 명시적으로 'user_seed' 로 바꿔 INSERT (확장 시드도 collect 가 사용).
        seed_items = [
            {**v, "source": "user_seed", "monthly_total": v["monthly_total"]}
            for v in validated
        ]
        added = pool.add_candidates(user_id, customer_id, seed_items)

        cycle_results.append({
            "cycle": cycle_idx + 1,
            "llm_generated": len(candidates),
            "domain_filter_pass": len(domain_pass),
            "domain_filter_fail": domain_fail,
            "volume_validated": len(validated),
            "inserted_as_seed": added,
            "samples": [v["keyword"] for v in validated[:8]],
        })
        logger.warning(
            f"[ai-expand] user={user_id} cid={customer_id} cycle {cycle_idx+1}/{request.cycles}: "
            f"LLM {len(candidates)} → domain {len(domain_pass)} → vol≥{request.min_volume} {len(validated)} → INSERT {added}"
        )

        # 다음 cycle 의 base 는 이번 통과 키워드들 (없으면 종료)
        if not validated:
            break
        current_seeds = [v["keyword"] for v in validated][:80]

    total_added = sum(r["inserted_as_seed"] for r in cycle_results)
    return {
        "success": True,
        "total_added_seeds": total_added,
        "cycles": cycle_results,
        "base_seeds_count": len(base_seeds),
        "domain_tokens_count": len(domain_tokens),
    }


class BidBulkUpdateRequest(BaseModel):
    bid: int = Field(..., ge=70, le=100000, description="새 입찰가 (네이버 최소 70원)")
    scope: str = Field("pool", description="'pool' = auto_ 프리픽스 캠페인만, 'all' = 전체 캠페인")


@router.post("/keyword-pool/bid/bulk-update")
async def keyword_pool_bid_bulk_update(
    request: BidBulkUpdateRequest,
    background_tasks: BackgroundTasks,
    customer_id: Optional[str] = None,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """광고주의 default 입찰가를 DB 에 저장 + 광고그룹 default bid + **모든 키워드 bidAmt** 일괄 변경.

    - scope='pool': 풀 자동 등록 캠페인 (이름 'auto_*') 의 광고그룹만 변경
    - scope='all': 그 광고주의 모든 활성 캠페인 광고그룹 변경
    - 키워드별 bidAmt 도 같이 업데이트 — 자동 등록은 useGroupBidAmt=False 라 그룹 default 만
      바꿔서는 키워드별 표시가 안 바뀜. 광고관리자에 즉시 반영되도록 키워드 PUT 도 수행.
    """
    from services.naver_ad_service import NaverAdApiClient
    from database.naver_ad_db import update_ad_account_default_bid
    try:
        account = _resolve_account(user_id, customer_id)
        if not account or not account.get("is_connected"):
            raise HTTPException(status_code=400, detail="광고 계정 미연결")
        cid = int(account.get("customer_id"))
        new_bid = max(70, int(request.bid))

        # 1. DB 저장 — 앞으로 cron 이 이 값 사용
        update_ad_account_default_bid(user_id, str(cid), new_bid)

        # 2. 백그라운드로 네이버 일괄 변경 (45k 키워드는 HTTP 타임아웃 초과 → bg 완주)
        async def _run():
            # 2. 네이버 API 광고그룹 일괄 변경
            client = NaverAdApiClient()
            client.customer_id = account["customer_id"]
            client.api_key = account["api_key"]
            client.secret_key = account["secret_key"]

            campaigns = await client.get_campaigns() or []
            if request.scope == "pool":
                campaigns = [c for c in campaigns if (c.get("name") or "").startswith("auto_")]
            else:
                # 'all' = 파워링크(WEB_SITE) 키워드 캠페인만 — 파워컨텐츠/플레이스/브랜드검색 제외
                campaigns = [c for c in campaigns if (c.get("campaignTp") or "") == "WEB_SITE"]

            ad_group_ids: List[Tuple[str, str]] = []  # (campaign_name, ad_group_id)
            for c in campaigns:
                try:
                    groups = await client.get_ad_groups(campaign_id=c.get("nccCampaignId")) or []
                    for g in groups:
                        gid = g.get("nccAdgroupId")
                        if gid:
                            ad_group_ids.append((c.get("name") or "", gid))
                except Exception as e:
                    logger.warning(f"[bid/bulk] 광고그룹 list 실패 cid={c.get('nccCampaignId')}: {e}")
                await asyncio.sleep(0.15)

            # 광고그룹 default bid 변경
            ag_success = 0
            ag_failed: List[Dict] = []
            for cname, gid in ad_group_ids:
                try:
                    await client.update_ad_group_bid(gid, new_bid)
                    ag_success += 1
                except Exception as e:
                    ag_failed.append({"ad_group_id": gid, "campaign": cname, "error": f"{type(e).__name__}: {str(e)[:120]}"})
                await asyncio.sleep(0.15)

            # 키워드별 bidAmt 일괄 변경 — 광고그룹별로 keyword list 받아 full-body PUT.
            # 부분 PUT(?fields=) 은 Naver 가 silent ignore 하는 케이스가 있어서, list 응답에서
            # 받은 전체 body 를 그대로 사용하고 bidAmt + useGroupBidAmt 만 수정해 PUT.
            # 동시성 = 5 (이전 20). circuit breaker 와 협응해 outbound 폭주 차단.
            kw_total = 0
            kw_success = 0
            kw_failed: List[Dict] = []
            sem = asyncio.Semaphore(5)
            progress_logged_at = 0
            from services.naver_ad_service import _naver_api_breaker, NaverApiCircuitOpenError

            async def _update_kw_full(kw_obj: Dict):
                nonlocal kw_success
                kid = kw_obj.get("nccKeywordId")
                if not kid:
                    return
                # circuit OPEN 시 task 진입 자체 skip
                if _naver_api_breaker.is_open():
                    kw_failed.append({"keyword_id": kid, "error": "circuit_open"})
                    return
                # 이전 버전: full-body PUT (fields 쿼리 없음) → Naver 가 silent-ignore.
                # 393 KW 중 대부분이 이미 70원이라 적용된 것처럼 보였지만 실제로 입찰가가
                # 다르게 설정된 head KW (예: "강남두드러기한의원" 17,840원) 가 그대로 남음.
                # 정답: update_keyword_bid (PUT ?fields=bidAmt + 최소 body).
                cur = kw_obj.get("bidAmt")
                ugba = kw_obj.get("useGroupBidAmt")
                if cur == new_bid and ugba is False:
                    kw_success += 1  # 이미 목표값
                    return
                async with sem:
                    try:
                        await client.update_keyword_bid(kid, new_bid)
                        kw_success += 1
                    except NaverApiCircuitOpenError:
                        kw_failed.append({"keyword_id": kid, "error": "circuit_open"})
                    except Exception as e:
                        kw_failed.append({
                            "keyword_id": kid,
                            "keyword": kw_obj.get("keyword"),
                            "before_bid": cur,
                            "error": f"{type(e).__name__}: {str(e)[:120]}",
                        })

            logger.warning(f"[bid/bulk] 시작 — scope={request.scope} ad_groups={len(ad_group_ids)} new_bid={new_bid}원")
            for idx, (cname, gid) in enumerate(ad_group_ids):
                try:
                    kws = await client.get_keywords(ad_group_id=gid) or []
                except Exception as e:
                    logger.warning(f"[bid/bulk] keywords list 실패 ag={gid}: {e}")
                    continue
                kw_total += len(kws)
                if kws:
                    await asyncio.gather(*[_update_kw_full(k) for k in kws], return_exceptions=False)
                # 1000 단위로 진행 로그 — 49k 가 16분 돌 때 시각적 확인용
                if kw_success - progress_logged_at >= 1000:
                    progress_logged_at = kw_success
                    logger.warning(
                        f"[bid/bulk] 진행 — 광고그룹 {idx+1}/{len(ad_group_ids)} · "
                        f"키워드 {kw_success}/{kw_total} 성공"
                    )
                await asyncio.sleep(0.05)
            logger.warning(
                f"[bid/bulk] 완료 — 광고그룹 {ag_success}/{len(ad_group_ids)} · "
                f"키워드 {kw_success}/{kw_total} 성공 ({len(kw_failed)} 실패)"
            )

            return {
                "success": True,
                "customer_id": str(cid),
                "new_bid": new_bid,
                "scope": request.scope,
                "campaigns_scanned": len(campaigns),
                "ad_groups_total": len(ad_group_ids),
                "ad_groups_updated": ag_success,
                "ad_groups_failed": len(ag_failed),
                "keywords_total": kw_total,
                "keywords_updated": kw_success,
                "keywords_failed": len(kw_failed),
                "failed_samples": (ag_failed[:5] + kw_failed[:5])[:10],
            }
        background_tasks.add_task(_run)
        return {"success": True, "started": True, "scope": request.scope, "new_bid": new_bid,
                "message": f"백그라운드 일괄 변경 시작 — scope={request.scope} 모든 키워드 {new_bid}원 적용 (수십분 소요, 로그에서 진행 확인)"}
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"keyword-pool/bid/bulk-update 실패: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)[:300]}")


@router.post("/keyword-pool/bid/debug-one")
async def keyword_pool_bid_debug_one(
    customer_id: Optional[str] = None,
    bid: int = 70,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """디버그 — 첫 번째 키워드 1개만 업데이트하고 Naver before/after + 응답 raw 그대로 돌려줌.

    bulk-update 가 silent 하게 실패하는 원인 추적용. 로그/응답 body 다 보여줌.
    """
    from services.naver_ad_service import NaverAdApiClient
    try:
        account = _resolve_account(user_id, customer_id)
        if not account or not account.get("is_connected"):
            raise HTTPException(status_code=400, detail="광고 계정 미연결")
        client = NaverAdApiClient()
        client.customer_id = account["customer_id"]
        client.api_key = account["api_key"]
        client.secret_key = account["secret_key"]

        # 첫 번째 auto_* 캠페인의 첫 광고그룹의 첫 키워드 찾기
        campaigns = await client.get_campaigns() or []
        auto_campaigns = [c for c in campaigns if (c.get("name") or "").startswith("auto_")]
        if not auto_campaigns:
            return {"success": False, "step": "no_auto_campaign"}
        first_camp = auto_campaigns[0]
        groups = await client.get_ad_groups(campaign_id=first_camp.get("nccCampaignId")) or []
        if not groups:
            return {"success": False, "step": "no_ad_group", "campaign": first_camp.get("name")}
        gid = groups[0].get("nccAdgroupId")
        kws = await client.get_keywords(ad_group_id=gid) or []
        if not kws:
            return {"success": False, "step": "no_keyword", "ad_group_id": gid}
        first_kw = kws[0]
        kid = first_kw.get("nccKeywordId")

        # before
        before = {
            "nccKeywordId": kid,
            "keyword": first_kw.get("keyword"),
            "bidAmt": first_kw.get("bidAmt"),
            "useGroupBidAmt": first_kw.get("useGroupBidAmt"),
        }

        # PUT — 응답 그대로
        try:
            put_response = await client.update_keyword_bid(kid, max(70, int(bid)))
        except Exception as e:
            import traceback
            return {
                "success": False,
                "step": "put_failed",
                "before": before,
                "error": f"{type(e).__name__}: {str(e)[:500]}",
                "trace": traceback.format_exc()[:1000],
            }

        # after — GET 다시
        after_kw = await client.get_keyword(kid) if hasattr(client, 'get_keyword') else None
        if after_kw is None:
            kws_after = await client.get_keywords(ad_group_id=gid) or []
            after_kw = next((k for k in kws_after if k.get("nccKeywordId") == kid), {})
        after = {
            "bidAmt": after_kw.get("bidAmt"),
            "useGroupBidAmt": after_kw.get("useGroupBidAmt"),
        }
        return {
            "success": True,
            "campaign": first_camp.get("name"),
            "ad_group_id": gid,
            "keyword_id": kid,
            "before": before,
            "put_response": put_response,
            "after": after,
            "changed": before["bidAmt"] != after["bidAmt"],
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"keyword-pool/bid/debug-one 실패: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)[:300]}")


@router.post("/keyword-pool/bid/force-by-name")
async def keyword_pool_bid_force_by_name(
    names: List[str],
    bid: int = 70,
    customer_id: Optional[str] = None,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """이름으로 키워드 찾아 강제 입찰가 변경 + 검증.

    bulk-update 가 silent-ignore 되는지, 또는 그 키워드가 scope 밖 캠페인에 있는지
    추적용. 모든 캠페인 (auto_ 외 포함) 스캔해서 매칭되는 키워드 다 업데이트.
    """
    from services.naver_ad_service import NaverAdApiClient
    try:
        account = _resolve_account(user_id, customer_id)
        if not account or not account.get("is_connected"):
            raise HTTPException(status_code=400, detail="광고 계정 미연결")
        target_set = {n.strip() for n in names if n and n.strip()}
        if not target_set:
            raise HTTPException(status_code=400, detail="names 비어있음")
        new_bid = max(70, int(bid))

        client = NaverAdApiClient()
        client.customer_id = account["customer_id"]
        client.api_key = account["api_key"]
        client.secret_key = account["secret_key"]

        campaigns = await client.get_campaigns() or []
        results: List[Dict] = []
        not_found = set(target_set)

        for c in campaigns:
            cname = c.get("name") or ""
            cid_str = c.get("nccCampaignId")
            try:
                groups = await client.get_ad_groups(campaign_id=cid_str) or []
            except Exception:
                continue
            for g in groups:
                gid = g.get("nccAdgroupId")
                try:
                    kws = await client.get_keywords(ad_group_id=gid) or []
                except Exception:
                    continue
                for k in kws:
                    kname = (k.get("keyword") or "").strip()
                    if kname not in target_set:
                        continue
                    not_found.discard(kname)
                    kid = k.get("nccKeywordId")
                    before = {"bidAmt": k.get("bidAmt"), "useGroupBidAmt": k.get("useGroupBidAmt")}
                    try:
                        await client.update_keyword_bid(kid, new_bid)
                        # 검증 — 재조회
                        try:
                            after_kw = await client.get_keyword(kid)
                        except Exception:
                            after_kw = {}
                        after = {"bidAmt": after_kw.get("bidAmt"), "useGroupBidAmt": after_kw.get("useGroupBidAmt")}
                        results.append({
                            "keyword": kname,
                            "keyword_id": kid,
                            "campaign": cname,
                            "ad_group_id": gid,
                            "before": before,
                            "after": after,
                            "changed": before["bidAmt"] != after["bidAmt"],
                        })
                    except Exception as e:
                        results.append({
                            "keyword": kname,
                            "keyword_id": kid,
                            "campaign": cname,
                            "ad_group_id": gid,
                            "before": before,
                            "error": f"{type(e).__name__}: {str(e)[:200]}",
                        })
                await asyncio.sleep(0.05)
            await asyncio.sleep(0.05)

        return {
            "success": True,
            "new_bid": new_bid,
            "matched": len(results),
            "not_found": sorted(not_found),
            "results": results,
        }
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        logger.error(f"keyword-pool/bid/force-by-name 실패: {traceback.format_exc()}")
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


class ImageExtBackfillRequest(BaseModel):
    image_path: Optional[str] = None  # 직접 지정 (없으면 기존 POWER_LINK_IMAGE 에서 자동 탐색)
    scope: str = "pool"               # pool=auto_ 캠페인만, all=전체
    mode: str = "test_one"            # test_one=1개 그룹 테스트(raw 반환) / backfill=전체 백그라운드
    disable_others: bool = False


@router.post("/keyword-pool/extension/image-backfill")
async def keyword_pool_image_ext_backfill(
    request: ImageExtBackfillRequest,
    background_tasks: BackgroundTasks,
    customer_id: Optional[str] = None,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """POWER_LINK_IMAGE(파워링크 이미지) 확장소재를 광고그룹에 일괄 등록.

    - image_path 미지정 → 기존 확장소재에서 POWER_LINK_IMAGE 의 imagePath 자동 탐색(ownerType=ADGROUP)
    - mode=test_one → 첫 그룹 1개에만 생성 + Naver raw 응답 반환 (본문 포맷 검증용)
    - mode=backfill → 전체 그룹 백그라운드 생성 (이미 있으면 skip)
    """
    from services.naver_ad_service import NaverAdApiClient
    account = _resolve_account(user_id, customer_id)
    if not account or not account.get("is_connected"):
        raise HTTPException(status_code=400, detail="광고 계정 미연결")
    client = NaverAdApiClient()
    client.customer_id = account["customer_id"]
    client.api_key = account["api_key"]
    client.secret_key = account["secret_key"]

    def _as_list(x):
        if isinstance(x, list):
            return x
        if isinstance(x, dict):
            return x.get("data") or x.get("list") or []
        return []

    all_campaigns = _as_list(await client.get_campaigns() or [])
    auto_camps = [c for c in all_campaigns if (c.get("name") or "").startswith("auto_")]
    manual_camps = [c for c in all_campaigns if not (c.get("name") or "").startswith("auto_")]
    target_camps = auto_camps if request.scope == "pool" else all_campaigns

    async def _groups_of(camps) -> List[str]:
        out: List[str] = []
        for c in camps:
            try:
                groups = _as_list(await client.get_ad_groups(campaign_id=c.get("nccCampaignId")) or [])
                for g in groups:
                    gid = g.get("nccAdgroupId")
                    if gid:
                        out.append(gid)
            except Exception:
                pass
            await asyncio.sleep(0.08)
        return out

    # backfill 대상 그룹
    ad_group_ids = await _groups_of(target_camps)
    if not ad_group_ids:
        return {"success": False, "step": "no_ad_groups"}

    # imagePath 자동 탐색 — 수동 캠페인(파워링크 등)에 이미지가 있으므로 수동 먼저 스캔
    image_path = request.image_path
    discovered_from = None
    if not image_path:
        discover_groups = await _groups_of(manual_camps)  # 캡 없음 (수동 캠페인은 소수)
        for gid in discover_groups:
            try:
                exts = _as_list(await client.get_ad_extensions(owner_id=gid, owner_type="ADGROUP") or [])
                for e in exts:
                    if isinstance(e, dict) and e.get("type") == "POWER_LINK_IMAGE":
                        ad = e.get("adExtension") or {}
                        ip = ad.get("imagePath") if isinstance(ad, dict) else None
                        if ip:
                            image_path = ip
                            discovered_from = gid
                            break
                if image_path:
                    break
            except Exception:
                pass
            await asyncio.sleep(0.08)
    if not image_path:
        return {
            "success": False, "step": "no_image_path_found",
            "hint": "기존 POWER_LINK_IMAGE 확장소재를 못 찾음 — image_path 직접 지정 필요",
            "ad_groups_scanned": min(len(ad_group_ids), 60),
        }

    content = {"adExtension": {"imagePath": image_path}}

    if request.mode == "test_one":
        gid = ad_group_ids[0]
        try:
            res = await client.create_ad_extension(
                owner_id=gid, kind="POWER_LINK_IMAGE", content=content, owner_type="ADGROUP",
            )
            return {"success": True, "mode": "test_one", "ad_group_id": gid,
                    "image_path": image_path, "discovered_from": discovered_from, "naver_response": res}
        except Exception as e:
            return {"success": False, "mode": "test_one", "ad_group_id": gid,
                    "image_path": image_path, "error": f"{type(e).__name__}: {str(e)[:400]}"}

    async def _run():
        created = skipped = failed = 0
        for gid in ad_group_ids:
            try:
                exts = _as_list(await client.get_ad_extensions(owner_id=gid, owner_type="ADGROUP") or [])
                if any(isinstance(e, dict) and e.get("type") == "POWER_LINK_IMAGE" for e in exts):
                    skipped += 1
                else:
                    await client.create_ad_extension(
                        owner_id=gid, kind="POWER_LINK_IMAGE", content=content, owner_type="ADGROUP",
                    )
                    created += 1
            except Exception as e:
                failed += 1
                logger.warning(f"[img-backfill] ag={gid} 실패: {type(e).__name__}: {str(e)[:120]}")
            await asyncio.sleep(0.15)
        logger.warning(f"[img-backfill] 완료 — 생성 {created} / skip {skipped} / 실패 {failed} / 총 {len(ad_group_ids)}")

    background_tasks.add_task(_run)
    return {"success": True, "mode": "backfill", "started": True, "image_path": image_path,
            "ad_groups_total": len(ad_group_ids),
            "message": f"백그라운드 시작 — {len(ad_group_ids)}개 광고그룹에 POWER_LINK_IMAGE 부착 (이미 있으면 skip)"}


class CampaignBudgetBulkRequest(BaseModel):
    daily_budget: int = Field(..., ge=70, le=100000000, description="일 예산(원)")
    scope: str = Field("all", description="'all' 전체 캠페인, 'pool' auto_ 캠페인만")
    dry_run: bool = Field(False)


@router.post("/keyword-pool/campaign/budget-bulk")
async def keyword_pool_campaign_budget_bulk(
    request: CampaignBudgetBulkRequest,
    background_tasks: BackgroundTasks,
    customer_id: Optional[str] = None,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """모든(또는 auto_) 캠페인의 일예산을 일괄 변경. dry_run=true 면 현재 예산 미리보기."""
    from services.naver_ad_service import NaverAdApiClient
    account = _resolve_account(user_id, customer_id)
    if not account or not account.get("is_connected"):
        raise HTTPException(status_code=400, detail="광고 계정 미연결")
    client = NaverAdApiClient()
    client.customer_id = account["customer_id"]
    client.api_key = account["api_key"]
    client.secret_key = account["secret_key"]

    def _as_list(x):
        if isinstance(x, list):
            return x
        if isinstance(x, dict):
            return x.get("data") or x.get("list") or []
        return []

    campaigns = _as_list(await client.get_campaigns() or [])
    if request.scope == "pool":
        campaigns = [c for c in campaigns if (c.get("name") or "").startswith("auto_")]
    else:
        # 'all' = 파워링크(WEB_SITE) 키워드 캠페인만 — 파워컨텐츠/플레이스/브랜드검색 제외
        campaigns = [c for c in campaigns if (c.get("campaignTp") or "") == "WEB_SITE"]
    if not campaigns:
        return {"success": False, "step": "no_campaigns"}

    new_budget = int(request.daily_budget)
    if request.dry_run:
        return {
            "success": True, "dry_run": True, "scope": request.scope,
            "target_daily_budget": new_budget, "campaigns_total": len(campaigns),
            "campaigns": [
                {"name": c.get("name"), "id": c.get("nccCampaignId"),
                 "current_budget": c.get("dailyBudget"),
                 "useDailyBudget": c.get("useDailyBudget")}
                for c in campaigns
            ][:100],
        }

    async def _run():
        ok = 0
        failed: List[Dict] = []
        for c in campaigns:
            cid_camp = c.get("nccCampaignId")
            if not cid_camp:
                continue
            try:
                await client.update_campaign_budget(cid_camp, new_budget, base=c)
                ok += 1
            except Exception as e:
                failed.append({"campaign": c.get("name"), "id": cid_camp,
                               "error": f"{type(e).__name__}: {str(e)[:120]}"})
            await asyncio.sleep(0.15)
        logger.warning(f"[budget-bulk] 완료 — {ok}/{len(campaigns)} 캠페인 예산={new_budget}원 ({len(failed)} 실패)")

    background_tasks.add_task(_run)
    return {"success": True, "started": True, "scope": request.scope,
            "daily_budget": new_budget, "campaigns_total": len(campaigns),
            "message": f"백그라운드 시작 — {len(campaigns)}개 캠페인 일예산 {new_budget}원 적용"}


class CreativeBackfillRequest(BaseModel):
    scope: str = Field("all", description="'all' 전체 캠페인, 'pool' auto_ 캠페인만")
    template_id: Optional[int] = Field(None, description="특정 템플릿 id 강제(없으면 첫 활성)")
    mode: str = Field("backfill", description="test_one | backfill")


@router.post("/keyword-pool/ads/backfill-creative")
async def keyword_pool_ads_backfill_creative(
    request: CreativeBackfillRequest,
    background_tasks: BackgroundTasks,
    customer_id: Optional[str] = None,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """텍스트 소재(T&D)를 소재 없는 모든 광고그룹에 일괄 등록. 이미 소재 있으면 skip."""
    from services.naver_ad_service import NaverAdApiClient
    from database.ad_templates_db import get_ad_templates_db
    account = _resolve_account(user_id, customer_id)
    if not account or not account.get("is_connected"):
        raise HTTPException(status_code=400, detail="광고 계정 미연결")
    cid = int(account.get("customer_id"))
    client = NaverAdApiClient()
    client.customer_id = account["customer_id"]
    client.api_key = account["api_key"]
    client.secret_key = account["secret_key"]

    tpl_db = get_ad_templates_db()
    all_tpls = tpl_db.list_templates(user_id, cid) or []
    if request.template_id is not None:
        tpl = next((t for t in all_tpls if int(t.get("id")) == int(request.template_id)), None)
    else:
        tpl = next((t for t in all_tpls if t.get("is_active")), None) or (all_tpls[0] if all_tpls else None)
    if not tpl:
        return {"success": False, "step": "no_template", "hint": "ad_templates 비어있음"}

    def _as_list(x):
        if isinstance(x, list):
            return x
        if isinstance(x, dict):
            return x.get("data") or x.get("list") or []
        return []

    all_campaigns = _as_list(await client.get_campaigns() or [])
    if request.scope == "all":
        # 파워링크(WEB_SITE) 키워드 캠페인만 — 파워컨텐츠/플레이스/브랜드검색 제외
        target_camps = [c for c in all_campaigns if (c.get("campaignTp") or "") == "WEB_SITE"]
    else:
        target_camps = [c for c in all_campaigns if (c.get("name") or "").startswith("auto_")]

    ad_group_ids: List[str] = []
    for c in target_camps:
        try:
            groups = _as_list(await client.get_ad_groups(campaign_id=c.get("nccCampaignId")) or [])
            for g in groups:
                gid = g.get("nccAdgroupId")
                if gid:
                    ad_group_ids.append(gid)
        except Exception:
            pass
        await asyncio.sleep(0.08)
    if not ad_group_ids:
        return {"success": False, "step": "no_ad_groups"}

    async def _create_one(gid: str):
        return await client.create_ad(
            ad_group_id=gid,
            headline_pc=tpl["headline_pc"], description_pc=tpl["description_pc"],
            display_url=tpl["display_url"], final_url_pc=tpl["final_url_pc"],
            headline_mobile=tpl.get("headline_mobile"),
            description_mobile=tpl.get("description_mobile"),
            final_url_mobile=tpl.get("final_url_mobile"),
        )

    if request.mode == "test_one":
        gid = ad_group_ids[0]
        try:
            res = await _create_one(gid)
            return {"success": True, "mode": "test_one", "ad_group_id": gid,
                    "template_id": tpl.get("id"), "naver_response": res}
        except Exception as e:
            return {"success": False, "mode": "test_one", "ad_group_id": gid,
                    "error": f"{type(e).__name__}: {str(e)[:400]}"}

    # 템플릿 소재(헤드라인/URL)가 이미 있는지 — 있으면 skip, 없으면 추가.
    # (기존 "소재 있으면 skip" 은 보류 blog 소재만 있는 그룹이 두드러기 소재를 못 받던 버그)
    _tpl_head = (tpl.get("headline_pc") or "").strip()
    _tpl_url = (tpl.get("final_url_pc") or "").replace("https://", "").replace("http://", "").strip("/")

    def _has_tpl(ads) -> bool:
        for a in ads:
            adobj = a.get("ad") if isinstance(a, dict) else None
            if not isinstance(adobj, dict):
                continue
            h = (adobj.get("headline") or (adobj.get("pc") or {}).get("headline") or "").strip()
            fu = (adobj.get("finalUrl") or adobj.get("displayUrl") or "").strip()
            if (_tpl_head and h == _tpl_head) or (_tpl_url and _tpl_url in fu):
                return True
        return False

    async def _run():
        created = skipped = failed = 0
        for gid in ad_group_ids:
            try:
                ads = _as_list(await client.get_ads(ad_group_id=gid) or [])
                if _has_tpl(ads):
                    skipped += 1  # 이미 템플릿 소재 보유 — skip
                else:
                    await _create_one(gid)  # 소재 없거나 보류 소재만 → 템플릿 소재 추가
                    created += 1
            except Exception as e:
                failed += 1
                logger.warning(f"[creative-backfill] ag={gid} 실패: {type(e).__name__}: {str(e)[:120]}")
            await asyncio.sleep(0.15)
        logger.warning(f"[creative-backfill] 완료 — 생성 {created} / skip {skipped} / 실패 {failed} / 총 {len(ad_group_ids)}")

    background_tasks.add_task(_run)
    return {"success": True, "mode": "backfill", "started": True, "template_id": tpl.get("id"),
            "ad_groups_total": len(ad_group_ids),
            "message": f"백그라운드 시작 — {len(ad_group_ids)}개 광고그룹에 소재 부착 (이미 있으면 skip)"}


# ============ 전자동 광맥 발굴 — Domain Profile API (Stage 2) ============

class DomainProfileGenerateRequest(BaseModel):
    description: str = Field(..., description="사업 설명 한 줄 (예: 의료인 대상 대출 — 병원/약사/한의사대출)")
    target_count: int = Field(100000, ge=1000, le=100000)


class DomainProfileSaveRequest(BaseModel):
    description: Optional[str] = None
    atom_library: Optional[Dict[str, Any]] = None
    relevance_keywords: Optional[List[str]] = None
    negative_keywords: Optional[List[str]] = None
    enabled: Optional[bool] = None
    min_score: Optional[int] = None
    target_count: Optional[int] = None
    daily_budget: Optional[int] = None
    default_bid: Optional[int] = None
    ad_template_id: Optional[int] = None
    category_split: Optional[bool] = None
    nonmedical_budget: Optional[int] = None
    required_tokens: Optional[List[str]] = None


@router.get("/keyword-pool/domain-profile")
async def keyword_pool_get_domain_profile(
    customer_id: Optional[str] = None,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """저장된 도메인 프로파일 조회 (자동화 설정 화면용)."""
    from database.naver_ad_db import get_domain_profile
    account = _resolve_account(user_id, customer_id)
    if not account or not account.get("is_connected"):
        raise HTTPException(status_code=400, detail="광고 계정 미연결")
    return {"success": True, "profile": get_domain_profile(user_id, str(account.get("customer_id")))}


@router.post("/keyword-pool/domain-profile/generate")
async def keyword_pool_generate_domain_profile(
    request: DomainProfileGenerateRequest,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """사업 설명 → LLM 이 atom_library/relevance/negative/예시시드 생성 (검수용, 저장 X)."""
    from services.ai_seed_suggester import generate_domain_profile
    return await generate_domain_profile(request.description, request.target_count)


@router.post("/keyword-pool/domain-profile/save")
async def keyword_pool_save_domain_profile(
    request: DomainProfileSaveRequest,
    customer_id: Optional[str] = None,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """검수한 도메인 프로파일 저장 + 자동화 ON/OFF. None 필드는 건너뜀."""
    from database.naver_ad_db import update_domain_profile, get_domain_profile
    account = _resolve_account(user_id, customer_id)
    if not account or not account.get("is_connected"):
        raise HTTPException(status_code=400, detail="광고 계정 미연결")
    cid = str(account.get("customer_id"))
    fields = {}
    for k in ("description", "atom_library", "relevance_keywords", "negative_keywords",
              "enabled", "min_score", "target_count", "daily_budget", "default_bid", "ad_template_id",
              "category_split", "nonmedical_budget", "required_tokens"):
        v = getattr(request, k, None)
        if v is not None:
            fields[k] = v
    ok = update_domain_profile(user_id, cid, **fields)
    return {"success": ok, "profile": get_domain_profile(user_id, cid)}


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
