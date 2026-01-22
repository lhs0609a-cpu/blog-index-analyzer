"""
추천 시스템 API 라우터
맞춤형 키워드/콘텐츠 추천
"""
from fastapi import APIRouter, Query, Body
from typing import Dict, Any, Optional, List
import logging

from database.recommendation_db import get_recommendation_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/recommendation", tags=["추천시스템"])


@router.get("/keywords/{user_id}")
async def get_keyword_recommendations(user_id: str) -> Dict[str, Any]:
    """
    사용자 맞춤 키워드 추천

    Returns:
        - personalized: 사용자 행동 기반 추천
        - trending: 인기 키워드
        - similar_users: 유사 사용자 기반 추천
        - category_based: 관심 카테고리 기반 추천
    """
    try:
        db = get_recommendation_db()
        recommendations = db.get_recommendations(user_id, rec_type='keywords')
        return {"success": True, **recommendations}
    except Exception as e:
        logger.error(f"Failed to get keyword recommendations: {e}")
        return {"success": False, "error": str(e)}


@router.get("/content/{user_id}")
async def get_content_recommendations(user_id: str) -> Dict[str, Any]:
    """
    사용자 맞춤 콘텐츠 아이디어 추천

    Returns:
        - content_ideas: 블로그 주제 아이디어 목록
    """
    try:
        db = get_recommendation_db()
        recommendations = db.get_recommendations(user_id, rec_type='content')
        return {"success": True, **recommendations}
    except Exception as e:
        logger.error(f"Failed to get content recommendations: {e}")
        return {"success": False, "error": str(e)}


@router.get("/trending")
async def get_trending_keywords(
    limit: int = Query(default=20, ge=1, le=100),
    category: Optional[str] = Query(default=None)
) -> Dict[str, Any]:
    """
    인기 키워드 조회
    """
    try:
        db = get_recommendation_db()
        keywords = db.get_trending_keywords(limit=limit, category=category)
        return {
            "success": True,
            "count": len(keywords),
            "keywords": keywords
        }
    except Exception as e:
        logger.error(f"Failed to get trending keywords: {e}")
        return {"success": False, "error": str(e)}


@router.get("/user/{user_id}/preferences")
async def get_user_preferences(user_id: str) -> Dict[str, Any]:
    """
    사용자 선호도 정보 조회
    """
    try:
        db = get_recommendation_db()
        preferences = db.get_user_preferences(user_id)
        if preferences:
            return {"success": True, "preferences": preferences}
        return {"success": True, "preferences": None, "message": "No preferences found"}
    except Exception as e:
        logger.error(f"Failed to get user preferences: {e}")
        return {"success": False, "error": str(e)}


@router.get("/user/{user_id}/history")
async def get_user_history(
    user_id: str,
    days: int = Query(default=30, ge=1, le=90),
    limit: int = Query(default=50, ge=1, le=200)
) -> Dict[str, Any]:
    """
    사용자 행동 기록 조회
    """
    try:
        db = get_recommendation_db()
        behaviors = db.get_user_recent_behaviors(user_id, days=days, limit=limit)
        return {
            "success": True,
            "count": len(behaviors),
            "behaviors": behaviors
        }
    except Exception as e:
        logger.error(f"Failed to get user history: {e}")
        return {"success": False, "error": str(e)}


@router.post("/track")
async def track_user_behavior(
    user_id: str = Body(...),
    action_type: str = Body(..., description="search, analyze, click, view, bookmark, share"),
    target_type: str = Body(..., description="keyword, blog, content, category"),
    target_value: str = Body(...),
    metadata: Optional[Dict] = Body(default=None)
) -> Dict[str, Any]:
    """
    사용자 행동 기록

    Examples:
        - 키워드 검색: action_type="search", target_type="keyword", target_value="맛집 추천"
        - 블로그 분석: action_type="analyze", target_type="blog", target_value="blog123"
        - 콘텐츠 클릭: action_type="click", target_type="content", target_value="guide-123"
    """
    try:
        db = get_recommendation_db()
        db.record_behavior(user_id, action_type, target_type, target_value, metadata)
        return {"success": True, "message": "Behavior recorded"}
    except Exception as e:
        logger.error(f"Failed to track behavior: {e}")
        return {"success": False, "error": str(e)}


@router.post("/track/batch")
async def track_batch_behaviors(
    behaviors: List[Dict] = Body(...)
) -> Dict[str, Any]:
    """
    일괄 행동 기록

    Each behavior should have:
        - user_id: str
        - action_type: str
        - target_type: str
        - target_value: str
        - metadata: Optional[Dict]
    """
    try:
        db = get_recommendation_db()
        recorded = 0
        errors = []

        for b in behaviors:
            try:
                db.record_behavior(
                    b['user_id'],
                    b['action_type'],
                    b['target_type'],
                    b['target_value'],
                    b.get('metadata')
                )
                recorded += 1
            except Exception as e:
                errors.append(str(e))

        return {
            "success": True,
            "recorded": recorded,
            "total": len(behaviors),
            "errors": errors if errors else None
        }
    except Exception as e:
        logger.error(f"Failed to track batch behaviors: {e}")
        return {"success": False, "error": str(e)}


@router.delete("/user/{user_id}/cache")
async def invalidate_user_cache(
    user_id: str,
    rec_type: Optional[str] = Query(default=None)
) -> Dict[str, Any]:
    """
    사용자 추천 캐시 무효화
    """
    try:
        db = get_recommendation_db()
        db.invalidate_cache(user_id, rec_type)
        return {"success": True, "message": "Cache invalidated"}
    except Exception as e:
        logger.error(f"Failed to invalidate cache: {e}")
        return {"success": False, "error": str(e)}


@router.get("/similar-keywords/{user_id}")
async def get_similar_user_keywords(
    user_id: str,
    limit: int = Query(default=20, ge=1, le=50)
) -> Dict[str, Any]:
    """
    유사 사용자 기반 키워드 추천
    """
    try:
        db = get_recommendation_db()
        keywords = db.get_similar_users_keywords(user_id, limit=limit)
        return {
            "success": True,
            "count": len(keywords),
            "keywords": keywords
        }
    except Exception as e:
        logger.error(f"Failed to get similar user keywords: {e}")
        return {"success": False, "error": str(e)}


@router.get("/health")
async def health_check() -> Dict[str, Any]:
    """추천 시스템 상태 확인"""
    try:
        db = get_recommendation_db()
        trending = db.get_trending_keywords(limit=1)
        return {
            "status": "healthy",
            "trending_keywords_count": len(trending)
        }
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}
