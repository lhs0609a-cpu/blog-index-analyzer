"""
소셜 프루프 API 라우터
실시간 커뮤니티 활동 조회 및 통계 API
"""
from fastapi import APIRouter, Query, BackgroundTasks
from fastapi.responses import StreamingResponse
from typing import List, Dict, Any, Optional
import asyncio
import json
import logging
from datetime import datetime

from database.social_proof_db import get_social_proof_db, SocialProofDB

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/social-proof", tags=["Social Proof"])


@router.get("/activities")
async def get_recent_activities(
    limit: int = Query(default=20, ge=1, le=100, description="가져올 활동 수")
) -> Dict[str, Any]:
    """
    최근 활동 목록 조회
    - 최신순으로 정렬
    - 기본 20개, 최대 100개
    """
    try:
        db = get_social_proof_db()
        activities = db.get_recent_activities(limit=limit)

        return {
            "success": True,
            "count": len(activities),
            "activities": activities
        }
    except Exception as e:
        logger.error(f"Failed to get activities: {e}")
        return {
            "success": False,
            "error": str(e),
            "activities": []
        }


@router.get("/stats")
async def get_stats() -> Dict[str, Any]:
    """
    실시간 통계 조회
    - 현재 온라인 수
    - 오늘 분석 횟수
    - 누적 사용자 수
    """
    try:
        db = get_social_proof_db()
        stats = db.get_stats()

        return {
            "success": True,
            "stats": stats,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Failed to get stats: {e}")
        return {
            "success": False,
            "error": str(e),
            "stats": {
                "current_online": 1247,
                "daily_analyses": 4892,
                "total_users": 52341
            }
        }


@router.get("/stream")
async def stream_activities():
    """
    SSE (Server-Sent Events) 스트림으로 실시간 활동 전송
    - 클라이언트가 연결하면 새 활동이 생성될 때마다 전송
    - 2-5초 간격으로 새 활동 생성
    """
    async def event_generator():
        db = get_social_proof_db()

        while True:
            try:
                # 새 활동 생성
                activity = db.generate_activity()

                # SSE 형식으로 전송
                data = json.dumps(activity, ensure_ascii=False, default=str)
                yield f"data: {data}\n\n"

                # 통계도 업데이트
                if activity['type'] in ['analysis_complete', 'analysis_check', 'keyword_search']:
                    db.increment_stats(analyses=1)
                elif activity['type'] == 'new_user':
                    db.increment_stats(new_users=1)

                # 2-5초 대기 (랜덤)
                import random
                await asyncio.sleep(random.uniform(2, 5))

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Stream error: {e}")
                await asyncio.sleep(5)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.post("/generate")
async def generate_activity(
    count: int = Query(default=1, ge=1, le=50, description="생성할 활동 수")
) -> Dict[str, Any]:
    """
    활동 수동 생성 (관리자용)
    - count 개수만큼 활동 생성
    - 테스트 또는 초기 데이터 생성용
    """
    try:
        db = get_social_proof_db()
        activities = []

        for _ in range(count):
            activity = db.generate_activity()
            activities.append(activity)

        return {
            "success": True,
            "generated": len(activities),
            "activities": activities
        }
    except Exception as e:
        logger.error(f"Failed to generate activities: {e}")
        return {
            "success": False,
            "error": str(e)
        }


@router.delete("/cleanup")
async def cleanup_old_activities(
    days: int = Query(default=7, ge=1, le=30, description="보관 기간(일)")
) -> Dict[str, Any]:
    """
    오래된 활동 정리 (관리자용)
    - days 일 이전의 활동 삭제
    """
    try:
        db = get_social_proof_db()
        deleted = db.cleanup_old_activities(days=days)

        return {
            "success": True,
            "deleted": deleted,
            "message": f"Deleted {deleted} activities older than {days} days"
        }
    except Exception as e:
        logger.error(f"Failed to cleanup activities: {e}")
        return {
            "success": False,
            "error": str(e)
        }


@router.get("/health")
async def health_check() -> Dict[str, Any]:
    """소셜 프루프 시스템 상태 확인"""
    try:
        db = get_social_proof_db()
        activities = db.get_recent_activities(limit=1)
        stats = db.get_stats()

        return {
            "status": "healthy",
            "has_activities": len(activities) > 0,
            "stats": stats,
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }
