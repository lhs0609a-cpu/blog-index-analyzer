"""
광고 최적화 대시보드 API
- 성과 추적
- ROI 계산
- 알림 관리
- 최적화 이력
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import Optional, Dict, List, Any
from datetime import datetime, timedelta

from database.ad_optimization_db import (
    save_ad_account,
    get_ad_account,
    get_user_ad_accounts,
    delete_ad_account,
    save_optimization_settings,
    get_optimization_settings,
    get_optimization_history,
    get_bid_change_history,
    get_performance_history,
    get_roi_summary,
    get_notifications,
    mark_notification_read,
    create_notification,
)
from services.ad_auto_optimizer import ad_auto_optimizer
from services.ad_platforms import PLATFORM_SERVICES, get_platform_service, PLATFORM_INFO
import logging
from routers.auth_deps import get_user_id_with_fallback

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ad-dashboard", tags=["광고 대시보드"])


# ============ API 테스트 엔드포인트 ============

@router.get("/test/naver")
async def test_naver_api():
    """네이버 검색광고 API 실제 테스트"""
    from services.ad_platforms.naver_searchad import NaverSearchAdService
    from datetime import datetime, timedelta
    from config import settings

    result = {
        "platform": "naver_searchad",
        "test_time": datetime.now().isoformat(),
        "credentials_set": bool(settings.NAVER_AD_CUSTOMER_ID and settings.NAVER_AD_API_KEY),
        "tests": {}
    }

    if not result["credentials_set"]:
        result["error"] = "자격증명이 설정되지 않았습니다"
        return result

    service = NaverSearchAdService()

    try:
        # 1. 연결 테스트
        connected = await service.connect()
        result["tests"]["connection"] = {
            "success": connected,
            "message": "연결 성공" if connected else "연결 실패"
        }

        if not connected:
            return result

        # 2. 계정 정보
        account_info = await service.get_account_info()
        result["tests"]["account_info"] = {
            "success": True,
            "data": account_info
        }

        # 3. 캠페인 조회
        campaigns = await service.get_campaigns()
        result["tests"]["campaigns"] = {
            "success": True,
            "count": len(campaigns),
            "sample": [
                {
                    "id": c.campaign_id,
                    "name": c.name,
                    "status": c.status,
                    "budget": c.budget,
                    "cost": c.cost,
                    "conversions": c.conversions,
                    "roas": c.roas
                }
                for c in campaigns[:5]
            ]
        }

        # 4. 키워드 조회
        keywords = await service.get_keywords()
        result["tests"]["keywords"] = {
            "success": True,
            "count": len(keywords),
            "sample": [
                {
                    "id": k.keyword_id,
                    "text": k.keyword_text,
                    "bid": k.bid_amount,
                    "status": k.status,
                    "clicks": k.clicks,
                    "conversions": k.conversions,
                    "roas": k.roas
                }
                for k in keywords[:10]
            ]
        }

        # 5. 최적화 분석 (실제 변경 없이)
        optimization_analysis = []
        for kw in keywords:
            if kw.conversions > 0 and kw.cost > 0:
                if kw.roas > 300:
                    optimization_analysis.append({
                        "keyword": kw.keyword_text,
                        "action": "bid_increase",
                        "reason": f"고효율 (ROAS {kw.roas:.0f}%)",
                        "current_bid": kw.bid_amount,
                        "suggested_bid": int(kw.bid_amount * 1.2)
                    })
                elif kw.roas < 100:
                    optimization_analysis.append({
                        "keyword": kw.keyword_text,
                        "action": "bid_decrease",
                        "reason": f"저효율 (ROAS {kw.roas:.0f}%)",
                        "current_bid": kw.bid_amount,
                        "suggested_bid": int(kw.bid_amount * 0.8)
                    })
            elif kw.clicks >= 30 and kw.conversions == 0:
                optimization_analysis.append({
                    "keyword": kw.keyword_text,
                    "action": "pause",
                    "reason": f"전환 없음 (클릭 {kw.clicks}회)",
                    "current_bid": kw.bid_amount,
                    "suggested_bid": 0
                })

        result["tests"]["optimization_analysis"] = {
            "success": True,
            "recommendations": optimization_analysis[:20]
        }

        await service.disconnect()
        result["overall_success"] = True

    except Exception as e:
        result["error"] = str(e)
        result["overall_success"] = False

    return result


# ============ 모델 정의 ============

class AccountConnectRequest(BaseModel):
    """계정 연동 요청"""
    platform_id: str
    credentials: Dict[str, str]
    account_name: Optional[str] = None


class OptimizationSettingsRequest(BaseModel):
    """최적화 설정 요청"""
    strategy: str = "balanced"
    target_roas: float = 300
    target_cpa: float = 20000
    min_bid: float = 70
    max_bid: float = 100000
    max_bid_change_ratio: float = 0.2
    is_auto_enabled: bool = False
    optimization_interval: int = 60


# ============ 대시보드 메인 ============

@router.get("/summary")
async def get_dashboard_summary(user_id: int = Depends(get_user_id_with_fallback)):
    """대시보드 요약 - 전체 성과 및 ROI"""
    accounts = get_user_ad_accounts(user_id)
    roi = get_roi_summary(user_id, days=30)
    notifications = get_notifications(user_id, unread_only=True, limit=5)

    # 플랫폼별 성과 집계
    platform_performance = []
    total_spend = 0
    total_revenue = 0
    total_conversions = 0

    for account in accounts:
        perf = get_performance_history(user_id, account["platform_id"], days=7)
        if perf:
            latest = perf[0] if perf else {}
            total_spend += latest.get("cost", 0)
            total_revenue += latest.get("revenue", 0)
            total_conversions += latest.get("conversions", 0)

            platform_performance.append({
                "platform_id": account["platform_id"],
                "account_name": account["account_name"],
                "spend": latest.get("cost", 0),
                "revenue": latest.get("revenue", 0),
                "conversions": latest.get("conversions", 0),
                "roas": latest.get("roas", 0),
            })

    return {
        "summary": {
            "connected_platforms": len(accounts),
            "total_spend": total_spend,
            "total_revenue": total_revenue,
            "total_conversions": total_conversions,
            "overall_roas": (total_revenue / total_spend * 100) if total_spend > 0 else 0,
        },
        "roi": {
            "cost_saved": roi["total_cost_saved"],
            "revenue_gained": roi["total_revenue_gained"],
            "total_optimizations": roi["total_optimizations"],
            "avg_roas_improvement": roi["avg_roas_improvement"],
            "avg_cpa_reduction": roi["avg_cpa_reduction"],
        },
        "platforms": platform_performance,
        "unread_notifications": len(notifications),
        "notifications": notifications,
        "optimizer_status": ad_auto_optimizer.get_status(),
    }


# ============ 계정 관리 ============

@router.post("/accounts/connect")
async def connect_account(request: AccountConnectRequest, user_id: int = Depends(get_user_id_with_fallback)):
    """광고 계정 연동"""
    if request.platform_id not in PLATFORM_SERVICES:
        raise HTTPException(status_code=400, detail=f"지원하지 않는 플랫폼: {request.platform_id}")

    # 연결 테스트
    try:
        service = get_platform_service(request.platform_id, request.credentials)
        is_valid = await service.validate_credentials()

        if not is_valid:
            raise HTTPException(status_code=400, detail="자격 증명이 유효하지 않습니다")

        account_info = await service.get_account_info()
        account_name = account_info.get("name") or request.account_name or f"{request.platform_id} 계정"

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"연동 실패: {str(e)}")

    # DB 저장
    account_id = save_ad_account(
        user_id=user_id,
        platform_id=request.platform_id,
        credentials=request.credentials,
        account_name=account_name,
    )

    # 기본 설정 저장
    save_optimization_settings(user_id, request.platform_id, {
        "strategy": "balanced",
        "target_roas": 300,
        "target_cpa": 20000,
        "min_bid": 70,
        "max_bid": 100000,
        "is_auto_enabled": False,
    })

    # 연동 알림
    create_notification(
        user_id=user_id,
        notification_type="account_connected",
        title="광고 계정 연동 완료",
        message=f"{account_name}이(가) 성공적으로 연동되었습니다.",
        platform_id=request.platform_id,
        severity="info",
    )

    return {
        "success": True,
        "account_id": account_id,
        "account_name": account_name,
        "platform_info": PLATFORM_INFO.get(request.platform_id, {}),
    }


@router.get("/accounts")
async def list_accounts(user_id: int = Depends(get_user_id_with_fallback)):
    """연동된 계정 목록"""
    accounts = get_user_ad_accounts(user_id)

    result = []
    for account in accounts:
        settings = get_optimization_settings(user_id, account["platform_id"])
        result.append({
            **account,
            "platform_info": PLATFORM_INFO.get(account["platform_id"], {}),
            "settings": settings,
        })

    return {"accounts": result}


@router.delete("/accounts/{platform_id}")
async def disconnect_account(platform_id: str, user_id: int = Depends(get_user_id_with_fallback)):
    """계정 연동 해제"""
    success = delete_ad_account(user_id, platform_id)

    if success:
        create_notification(
            user_id=user_id,
            notification_type="account_disconnected",
            title="광고 계정 연동 해제",
            message=f"{platform_id} 계정이 연동 해제되었습니다.",
            platform_id=platform_id,
            severity="info",
        )

    return {"success": success}


# ============ 최적화 설정 ============

@router.get("/settings/{platform_id}")
async def get_settings(platform_id: str, user_id: int = Depends(get_user_id_with_fallback)):
    """플랫폼 최적화 설정 조회"""
    settings = get_optimization_settings(user_id, platform_id)
    return {"platform_id": platform_id, "settings": settings}


@router.post("/settings/{platform_id}")
async def update_settings(
    platform_id: str,
    request: OptimizationSettingsRequest,
    user_id: int = Depends(get_user_id_with_fallback)
):
    """플랫폼 최적화 설정 업데이트"""
    save_optimization_settings(user_id, platform_id, request.dict())

    # 자동 최적화 활성화/비활성화 알림
    if request.is_auto_enabled:
        create_notification(
            user_id=user_id,
            notification_type="auto_optimization_enabled",
            title="자동 최적화 활성화",
            message=f"{platform_id}의 자동 최적화가 시작되었습니다. 1분마다 입찰가가 자동 조정됩니다.",
            platform_id=platform_id,
            severity="info",
        )

    return {"success": True, "settings": request.dict()}


@router.post("/settings/{platform_id}/toggle-auto")
async def toggle_auto_optimization(platform_id: str, user_id: int = Depends(get_user_id_with_fallback)):
    """자동 최적화 토글 - 활성화 시 연결 테스트 수행"""
    settings = get_optimization_settings(user_id, platform_id)
    new_status = not settings.get("is_auto_enabled", False)

    # 활성화하려는 경우, 먼저 연결 테스트 수행
    if new_status:
        account = get_ad_account(user_id, platform_id)
        if not account:
            raise HTTPException(
                status_code=404,
                detail="광고 계정이 연동되어 있지 않습니다. 먼저 계정을 연동해주세요."
            )

        try:
            service = get_platform_service(platform_id, account["credentials"])
            is_valid = await service.validate_credentials()
            if not is_valid:
                raise HTTPException(
                    status_code=400,
                    detail="API 자격증명이 유효하지 않습니다. 계정 설정을 확인해주세요."
                )
            # 실제 연결 테스트
            await service.connect()
            await service.disconnect()
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Auto-optimization connection test failed: {e}")
            raise HTTPException(
                status_code=400,
                detail=f"광고 플랫폼 연결 테스트 실패: {str(e)}"
            )

    settings["is_auto_enabled"] = new_status
    save_optimization_settings(user_id, platform_id, settings)

    return {
        "success": True,
        "is_auto_enabled": new_status,
        "message": "자동 최적화가 활성화되었습니다. 15분마다 자동으로 입찰가가 조정됩니다." if new_status else "자동 최적화가 비활성화되었습니다."
    }


# ============ 성과 추적 ============

# NOTE: 구체적인 경로가 {platform_id} 보다 먼저 와야 올바르게 매칭됨

@router.get("/performance/all")
async def get_all_performance(
    user_id: int = Depends(get_user_id_with_fallback),
    days: int = Query(default=7, ge=1, le=30)
):
    """전체 플랫폼 성과"""
    accounts = get_user_ad_accounts(user_id)

    all_performance = []
    for account in accounts:
        history = get_performance_history(user_id, account["platform_id"], days)
        all_performance.append({
            "platform_id": account["platform_id"],
            "account_name": account["account_name"],
            "history": history,
        })

    return {"platforms": all_performance}


# ============ ROI 추적 ============

@router.get("/roi")
async def get_roi_data(
    user_id: int = Depends(get_user_id_with_fallback),
    days: int = Query(default=30, ge=7, le=90)
):
    """ROI 데이터 조회"""
    roi = get_roi_summary(user_id, days)

    return {
        "period_days": days,
        "roi": roi,
        "monthly_projection": {
            "cost_saved": roi["total_cost_saved"] * (30 / days),
            "revenue_gained": roi["total_revenue_gained"] * (30 / days),
        }
    }


# ============ 최적화 이력 ============

@router.get("/history/optimizations")
async def get_optimization_logs(
    user_id: int = Depends(get_user_id_with_fallback),
    platform_id: Optional[str] = None,
    days: int = Query(default=7, ge=1, le=30),
    limit: int = Query(default=50, ge=1, le=200)
):
    """최적화 실행 이력"""
    history = get_optimization_history(user_id, platform_id, days, limit)
    return {"history": history, "total": len(history)}


@router.get("/history/bid-changes")
async def get_bid_changes(
    user_id: int = Depends(get_user_id_with_fallback),
    platform_id: Optional[str] = None,
    days: int = Query(default=7, ge=1, le=30)
):
    """입찰가 변경 이력"""
    changes = get_bid_change_history(user_id, platform_id, days)

    # 통계 계산
    increase_count = sum(1 for c in changes if c.get("new_bid", 0) > c.get("old_bid", 0))
    decrease_count = sum(1 for c in changes if c.get("new_bid", 0) < c.get("old_bid", 0))
    pause_count = sum(1 for c in changes if c.get("new_bid", 0) == 0)

    return {
        "changes": changes,
        "stats": {
            "total_changes": len(changes),
            "bid_increases": increase_count,
            "bid_decreases": decrease_count,
            "paused_keywords": pause_count,
        }
    }


# ============ 알림 ============

@router.get("/notifications")
async def get_user_notifications(
    user_id: int = Depends(get_user_id_with_fallback),
    unread_only: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=100)
):
    """알림 목록 조회"""
    notifications = get_notifications(user_id, unread_only, limit)
    return {"notifications": notifications}


@router.post("/notifications/{notification_id}/read")
async def mark_as_read(notification_id: int):
    """알림 읽음 처리"""
    success = mark_notification_read(notification_id)
    return {"success": success}


# ============ 스케줄러 상태 ============

@router.get("/optimizer/status")
async def get_optimizer_status():
    """자동 최적화 스케줄러 상태"""
    return ad_auto_optimizer.get_status()


@router.post("/optimizer/run-now")
async def run_optimization_now(user_id: int = Depends(get_user_id_with_fallback), platform_id: Optional[str] = None):
    """즉시 최적화 실행"""
    # 수동 실행은 별도 로직
    from database.ad_optimization_db import get_auto_optimization_accounts

    accounts = get_auto_optimization_accounts()
    user_accounts = [a for a in accounts if a["user_id"] == user_id]

    if platform_id:
        user_accounts = [a for a in user_accounts if a["platform_id"] == platform_id]

    if not user_accounts:
        raise HTTPException(status_code=400, detail="자동 최적화가 활성화된 계정이 없습니다")

    # 최적화 실행
    results = {}
    for account in user_accounts:
        try:
            result = await ad_auto_optimizer._optimize_account(account)
            results[account["platform_id"]] = result
        except Exception as e:
            results[account["platform_id"]] = {"success": False, "error": str(e)}

    total_changes = sum(r.get("total_changes", 0) for r in results.values())

    return {
        "success": True,
        "message": f"{len(results)}개 플랫폼에서 {total_changes}건 최적화 완료",
        "results": results
    }


# ============ 실시간 데이터 ============

@router.get("/realtime/{platform_id}")
async def get_realtime_data(platform_id: str, user_id: int = Depends(get_user_id_with_fallback)):
    """실시간 데이터 조회"""
    account = get_ad_account(user_id, platform_id)

    if not account:
        raise HTTPException(status_code=404, detail="연동된 계정이 없습니다")

    try:
        service = get_platform_service(platform_id, account["credentials"])
        await service.connect()

        campaigns = await service.get_campaigns()
        keywords = await service.get_keywords() if hasattr(service, 'get_keywords') else []

        await service.disconnect()

        return {
            "platform_id": platform_id,
            "synced_at": datetime.now().isoformat(),
            "campaigns": [
                {
                    "id": c.campaign_id,
                    "name": c.name,
                    "status": c.status,
                    "budget": c.budget,
                    "spend": c.cost,
                    "conversions": c.conversions,
                    "roas": c.roas,
                }
                for c in campaigns
            ],
            "keywords_count": len(keywords),
            "top_keywords": [
                {
                    "text": k.keyword_text,
                    "bid": k.bid_amount,
                    "conversions": k.conversions,
                    "cost": k.cost,
                }
                for k in sorted(keywords, key=lambda x: x.conversions, reverse=True)[:10]
            ]
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"데이터 조회 실패: {str(e)}")


# ============ 키워드별 성과 비교 (Before/After) ============

@router.get("/performance/keywords")
async def get_keywords_performance(
    user_id: int = Depends(get_user_id_with_fallback),
    platform_id: Optional[str] = None
):
    """키워드별 최적화 전/후 성과 비교"""
    from database.ad_optimization_db import get_keyword_performance_comparison

    keywords = get_keyword_performance_comparison(user_id, platform_id)

    return {"keywords": keywords}


@router.get("/performance/trends")
async def get_performance_trends(
    user_id: int = Depends(get_user_id_with_fallback),
    days: int = Query(default=14, ge=1, le=30)
):
    """일별 성과 추이"""
    from database.ad_optimization_db import get_daily_performance_trends

    trends = get_daily_performance_trends(user_id, days)

    return {"trends": trends}


# ============ 실시간 스트리밍 (SSE) ============

@router.get("/stream/optimizations")
async def stream_optimizations(user_id: int = Depends(get_user_id_with_fallback)):
    """실시간 최적화 로그 스트리밍 (Server-Sent Events)"""
    from fastapi.responses import StreamingResponse
    import asyncio
    import json

    async def event_generator():
        last_id = 0
        error_count = 0
        max_errors = 5

        # 초기 heartbeat으로 연결 확인
        yield "event: connected\ndata: {}\n\n"

        while True:
            try:
                new_logs = get_optimization_history(user_id, None, days=1, limit=10)
                error_count = 0  # 성공 시 에러 카운트 리셋

                for log in new_logs:
                    if log.get("id", 0) > last_id:
                        last_id = log.get("id", 0)
                        yield f"data: {json.dumps(log, ensure_ascii=False)}\n\n"

                # heartbeat (클라이언트 연결 유지)
                yield ": heartbeat\n\n"

            except asyncio.CancelledError:
                # 클라이언트 연결 종료
                logger.info(f"SSE client disconnected: user_id={user_id}")
                break
            except Exception as e:
                error_count += 1
                logger.error(f"SSE polling error (user_id={user_id}, attempt {error_count}): {e}")

                if error_count >= max_errors:
                    yield f"event: error\ndata: {{\"message\": \"서버 오류가 반복되어 스트리밍을 종료합니다.\"}}\n\n"
                    break

                yield f"event: error\ndata: {{\"message\": \"일시적 오류, 재시도 중...\"}}\n\n"

            await asyncio.sleep(5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


# ============ 종합 성과 요약 ============

@router.get("/performance/summary")
async def get_performance_summary(
    user_id: int = Depends(get_user_id_with_fallback),
    days: int = Query(default=7, ge=1, le=30)
):
    """종합 성과 요약 - 최적화 효과 정량화"""
    from database.ad_optimization_db import (
        get_performance_history,
        get_optimization_history,
        get_bid_change_history,
    )

    accounts = get_user_ad_accounts(user_id)

    total_before = {"cost": 0, "revenue": 0, "conversions": 0}
    total_after = {"cost": 0, "revenue": 0, "conversions": 0}

    platform_summaries = []

    for account in accounts:
        history = get_performance_history(user_id, account["platform_id"], days)

        if len(history) >= 2:
            # 첫 절반 vs 마지막 절반 비교
            mid = len(history) // 2
            before_period = history[mid:]
            after_period = history[:mid]

            before = {
                "cost": sum(h.get("cost", 0) for h in before_period),
                "revenue": sum(h.get("revenue", 0) for h in before_period),
                "conversions": sum(h.get("conversions", 0) for h in before_period),
            }
            after = {
                "cost": sum(h.get("cost", 0) for h in after_period),
                "revenue": sum(h.get("revenue", 0) for h in after_period),
                "conversions": sum(h.get("conversions", 0) for h in after_period),
            }

            before_roas = (before["revenue"] / before["cost"] * 100) if before["cost"] > 0 else 0
            after_roas = (after["revenue"] / after["cost"] * 100) if after["cost"] > 0 else 0
            before_cpa = (before["cost"] / before["conversions"]) if before["conversions"] > 0 else 0
            after_cpa = (after["cost"] / after["conversions"]) if after["conversions"] > 0 else 0

            # 최적화 횟수
            optimizations = get_optimization_history(user_id, account["platform_id"], days)
            bid_changes = get_bid_change_history(user_id, account["platform_id"], days)

            platform_summaries.append({
                "platform_id": account["platform_id"],
                "account_name": account["account_name"],
                "before": {
                    **before,
                    "roas": before_roas,
                    "cpa": before_cpa,
                },
                "after": {
                    **after,
                    "roas": after_roas,
                    "cpa": after_cpa,
                },
                "improvements": {
                    "roas_change": after_roas - before_roas,
                    "roas_change_percent": ((after_roas - before_roas) / before_roas * 100) if before_roas > 0 else 0,
                    "cpa_change": after_cpa - before_cpa,
                    "cpa_change_percent": ((after_cpa - before_cpa) / before_cpa * 100) if before_cpa > 0 else 0,
                    "cost_saved": before["cost"] - after["cost"],
                    "revenue_gained": after["revenue"] - before["revenue"],
                    "conversions_gained": after["conversions"] - before["conversions"],
                },
                "optimization_count": len(optimizations),
                "bid_change_count": len(bid_changes),
            })

            total_before["cost"] += before["cost"]
            total_before["revenue"] += before["revenue"]
            total_before["conversions"] += before["conversions"]
            total_after["cost"] += after["cost"]
            total_after["revenue"] += after["revenue"]
            total_after["conversions"] += after["conversions"]

    # 전체 요약
    total_before_roas = (total_before["revenue"] / total_before["cost"] * 100) if total_before["cost"] > 0 else 0
    total_after_roas = (total_after["revenue"] / total_after["cost"] * 100) if total_after["cost"] > 0 else 0
    total_before_cpa = (total_before["cost"] / total_before["conversions"]) if total_before["conversions"] > 0 else 0
    total_after_cpa = (total_after["cost"] / total_after["conversions"]) if total_after["conversions"] > 0 else 0

    return {
        "period_days": days,
        "total": {
            "before": {
                **total_before,
                "roas": total_before_roas,
                "cpa": total_before_cpa,
            },
            "after": {
                **total_after,
                "roas": total_after_roas,
                "cpa": total_after_cpa,
            },
            "improvements": {
                "roas_change": total_after_roas - total_before_roas,
                "cpa_change": total_after_cpa - total_before_cpa,
                "cost_saved": total_before["cost"] - total_after["cost"],
                "revenue_gained": total_after["revenue"] - total_before["revenue"],
                "conversions_gained": total_after["conversions"] - total_before["conversions"],
            }
        },
        "platforms": platform_summaries,
    }


# ============ 플랫폼별 성과 조회 (가장 마지막에 위치해야 {platform_id} 패턴 매칭) ============

@router.get("/performance/{platform_id}")
async def get_platform_performance(
    platform_id: str,
    user_id: int = Depends(get_user_id_with_fallback),
    days: int = Query(default=30, ge=1, le=90)
):
    """플랫폼 성과 히스토리"""
    history = get_performance_history(user_id, platform_id, days)

    # 트렌드 계산
    if len(history) >= 2:
        recent = history[0]
        previous = history[-1]

        roas_trend = recent.get("roas", 0) - previous.get("roas", 0)
        cpa_trend = recent.get("cpa", 0) - previous.get("cpa", 0)
        conversions_trend = recent.get("conversions", 0) - previous.get("conversions", 0)
    else:
        roas_trend = cpa_trend = conversions_trend = 0

    return {
        "platform_id": platform_id,
        "period_days": days,
        "history": history,
        "trends": {
            "roas_change": roas_trend,
            "cpa_change": cpa_trend,
            "conversions_change": conversions_trend,
        }
    }
