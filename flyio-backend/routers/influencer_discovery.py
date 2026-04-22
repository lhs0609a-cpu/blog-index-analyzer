"""
인플루언서 발굴 API 엔드포인트
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Dict, Optional
import logging

from database.influencer_db import get_influencer_db
from services.influencer_discovery_service import get_influencer_discovery_service
from feature_config.feature_access import get_feature_access

router = APIRouter(prefix="/api/influencer-discovery", tags=["인플루언서발굴"])
logger = logging.getLogger(__name__)


# ===== Request/Response Models =====

class SearchRequest(BaseModel):
    query: str
    platforms: List[str] = ["youtube"]
    filters: Optional[Dict] = None
    sort_by: str = "score"
    page: int = 1
    page_size: int = 20


class BrowseRequest(BaseModel):
    platforms: List[str] = []
    min_followers: int = 0
    max_followers: int = 0
    min_engagement_rate: float = 0.0
    category: str = ""
    region: str = ""
    verified_only: bool = False
    sort_by: str = "followers"
    page: int = 1
    page_size: int = 20


class FavoriteRequest(BaseModel):
    profile_id: str
    notes: str = ""
    tags: List[str] = []


# ===== 검색 =====

@router.post("/search")
async def search_influencers(
    req: SearchRequest,
    user_id: str = Query("demo_user", description="사용자 ID"),
    plan: str = Query("free", description="구독 플랜"),
):
    """멀티플랫폼 인플루언서 통합 검색"""
    # 피처 접근 권한 체크
    access = get_feature_access("influencerDiscovery", plan)
    if not access["allowed"]:
        raise HTTPException(
            status_code=403,
            detail={
                "message": "인플루언서 발굴 기능을 사용할 수 없습니다",
                "upgrade_hint": access.get("upgrade_hint"),
            }
        )

    # 플랜별 제한 체크
    limits = access.get("limits") or {}
    allowed_platforms = limits.get("platforms", ["youtube"])
    daily_limit = limits.get("daily_searches", 3)

    # 일일 검색 횟수 체크
    db = get_influencer_db()
    if daily_limit > 0:
        today_count = db.get_daily_search_count(user_id)
        if today_count >= daily_limit:
            raise HTTPException(
                status_code=429,
                detail={
                    "message": f"일일 검색 횟수({daily_limit}회)를 초과했습니다",
                    "upgrade_hint": "더 많은 검색을 원하시면 플랜을 업그레이드하세요",
                }
            )

    # 허용된 플랫폼만 필터
    requested_platforms = [p for p in req.platforms if p in allowed_platforms]
    if not requested_platforms:
        requested_platforms = [allowed_platforms[0]] if allowed_platforms else ["youtube"]

    try:
        service = get_influencer_discovery_service()
        result = await service.search(
            query=req.query,
            user_id=user_id,
            platforms=requested_platforms,
            filters=req.filters or {},
            sort_by=req.sort_by,
            page=req.page,
            page_size=req.page_size,
        )
        return {"success": True, **result}
    except Exception as e:
        logger.error(f"Influencer search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===== 프로필 상세 =====

@router.get("/profile/{profile_id}")
async def get_profile(
    profile_id: str,
    user_id: str = Query("demo_user"),
):
    """인플루언서 프로필 상세 조회"""
    try:
        service = get_influencer_discovery_service()
        profile = await service.get_profile_detail(profile_id)
        if not profile:
            raise HTTPException(status_code=404, detail="프로필을 찾을 수 없습니다")

        # 즐겨찾기 여부
        db = get_influencer_db()
        profile["is_favorited"] = db.is_favorited(user_id, profile_id)

        return {"success": True, "profile": profile}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Profile fetch error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/profile/{profile_id}/posts")
async def get_profile_posts(
    profile_id: str,
    limit: int = Query(12, ge=1, le=50),
):
    """인플루언서 최근 게시물 조회"""
    try:
        service = get_influencer_discovery_service()
        posts = await service.get_profile_posts(profile_id, limit)
        return {"success": True, "posts": posts}
    except Exception as e:
        logger.error(f"Posts fetch error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===== 즐겨찾기 =====

@router.post("/favorites")
async def add_favorite(
    req: FavoriteRequest,
    user_id: str = Query("demo_user"),
):
    """즐겨찾기 추가"""
    try:
        db = get_influencer_db()
        profile = db.get_profile(req.profile_id)
        if not profile:
            raise HTTPException(status_code=404, detail="프로필을 찾을 수 없습니다")

        fav_id = db.add_favorite(user_id, req.profile_id, req.notes, req.tags)
        return {"success": True, "favorite_id": fav_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Add favorite error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/favorites")
async def get_favorites(user_id: str = Query("demo_user")):
    """즐겨찾기 목록"""
    try:
        db = get_influencer_db()
        favorites = db.get_favorites(user_id)
        return {"success": True, "favorites": favorites}
    except Exception as e:
        logger.error(f"Get favorites error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/favorites/{favorite_id}")
async def remove_favorite(
    favorite_id: str,
    user_id: str = Query("demo_user"),
):
    """즐겨찾기 삭제"""
    try:
        db = get_influencer_db()
        deleted = db.remove_favorite(favorite_id, user_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="즐겨찾기를 찾을 수 없습니다")
        return {"success": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Remove favorite error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===== 검색 기록 =====

@router.get("/search-history")
async def get_search_history(
    user_id: str = Query("demo_user"),
    limit: int = Query(20, ge=1, le=100),
):
    """검색 기록 조회"""
    try:
        db = get_influencer_db()
        history = db.get_search_history(user_id, limit)
        return {"success": True, "history": history}
    except Exception as e:
        logger.error(f"Search history error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===== 플랫폼 상태 =====

@router.get("/platform-status")
async def get_platform_status():
    """각 플랫폼 연결 상태 확인"""
    try:
        service = get_influencer_discovery_service()
        statuses = await service.get_platform_status()
        return {"success": True, "platforms": statuses}
    except Exception as e:
        logger.error(f"Platform status error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===== DB 탐색(Browse) 모드 =====

@router.post("/browse")
async def browse_influencers(
    req: BrowseRequest,
    plan: str = Query("free", description="구독 플랜"),
):
    """DB에서 인플루언서 브라우징 (API 호출 없음, 일일 제한 없음)"""
    access = get_feature_access("influencerDiscovery", plan)
    if not access["allowed"]:
        raise HTTPException(
            status_code=403,
            detail={
                "message": "인플루언서 발굴 기능을 사용할 수 없습니다",
                "upgrade_hint": access.get("upgrade_hint"),
            }
        )

    # 플랜별 허용 플랫폼 필터
    limits = access.get("limits") or {}
    allowed_platforms = limits.get("platforms", ["youtube"])
    requested_platforms = [p for p in req.platforms if p in allowed_platforms] if req.platforms else []

    try:
        service = get_influencer_discovery_service()
        result = service.browse(
            platforms=requested_platforms if requested_platforms else None,
            min_followers=req.min_followers,
            max_followers=req.max_followers,
            min_engagement_rate=req.min_engagement_rate,
            category=req.category,
            region=req.region,
            verified_only=req.verified_only,
            sort_by=req.sort_by,
            page=req.page,
            page_size=req.page_size,
        )
        return {"success": True, **result}
    except Exception as e:
        logger.error(f"Browse error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/browse/stats")
async def browse_stats():
    """DB 내 인플루언서 통계 (총 프로필 수, 플랫폼별, 카테고리별)"""
    try:
        db = get_influencer_db()
        stats = db.get_browse_stats()
        return {"success": True, **stats}
    except Exception as e:
        logger.error(f"Browse stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===== 자동 수집 스케줄러 =====

@router.get("/auto-collector/stats")
async def auto_collector_stats():
    """자동 수집 통계 조회"""
    try:
        from services.influencer_auto_collector import get_auto_collector
        collector = get_auto_collector()
        return {"success": True, "stats": collector.get_stats()}
    except Exception as e:
        logger.error(f"Auto collector stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/auto-collector/trigger")
async def trigger_auto_collector():
    """자동 수집 즉시 실행 (테스트/관리자용)"""
    try:
        from services.influencer_auto_collector import get_auto_collector
        import asyncio
        collector = get_auto_collector()
        asyncio.create_task(collector._daily_collection())
        return {"success": True, "message": "수집이 백그라운드에서 시작되었습니다"}
    except Exception as e:
        logger.error(f"Auto collector trigger error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
