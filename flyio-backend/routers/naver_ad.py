"""
네이버 광고 자동 최적화 API 라우터
"""
from fastapi import APIRouter, HTTPException, Query, BackgroundTasks, Depends, UploadFile, File, Form
from pydantic import BaseModel, Field
from routers.auth_deps import get_user_id_with_fallback
from routers.admin import require_admin
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import logging
import asyncio
import io
import json as _json_lib
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


def _verify_cron_token(authorization: Optional[str]) -> None:
    expected = (_os.environ.get("CRON_TOKEN") or "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail="CRON_TOKEN 미설정")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Bearer 토큰 필요")
    provided = authorization.split(" ", 1)[1].strip()
    if not _hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=403, detail="잘못된 cron 토큰")


async def _run_pool_collect(uid: int, max_new: int = 5000, min_volume: int = 30):
    """수집 1회 — keywordstool로 새 키워드 발굴해 풀에 추가."""
    from services.naver_ad_service import NaverAdApiClient

    account = get_ad_account(uid)
    if not account or not account.get("is_connected"):
        return
    customer_id = int(account.get("customer_id"))

    pool = get_keyword_pool_db()
    reg = get_registered_keywords_db()
    pool_pending = (pool.stats(customer_id).get("by_status") or {}).get("pending", 0)
    active_reg = int((reg.stats(customer_id) or {}).get("active") or 0)
    headroom = 100_000 - active_reg - pool_pending
    if headroom <= 0:
        logger.info(f"[pool/collect] user={uid} 한도 도달 — skip")
        return
    target = min(max_new, headroom)

    seeds = pool.get_recent_seeds(customer_id, limit=20)
    if not seeds:
        logger.info(f"[pool/collect] user={uid} 시드 없음 — UI에서 초기 시드 제공 필요")
        return

    client = NaverAdApiClient()
    client.customer_id = account["customer_id"]
    client.api_key = account["api_key"]
    client.secret_key = account["secret_key"]

    added = 0
    for seed in seeds[:30]:
        if added >= target:
            break
        try:
            related = await client.get_related_keywords(seed, show_detail=True)
        except Exception as e:
            logger.warning(f"[pool/collect] {seed} API 실패: {e}")
            continue
        items = related.get("keywordList", []) if isinstance(related, dict) else []
        candidates = []
        for item in items:
            kw = (item.get("relKeyword") or "").strip()
            if not kw:
                continue
            mt = int(item.get("monthlyPcQcCnt") or 0) + int(item.get("monthlyMobileQcCnt") or 0)
            if mt < min_volume:
                continue
            candidates.append({
                "keyword": kw, "monthly_total": mt,
                "monthly_pc": int(item.get("monthlyPcQcCnt") or 0),
                "monthly_mobile": int(item.get("monthlyMobileQcCnt") or 0),
                "comp_idx": item.get("compIdx"),
                "seed": seed,
            })
        added += pool.add_candidates(uid, customer_id, candidates)
        await asyncio.sleep(0.4)
    logger.info(f"[pool/collect] user={uid} 새 키워드 {added}개")


async def _run_pool_register(uid: int, batch: int = 1000, bid: int = 100):
    """등록 1회 — pending → orchestrator로 일괄."""
    from services.bulk_upload_orchestrator import BulkUploadOrchestrator, BulkJobConfig
    from services.naver_ad_service import NaverAdApiClient

    account = get_ad_account(uid)
    if not account or not account.get("is_connected"):
        return
    customer_id = int(account.get("customer_id"))

    pool = get_keyword_pool_db()
    pending = pool.claim_pending(customer_id, limit=batch, min_volume=30)
    if not pending:
        return
    keywords = [p["keyword"] for p in pending]

    client = NaverAdApiClient()
    client.customer_id = account["customer_id"]
    client.api_key = account["api_key"]
    client.secret_key = account["secret_key"]

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
    )
    orchestrator = BulkUploadOrchestrator(client)
    result = await orchestrator.run(cfg, keywords)

    reg = get_registered_keywords_db()
    existing = reg.get_existing_set(customer_id, keywords)
    succeeded_ids = [p["id"] for p in pending if p["keyword"] in existing]
    failed_ids = [p["id"] for p in pending if p["keyword"] not in existing]
    pool.mark_status(succeeded_ids, "registered")
    pool.mark_status(failed_ids, "failed",
                     error_message=str(result.get("error", "did not register"))[:300])
    logger.info(f"[pool/register] user={uid} reg={len(succeeded_ids)} fail={len(failed_ids)}")


async def _run_pool_workers_for_users(user_ids: List[int]):
    for uid in user_ids:
        try:
            await _run_pool_collect(uid)
        except Exception as e:
            logger.warning(f"[pool/run] collect 실패 user={uid}: {e}")
        try:
            await _run_pool_register(uid)
        except Exception as e:
            logger.warning(f"[pool/run] register 실패 user={uid}: {e}")


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
        except Exception:
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


@router.get("/keyword-pool/stats")
async def keyword_pool_stats(user_id: int = Depends(get_user_id_with_fallback)):
    """본인 풀/등록 상태."""
    account = get_ad_account(user_id)
    if not account:
        return {"success": False, "message": "광고 계정 미연결", "pool": {}, "registered": {}}
    customer_id = int(account.get("customer_id"))
    pool = get_keyword_pool_db()
    reg = get_registered_keywords_db()
    return {
        "success": True,
        "customer_id": customer_id,
        "pool": pool.stats(customer_id),
        "registered": reg.stats(customer_id),
        "account_cap": 100_000,
    }


class PoolSeedsRequest(BaseModel):
    seeds: List[str]


@router.post("/keyword-pool/seeds")
async def keyword_pool_add_seeds(
    request: PoolSeedsRequest,
    user_id: int = Depends(get_user_id_with_fallback),
):
    """초기 시드 추가 — 자동 수집의 첫 input."""
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
                # 'ad' 필드가 dict / JSON 문자열 / 누락 모든 케이스 대응
                raw_ad = (a or {}).get("ad")
                if isinstance(raw_ad, str):
                    try:
                        ad = _json_lib.loads(raw_ad)
                    except Exception:
                        ad = {}
                elif isinstance(raw_ad, dict):
                    ad = raw_ad
                else:
                    # ad 필드 자체가 없는 경우 — ad 본체가 a 자체에 평면적으로 들어있는 케이스
                    ad = a if isinstance(a, dict) else {}

                pc = ad.get("pc") if isinstance(ad.get("pc"), dict) else {}
                mo = ad.get("mobile") if isinstance(ad.get("mobile"), dict) else {}

                # === 헤드라인 / 설명 (TEXT_45 단일 / RSP_AD 복수 모두 대응) ===
                headline_pc = _first_str(
                    pc.get("headline"), pc.get("title"),
                    ad.get("headline"), ad.get("title"),
                    ad.get("headlines"),  # RSP_AD 배열
                    pc.get("headlines"),
                    (a or {}).get("headline"),
                )
                description_pc = _first_str(
                    pc.get("description"), pc.get("desc"),
                    ad.get("description"), ad.get("desc"),
                    ad.get("descriptions"),  # RSP_AD 배열
                    pc.get("descriptions"),
                    (a or {}).get("description"),
                )
                display_url = _first_str(
                    ad.get("displayUrl"), ad.get("display_url"),
                    pc.get("displayUrl"),
                    ad.get("pcDisplayUrl"),
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

                # display_url이 비어도 final_url_pc 도메인 추출해 폴백 (네이버는 display 필드 누락 흔함)
                if not display_url and final_url_pc:
                    try:
                        from urllib.parse import urlparse
                        u = urlparse(final_url_pc)
                        if u.netloc:
                            display_url = f"{u.scheme or 'https'}://{u.netloc}"
                    except Exception:
                        pass

                headline_mobile_v = _first_str(
                    mo.get("headline"), mo.get("title"),
                    ad.get("headlines"),
                ) or None
                description_mobile_v = _first_str(
                    mo.get("description"), mo.get("desc"),
                    ad.get("descriptions"),
                ) or None

                if sample_field_check is None:
                    sample_field_check = {
                        "ad_type": (a or {}).get("type"),
                        "headline_pc": headline_pc[:30] if headline_pc else "",
                        "description_pc": description_pc[:30] if description_pc else "",
                        "display_url": display_url,
                        "final_url_pc": final_url_pc,
                        "ad_top_keys": list((a or {}).keys()) if isinstance(a, dict) else [],
                        "ad_inner_keys": list(ad.keys()) if isinstance(ad, dict) else [],
                        "pc_keys": list(pc.keys()) if isinstance(pc, dict) else [],
                    }
                if not (headline_pc and description_pc and final_url_pc):
                    # display_url 없어도 위에서 도메인 폴백했으니 여기 도달하면 진짜 누락
                    ads_missing_field += 1
                    continue
                if not display_url:
                    # 폴백 실패: 그래도 final URL은 있으니 final로 대체
                    display_url = final_url_pc
                res = db.get_or_create_template(
                    user_id, customer_id,
                    headline_pc=headline_pc[:15],  # 네이버 PC 헤드라인 15자 한도
                    description_pc=description_pc[:45],  # 45자 한도
                    display_url=display_url,
                    final_url_pc=final_url_pc,
                    headline_mobile=(headline_mobile_v[:15] if headline_mobile_v else None),
                    description_mobile=(description_mobile_v[:45] if description_mobile_v else None),
                    final_url_mobile=final_url_mobile or None,
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
