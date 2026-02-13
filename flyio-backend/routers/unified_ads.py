"""
통합 광고 플랫폼 관리 API
모든 광고 플랫폼(네이버, 구글, 메타, 카카오 등)의 연동 및 최적화 관리
"""
from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import Optional, Dict, List, Any
from datetime import datetime, timedelta
import json
import logging

from services.ad_platforms import (
    PLATFORM_SERVICES, PLATFORM_INFO,
    get_platform_service, get_all_platforms,
    unified_optimizer, OptimizationStrategy, AllocationStrategy
)
from routers.auth_deps import get_user_id_with_fallback

router = APIRouter(prefix="/api/ads", tags=["Unified Ads"])
logger = logging.getLogger(__name__)


# ============ 플랫폼 정의 ============
SUPPORTED_PLATFORMS = {
    # 검색 광고
    "naver_searchad": {"name": "네이버 검색광고", "category": "search"},
    "google_ads": {"name": "구글 애즈", "category": "search"},
    "kakao_keyword": {"name": "카카오 키워드광고", "category": "search"},
    "microsoft_ads": {"name": "마이크로소프트 광고", "category": "search"},

    # 소셜/디스플레이
    "meta_ads": {"name": "메타 광고", "category": "social"},
    "kakao_moment": {"name": "카카오모먼트", "category": "social"},
    "tiktok_ads": {"name": "틱톡 광고", "category": "social"},
    "twitter_ads": {"name": "X 광고", "category": "social"},
    "linkedin_ads": {"name": "링크드인 광고", "category": "social"},
    "pinterest_ads": {"name": "핀터레스트 광고", "category": "social"},
    "snapchat_ads": {"name": "스냅챗 광고", "category": "social"},

    # 동영상
    "youtube_ads": {"name": "유튜브 광고", "category": "video"},
    "naver_tv": {"name": "네이버 TV 광고", "category": "video"},

    # 네이티브/DSP
    "criteo": {"name": "크리테오", "category": "native"},
    "taboola": {"name": "타불라", "category": "native"},
    "outbrain": {"name": "아웃브레인", "category": "native"},
    "mobon": {"name": "모비온", "category": "native"},
    "dable": {"name": "데이블", "category": "native"},

    # 앱 광고
    "apple_searchads": {"name": "애플 서치 애즈", "category": "app"},
    "google_app_campaigns": {"name": "구글 앱 캠페인", "category": "app"},
    "admob": {"name": "애드몹", "category": "app"},

    # 커머스
    "naver_shopping": {"name": "네이버 쇼핑광고", "category": "commerce"},
    "coupang_ads": {"name": "쿠팡 광고", "category": "commerce"},
    "amazon_ads": {"name": "아마존 광고", "category": "commerce"},

    # 프로그래매틱
    "google_dv360": {"name": "구글 DV360", "category": "programmatic"},
    "thetradedesk": {"name": "더 트레이드 데스크", "category": "programmatic"},
    "nasmedia": {"name": "나스미디어", "category": "programmatic"},
}


# DB 기반 플랫폼 저장소 (인메모리 캐시 겸용)
from database.platform_store import (
    get_user_platforms as _db_get_user_platforms,
    save_platform_connection as _db_save_platform_connection,
    delete_platform_connection as _db_delete_platform_connection,
    update_platform_stats as _db_update_platform_stats,
    save_platform_credentials as _db_save_platform_credentials,
    get_platform_credentials as _db_get_platform_credentials,
    delete_platform_credentials as _db_delete_platform_credentials,
    get_optimization_status as _db_get_optimization_status,
    set_optimization_status as _db_set_optimization_status,
    get_platform_opt_settings as _db_get_platform_opt_settings,
    save_platform_opt_settings as _db_save_platform_opt_settings,
)

# 인메모리 캐시 (DB 읽기 성능 보완, 서버 재시작 시 DB에서 복구)
connected_platforms_db: Dict[int, Dict[str, Any]] = {}
platform_credentials_db: Dict[int, Dict[str, Dict[str, str]]] = {}
optimization_status_db: Dict[int, Dict[str, bool]] = {}
optimization_settings_db: Dict[int, Dict[str, Dict[str, Any]]] = {}


def _sync_platform_to_db(user_id: int, platform_id: str, account_name: str = None):
    """인메모리 → DB 동기화"""
    _db_save_platform_connection(user_id, platform_id, account_name)

def _sync_credentials_to_db(user_id: int, platform_id: str, credentials: Dict[str, str]):
    """자격증명 암호화 후 DB 저장"""
    _db_save_platform_credentials(user_id, platform_id, credentials)

def _load_user_from_db(user_id: int):
    """DB에서 사용자 데이터를 인메모리 캐시로 로드"""
    if user_id not in connected_platforms_db:
        db_platforms = _db_get_user_platforms(user_id)
        if db_platforms:
            connected_platforms_db[user_id] = db_platforms
    if user_id not in optimization_status_db:
        db_status = _db_get_optimization_status(user_id)
        if db_status:
            optimization_status_db[user_id] = db_status


# ============ 모델 정의 ============
class PlatformConnectRequest(BaseModel):
    """플랫폼 연동 요청"""
    credentials: Dict[str, str]
    account_name: Optional[str] = None


class PlatformStatus(BaseModel):
    """플랫폼 상태"""
    platform_id: str
    is_connected: bool
    is_active: bool
    last_sync_at: Optional[str] = None
    account_name: Optional[str] = None
    stats: Optional[Dict[str, Any]] = None


class OptimizationSettings(BaseModel):
    """최적화 설정"""
    strategy: str = "balanced"
    target_roas: float = 300
    target_cpa: float = 20000
    max_bid_change_ratio: float = 0.2
    min_bid: int = 70
    max_bid: int = 100000
    is_auto_optimization: bool = False


class BudgetAllocationRequest(BaseModel):
    """예산 배분 요청"""
    total_budget: float
    strategy: str = "performance"
    min_budget_per_platform: float = 10000


# ============ API 엔드포인트 ============

@router.get("/platforms/list")
async def list_platforms():
    """지원하는 모든 광고 플랫폼 목록"""
    # 구현된 플랫폼 정보 추가
    platforms_with_api = list(PLATFORM_SERVICES.keys())

    return {
        "platforms": [
            {
                "id": platform_id,
                "name": info["name"],
                "category": info["category"],
                "has_api": platform_id in platforms_with_api,
                "api_info": PLATFORM_INFO.get(platform_id, {})
            }
            for platform_id, info in SUPPORTED_PLATFORMS.items()
        ],
        "total": len(SUPPORTED_PLATFORMS),
        "implemented": len(platforms_with_api)
    }


@router.get("/platforms/implemented")
async def list_implemented_platforms():
    """API가 구현된 플랫폼 목록"""
    return {
        "platforms": get_all_platforms(),
        "total": len(PLATFORM_SERVICES)
    }


@router.get("/platforms/status")
async def get_platforms_status(user_id: int = Depends(get_user_id_with_fallback)):
    """사용자의 모든 플랫폼 연동 상태 조회"""
    _load_user_from_db(user_id)  # DB에서 캐시 복구
    user_platforms = connected_platforms_db.get(user_id, {})
    user_optimization = optimization_status_db.get(user_id, {})

    result = {}
    for platform_id in SUPPORTED_PLATFORMS.keys():
        platform_data = user_platforms.get(platform_id, {})
        is_connected = platform_data.get("is_connected", False)

        result[platform_id] = {
            "platform_id": platform_id,
            "is_connected": is_connected,
            "is_active": user_optimization.get(platform_id, False) if is_connected else False,
            "last_sync_at": platform_data.get("last_sync_at"),
            "account_name": platform_data.get("account_name"),
            "stats": platform_data.get("stats") if is_connected else None
        }

    return {"platforms": result}


@router.get("/platforms/{platform_id}/status")
async def get_platform_status(platform_id: str, user_id: int = Depends(get_user_id_with_fallback)):
    """특정 플랫폼 연동 상태 조회"""
    if platform_id not in SUPPORTED_PLATFORMS:
        raise HTTPException(status_code=404, detail="지원하지 않는 플랫폼입니다")

    user_platforms = connected_platforms_db.get(user_id, {})
    platform_data = user_platforms.get(platform_id, {})
    user_optimization = optimization_status_db.get(user_id, {})

    is_connected = platform_data.get("is_connected", False)

    return {
        "platform_id": platform_id,
        "platform_name": SUPPORTED_PLATFORMS[platform_id]["name"],
        "is_connected": is_connected,
        "is_active": user_optimization.get(platform_id, False) if is_connected else False,
        "last_sync_at": platform_data.get("last_sync_at"),
        "account_name": platform_data.get("account_name"),
        "stats": platform_data.get("stats") if is_connected else None,
        "api_info": PLATFORM_INFO.get(platform_id, {})
    }


@router.post("/platforms/{platform_id}/connect")
async def connect_platform(
    platform_id: str,
    request: PlatformConnectRequest,
    user_id: int = Depends(get_user_id_with_fallback)
):
    """광고 플랫폼 연동"""
    if platform_id not in SUPPORTED_PLATFORMS:
        raise HTTPException(status_code=404, detail="지원하지 않는 플랫폼입니다")

    # API가 구현된 플랫폼인 경우 실제 연결 테스트
    if platform_id in PLATFORM_SERVICES:
        try:
            service = get_platform_service(platform_id, request.credentials)
            is_valid = await service.validate_credentials()

            if not is_valid:
                raise HTTPException(status_code=400, detail="자격 증명이 유효하지 않습니다")

            # 계정 정보 조회
            account_info = await service.get_account_info()
            account_name = account_info.get("name") or request.account_name or f"{SUPPORTED_PLATFORMS[platform_id]['name']} 계정"

            # 통합 옵티마이저에 플랫폼 추가
            await unified_optimizer.add_platform(platform_id, request.credentials)

        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Platform connection failed: {platform_id} - {str(e)}")
            raise HTTPException(status_code=400, detail=f"연동 실패: {str(e)}")
    else:
        account_name = request.account_name or f"{SUPPORTED_PLATFORMS[platform_id]['name']} 계정"

    # 자격 증명 저장 (암호화하여 DB + 인메모리 캐시)
    _sync_credentials_to_db(user_id, platform_id, request.credentials)
    if user_id not in platform_credentials_db:
        platform_credentials_db[user_id] = {}
    platform_credentials_db[user_id][platform_id] = request.credentials

    # 연동 상태 저장
    if user_id not in connected_platforms_db:
        connected_platforms_db[user_id] = {}

    connected_platforms_db[user_id][platform_id] = {
        "is_connected": True,
        "account_name": account_name,
        "last_sync_at": datetime.now().isoformat(),
        "connected_at": datetime.now().isoformat(),
        "stats": {
            "total_spend": 0,
            "total_conversions": 0,
            "roas": 0,
            "optimizations_today": 0
        }
    }

    # DB에도 동기화
    _sync_platform_to_db(user_id, platform_id, account_name)

    return {
        "success": True,
        "message": f"{SUPPORTED_PLATFORMS[platform_id]['name']} 연동이 완료되었습니다",
        "platform_id": platform_id,
        "account_name": account_name
    }


@router.post("/platforms/{platform_id}/disconnect")
async def disconnect_platform(platform_id: str, user_id: int = Depends(get_user_id_with_fallback)):
    """광고 플랫폼 연동 해제"""
    if platform_id not in SUPPORTED_PLATFORMS:
        raise HTTPException(status_code=404, detail="지원하지 않는 플랫폼입니다")

    # 통합 옵티마이저에서 플랫폼 제거
    if platform_id in PLATFORM_SERVICES:
        try:
            await unified_optimizer.remove_platform(platform_id)
        except:
            pass

    # 자격 증명 삭제 (DB + 캐시)
    _db_delete_platform_credentials(user_id, platform_id)
    if user_id in platform_credentials_db and platform_id in platform_credentials_db[user_id]:
        del platform_credentials_db[user_id][platform_id]

    # 연동 상태 삭제 (DB + 캐시)
    _db_delete_platform_connection(user_id, platform_id)
    if user_id in connected_platforms_db and platform_id in connected_platforms_db[user_id]:
        del connected_platforms_db[user_id][platform_id]

    # 최적화 상태 삭제 (DB + 캐시)
    _db_set_optimization_status(user_id, platform_id, False)
    if user_id in optimization_status_db and platform_id in optimization_status_db[user_id]:
        del optimization_status_db[user_id][platform_id]

    return {
        "success": True,
        "message": f"{SUPPORTED_PLATFORMS[platform_id]['name']} 연동이 해제되었습니다"
    }


@router.post("/platforms/{platform_id}/optimization/start")
async def start_optimization(platform_id: str, user_id: int = Depends(get_user_id_with_fallback)):
    """플랫폼 자동 최적화 시작"""
    if platform_id not in SUPPORTED_PLATFORMS:
        raise HTTPException(status_code=404, detail="지원하지 않는 플랫폼입니다")

    # 연동 확인
    user_platforms = connected_platforms_db.get(user_id, {})
    if platform_id not in user_platforms or not user_platforms[platform_id].get("is_connected"):
        raise HTTPException(status_code=400, detail="먼저 플랫폼을 연동해주세요")

    # 최적화 시작
    if user_id not in optimization_status_db:
        optimization_status_db[user_id] = {}
    optimization_status_db[user_id][platform_id] = True

    return {
        "success": True,
        "message": f"{SUPPORTED_PLATFORMS[platform_id]['name']} 자동 최적화가 시작되었습니다",
        "is_active": True
    }


@router.post("/platforms/{platform_id}/optimization/stop")
async def stop_optimization(platform_id: str, user_id: int = Depends(get_user_id_with_fallback)):
    """플랫폼 자동 최적화 중지"""
    if platform_id not in SUPPORTED_PLATFORMS:
        raise HTTPException(status_code=404, detail="지원하지 않는 플랫폼입니다")

    # 최적화 중지
    if user_id in optimization_status_db and platform_id in optimization_status_db[user_id]:
        optimization_status_db[user_id][platform_id] = False

    return {
        "success": True,
        "message": f"{SUPPORTED_PLATFORMS[platform_id]['name']} 자동 최적화가 중지되었습니다",
        "is_active": False
    }


@router.get("/platforms/{platform_id}/settings")
async def get_platform_settings(platform_id: str, user_id: int = Depends(get_user_id_with_fallback)):
    """플랫폼 최적화 설정 조회"""
    if platform_id not in SUPPORTED_PLATFORMS:
        raise HTTPException(status_code=404, detail="지원하지 않는 플랫폼입니다")

    # 사용자 설정 조회
    user_settings = optimization_settings_db.get(user_id, {}).get(platform_id, {})

    return {
        "platform_id": platform_id,
        "settings": {
            "strategy": user_settings.get("strategy", "balanced"),
            "target_roas": user_settings.get("target_roas", 300),
            "target_cpa": user_settings.get("target_cpa", 20000),
            "max_bid_change_ratio": user_settings.get("max_bid_change_ratio", 0.2),
            "min_bid": user_settings.get("min_bid", 70),
            "max_bid": user_settings.get("max_bid", 100000),
            "is_auto_optimization": optimization_status_db.get(user_id, {}).get(platform_id, False)
        }
    }


@router.post("/platforms/{platform_id}/settings")
async def update_platform_settings(
    platform_id: str,
    settings: OptimizationSettings,
    user_id: int = Depends(get_user_id_with_fallback)
):
    """플랫폼 최적화 설정 업데이트"""
    if platform_id not in SUPPORTED_PLATFORMS:
        raise HTTPException(status_code=404, detail="지원하지 않는 플랫폼입니다")

    # 설정 저장
    if user_id not in optimization_settings_db:
        optimization_settings_db[user_id] = {}
    optimization_settings_db[user_id][platform_id] = settings.dict()

    return {
        "success": True,
        "message": "설정이 저장되었습니다",
        "settings": settings.dict()
    }


@router.get("/platforms/{platform_id}/performance")
async def get_platform_performance(
    platform_id: str,
    user_id: int = Depends(get_user_id_with_fallback),
    days: int = Query(default=7, ge=1, le=90)
):
    """플랫폼 성과 데이터 조회"""
    if platform_id not in SUPPORTED_PLATFORMS:
        raise HTTPException(status_code=404, detail="지원하지 않는 플랫폼입니다")

    # 연동 확인
    user_platforms = connected_platforms_db.get(user_id, {})
    if platform_id not in user_platforms or not user_platforms[platform_id].get("is_connected"):
        raise HTTPException(status_code=400, detail="먼저 플랫폼을 연동해주세요")

    # API가 구현된 플랫폼인 경우 실제 데이터 조회
    if platform_id in PLATFORM_SERVICES:
        credentials = platform_credentials_db.get(user_id, {}).get(platform_id, {})
        if credentials:
            try:
                service = get_platform_service(platform_id, credentials)
                await service.connect()

                end_date = datetime.now()
                start_date = end_date - timedelta(days=days)

                performance_data = await service.get_performance(start_date, end_date)

                # 집계
                total_impressions = sum(p.impressions for p in performance_data)
                total_clicks = sum(p.clicks for p in performance_data)
                total_cost = sum(p.cost for p in performance_data)
                total_conversions = sum(p.conversions for p in performance_data)
                total_revenue = sum(p.revenue for p in performance_data)

                return {
                    "platform_id": platform_id,
                    "period_days": days,
                    "performance": {
                        "impressions": total_impressions,
                        "clicks": total_clicks,
                        "ctr": (total_clicks / total_impressions * 100) if total_impressions > 0 else 0,
                        "conversions": total_conversions,
                        "conversion_rate": (total_conversions / total_clicks * 100) if total_clicks > 0 else 0,
                        "cost": total_cost,
                        "revenue": total_revenue,
                        "roas": (total_revenue / total_cost * 100) if total_cost > 0 else 0,
                        "avg_cpc": (total_cost / total_clicks) if total_clicks > 0 else 0,
                        "cpa": (total_cost / total_conversions) if total_conversions > 0 else 0
                    },
                    "daily_data": [
                        {
                            "date": p.date,
                            "impressions": p.impressions,
                            "clicks": p.clicks,
                            "cost": p.cost,
                            "conversions": p.conversions,
                            "revenue": p.revenue,
                            "ctr": p.ctr,
                            "cpc": p.cpc,
                            "roas": p.roas
                        }
                        for p in performance_data
                    ]
                }
            except Exception as e:
                logger.error(f"Performance fetch failed: {platform_id} - {str(e)}")

    # 더미 성과 데이터 (API 미구현 또는 에러) - is_demo_data 플래그 포함
    return {
        "platform_id": platform_id,
        "period_days": days,
        "is_demo_data": True,
        "demo_reason": "이 플랫폼의 API가 아직 연동되지 않았거나, 데이터를 불러올 수 없습니다.",
        "performance": {
            "impressions": 125000,
            "clicks": 3750,
            "ctr": 3.0,
            "conversions": 47,
            "conversion_rate": 1.25,
            "cost": 1250000,
            "revenue": 4275000,
            "roas": 342,
            "avg_cpc": 333,
            "avg_position": 2.3
        },
        "daily_data": []
    }


@router.post("/platforms/{platform_id}/sync")
async def sync_platform_data(platform_id: str, user_id: int = Depends(get_user_id_with_fallback)):
    """플랫폼 데이터 동기화"""
    if platform_id not in SUPPORTED_PLATFORMS:
        raise HTTPException(status_code=404, detail="지원하지 않는 플랫폼입니다")

    # 연동 확인
    user_platforms = connected_platforms_db.get(user_id, {})
    if platform_id not in user_platforms or not user_platforms[platform_id].get("is_connected"):
        raise HTTPException(status_code=400, detail="먼저 플랫폼을 연동해주세요")

    # API가 구현된 플랫폼인 경우 실제 동기화
    if platform_id in PLATFORM_SERVICES:
        credentials = platform_credentials_db.get(user_id, {}).get(platform_id, {})
        if credentials:
            try:
                service = get_platform_service(platform_id, credentials)
                await service.connect()

                # 캠페인 데이터 조회
                campaigns = await service.get_campaigns()

                total_spend = sum(c.cost for c in campaigns)
                total_conversions = sum(c.conversions for c in campaigns)
                total_revenue = sum(c.revenue for c in campaigns)

                # 통계 업데이트
                connected_platforms_db[user_id][platform_id]["stats"] = {
                    "total_spend": total_spend,
                    "total_conversions": total_conversions,
                    "total_revenue": total_revenue,
                    "roas": (total_revenue / total_spend * 100) if total_spend > 0 else 0,
                    "campaigns_count": len(campaigns)
                }
            except Exception as e:
                logger.error(f"Sync failed: {platform_id} - {str(e)}")

    # 동기화 시간 업데이트
    connected_platforms_db[user_id][platform_id]["last_sync_at"] = datetime.now().isoformat()

    return {
        "success": True,
        "message": "데이터 동기화가 완료되었습니다",
        "synced_at": datetime.now().isoformat(),
        "stats": connected_platforms_db[user_id][platform_id].get("stats", {})
    }


@router.get("/dashboard/summary")
async def get_dashboard_summary(user_id: int = Depends(get_user_id_with_fallback)):
    """통합 대시보드 요약"""
    user_platforms = connected_platforms_db.get(user_id, {})
    user_optimization = optimization_status_db.get(user_id, {})

    connected_count = sum(1 for p in user_platforms.values() if p.get("is_connected"))
    active_count = sum(1 for p_id, active in user_optimization.items() if active and user_platforms.get(p_id, {}).get("is_connected"))

    # 전체 통계 집계
    total_spend = sum(p.get("stats", {}).get("total_spend", 0) for p in user_platforms.values())
    total_conversions = sum(p.get("stats", {}).get("total_conversions", 0) for p in user_platforms.values())
    total_revenue = sum(p.get("stats", {}).get("total_revenue", 0) for p in user_platforms.values())

    return {
        "summary": {
            "total_platforms": len(SUPPORTED_PLATFORMS),
            "connected_platforms": connected_count,
            "active_optimizations": active_count,
            "total_spend": total_spend,
            "total_conversions": total_conversions,
            "total_revenue": total_revenue,
            "avg_roas": (total_revenue / total_spend * 100) if total_spend > 0 else 0,
        },
        "platforms": [
            {
                "platform_id": platform_id,
                "platform_name": SUPPORTED_PLATFORMS[platform_id]["name"],
                "is_connected": user_platforms.get(platform_id, {}).get("is_connected", False),
                "is_active": user_optimization.get(platform_id, False),
                "stats": user_platforms.get(platform_id, {}).get("stats")
            }
            for platform_id in SUPPORTED_PLATFORMS.keys()
            if user_platforms.get(platform_id, {}).get("is_connected", False)
        ]
    }


# ============ 크로스 플랫폼 기능 ============

@router.get("/cross-platform/report")
async def get_cross_platform_report(
    user_id: int = Depends(get_user_id_with_fallback),
    days: int = Query(default=30, ge=1, le=90)
):
    """크로스 플랫폼 종합 리포트"""
    try:
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)

        report = await unified_optimizer.get_cross_platform_report(start_date, end_date)

        return {
            "success": True,
            "report": {
                "report_date": report.report_date,
                "total_platforms": report.total_platforms,
                "connected_platforms": report.connected_platforms,
                "total_spend": report.total_spend,
                "total_revenue": report.total_revenue,
                "total_conversions": report.total_conversions,
                "overall_roas": report.overall_roas,
                "overall_cpa": report.overall_cpa,
                "platform_breakdown": report.platform_breakdown,
                "recommendations": report.recommendations,
            }
        }
    except Exception as e:
        logger.error(f"Cross-platform report failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cross-platform/compare")
async def compare_platforms(user_id: int = Depends(get_user_id_with_fallback)):
    """플랫폼간 성과 비교"""
    try:
        comparison = await unified_optimizer.compare_platform_performance()
        return {
            "success": True,
            "comparison": comparison
        }
    except Exception as e:
        logger.error(f"Platform comparison failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cross-platform/anomalies")
async def detect_anomalies(user_id: int = Depends(get_user_id_with_fallback)):
    """이상 징후 감지"""
    try:
        anomalies = await unified_optimizer.detect_anomalies()
        return {
            "success": True,
            "anomalies": anomalies,
            "total": len(anomalies)
        }
    except Exception as e:
        logger.error(f"Anomaly detection failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cross-platform/optimize-all")
async def optimize_all_platforms(
    user_id: int = Depends(get_user_id_with_fallback),
    strategy: str = Query(default="balanced")
):
    """모든 플랫폼 일괄 최적화"""
    try:
        strategy_enum = OptimizationStrategy(strategy)
        results = await unified_optimizer.run_optimization(strategy=strategy_enum)

        total_changes = sum(r.total_changes for r in results.values())

        return {
            "success": True,
            "message": f"전체 {len(results)}개 플랫폼에서 {total_changes}건 최적화 완료",
            "results": {
                pid: {
                    "success": r.success,
                    "changes": r.changes,
                    "total_changes": r.total_changes,
                    "message": r.message
                }
                for pid, r in results.items()
            }
        }
    except Exception as e:
        logger.error(f"Optimization failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cross-platform/budget-allocation")
async def optimize_budget_allocation(
    request: BudgetAllocationRequest,
    user_id: int = Depends(get_user_id_with_fallback)
):
    """크로스 플랫폼 예산 배분 최적화"""
    try:
        strategy_enum = AllocationStrategy(request.strategy)
        allocations = await unified_optimizer.optimize_budget_allocation(
            total_budget=request.total_budget,
            strategy=strategy_enum,
            min_budget_per_platform=request.min_budget_per_platform
        )

        return {
            "success": True,
            "allocations": [
                {
                    "platform_id": a.platform_id,
                    "platform_name": a.platform_name,
                    "current_budget": a.current_budget,
                    "recommended_budget": a.recommended_budget,
                    "change_percent": a.change_percent,
                    "reason": a.reason
                }
                for a in allocations
            ]
        }
    except Exception as e:
        logger.error(f"Budget allocation failed: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============ 플랫폼별 특화 기능 ============

@router.get("/platforms/{platform_id}/keywords")
async def get_platform_keywords(
    platform_id: str,
    user_id: int = Depends(get_user_id_with_fallback),
    limit: int = Query(default=50, ge=1, le=500)
):
    """플랫폼 키워드 목록 조회 (검색 광고용)"""
    search_platforms = ["naver_searchad", "google_ads", "kakao_keyword", "microsoft_ads", "coupang_ads"]

    if platform_id not in search_platforms:
        raise HTTPException(status_code=400, detail="검색 광고 플랫폼만 키워드 조회가 가능합니다")

    # API가 구현된 플랫폼인 경우 실제 데이터 조회
    if platform_id in PLATFORM_SERVICES:
        credentials = platform_credentials_db.get(user_id, {}).get(platform_id, {})
        if credentials:
            try:
                service = get_platform_service(platform_id, credentials)
                await service.connect()

                keywords = await service.get_keywords()

                return {
                    "platform_id": platform_id,
                    "keywords": [
                        {
                            "keyword_id": kw.keyword_id,
                            "keyword_text": kw.keyword_text,
                            "match_type": kw.match_type,
                            "status": kw.status,
                            "bid_amount": kw.bid_amount,
                            "quality_score": kw.quality_score,
                            "impressions": kw.impressions,
                            "clicks": kw.clicks,
                            "cost": kw.cost,
                            "conversions": kw.conversions,
                            "ctr": kw.ctr,
                            "cpc": kw.cpc
                        }
                        for kw in keywords[:limit]
                    ],
                    "total": len(keywords)
                }
            except Exception as e:
                logger.error(f"Keywords fetch failed: {platform_id} - {str(e)}")

    return {
        "platform_id": platform_id,
        "keywords": [],
        "total": 0
    }


@router.get("/platforms/{platform_id}/campaigns")
async def get_platform_campaigns(
    platform_id: str,
    user_id: int = Depends(get_user_id_with_fallback)
):
    """플랫폼 캠페인 목록 조회"""
    # API가 구현된 플랫폼인 경우 실제 데이터 조회
    if platform_id in PLATFORM_SERVICES:
        credentials = platform_credentials_db.get(user_id, {}).get(platform_id, {})
        if credentials:
            try:
                service = get_platform_service(platform_id, credentials)
                await service.connect()

                campaigns = await service.get_campaigns()

                return {
                    "platform_id": platform_id,
                    "campaigns": [
                        {
                            "campaign_id": c.campaign_id,
                            "name": c.name,
                            "status": c.status,
                            "budget": c.budget,
                            "budget_type": c.budget_type,
                            "impressions": c.impressions,
                            "clicks": c.clicks,
                            "cost": c.cost,
                            "conversions": c.conversions,
                            "revenue": c.revenue,
                            "ctr": c.ctr,
                            "cpc": c.cpc,
                            "cpa": c.cpa,
                            "roas": c.roas
                        }
                        for c in campaigns
                    ],
                    "total": len(campaigns)
                }
            except Exception as e:
                logger.error(f"Campaigns fetch failed: {platform_id} - {str(e)}")

    return {
        "platform_id": platform_id,
        "campaigns": [],
        "total": 0
    }


@router.post("/platforms/{platform_id}/optimize-once")
async def run_optimization_once(
    platform_id: str,
    user_id: int = Depends(get_user_id_with_fallback),
    strategy: str = Query(default="balanced")
):
    """1회 최적화 실행"""
    if platform_id not in SUPPORTED_PLATFORMS:
        raise HTTPException(status_code=404, detail="지원하지 않는 플랫폼입니다")

    # 연동 확인
    user_platforms = connected_platforms_db.get(user_id, {})
    if platform_id not in user_platforms or not user_platforms[platform_id].get("is_connected"):
        raise HTTPException(status_code=400, detail="먼저 플랫폼을 연동해주세요")

    # API가 구현된 플랫폼인 경우 실제 최적화 실행
    if platform_id in PLATFORM_SERVICES:
        credentials = platform_credentials_db.get(user_id, {}).get(platform_id, {})
        if credentials:
            try:
                service = get_platform_service(platform_id, credentials)
                await service.connect()

                # 사용자 설정 조회
                user_settings = optimization_settings_db.get(user_id, {}).get(platform_id, {})

                strategy_enum = OptimizationStrategy(strategy)
                result = await service.optimize(strategy=strategy_enum, settings=user_settings)

                return {
                    "success": result.success,
                    "message": result.message,
                    "changes": result.changes,
                    "total_changes": result.total_changes,
                    "optimized_at": result.optimized_at
                }
            except Exception as e:
                logger.error(f"Optimization failed: {platform_id} - {str(e)}")
                raise HTTPException(status_code=500, detail=f"최적화 실패: {str(e)}")

    return {
        "success": True,
        "message": f"{SUPPORTED_PLATFORMS[platform_id]['name']} 최적화가 완료되었습니다",
        "changes": [],
        "total_changes": 0
    }


# ============ 진단 엔드포인트 ============

@router.get("/diagnostic/naver")
async def diagnostic_naver():
    """네이버 검색광고 API 진단"""
    from services.naver_ad_service import NaverAdApiClient
    from config import settings

    result = {
        "credentials_configured": bool(settings.NAVER_AD_CUSTOMER_ID and settings.NAVER_AD_API_KEY),
        "customer_id": settings.NAVER_AD_CUSTOMER_ID[:4] + "***" if settings.NAVER_AD_CUSTOMER_ID else None,
        "api_test": None,
        "campaigns": None,
        "error": None
    }

    if not result["credentials_configured"]:
        result["error"] = "API 자격증명이 설정되지 않았습니다"
        return result

    try:
        client = NaverAdApiClient()
        campaigns = await client.get_campaigns()
        result["api_test"] = "success"
        result["campaigns"] = {
            "count": len(campaigns),
            "sample": [{"name": c.get("name"), "status": c.get("status")} for c in campaigns[:3]]
        }
        await client.close()
    except Exception as e:
        result["api_test"] = "failed"
        result["error"] = str(e)

    return result


@router.get("/diagnostic/all")
async def diagnostic_all():
    """모든 플랫폼 API 진단"""
    from config import settings

    results = {}

    # 네이버 검색광고
    results["naver_searchad"] = {
        "configured": bool(settings.NAVER_AD_CUSTOMER_ID and settings.NAVER_AD_API_KEY),
        "customer_id": settings.NAVER_AD_CUSTOMER_ID[:4] + "***" if settings.NAVER_AD_CUSTOMER_ID else None
    }

    # 다른 플랫폼들 (환경변수 확인)
    for platform_id, info in PLATFORM_INFO.items():
        if platform_id == "naver_searchad":
            continue
        results[platform_id] = {
            "configured": False,
            "required_fields": info.get("required_fields", []),
            "note": "사용자별 자격증명 필요"
        }

    return {
        "platforms": results,
        "service_level_platforms": ["naver_searchad"],
        "user_level_platforms": list(PLATFORM_INFO.keys())
    }
