"""
A/B 테스트 API 라우터
실험 관리, 사용자 할당, 이벤트 추적
"""
from fastapi import APIRouter, Query, Body
from typing import Dict, Any, Optional, List
import logging

from database.ab_test_db import get_ab_test_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ab-test", tags=["A/B Test"])


@router.get("/experiments")
async def get_experiments(
    status: Optional[str] = Query(default=None, description="실험 상태 필터 (active, draft, completed)")
) -> Dict[str, Any]:
    """모든 실험 목록 조회"""
    try:
        db = get_ab_test_db()
        experiments = db.get_all_experiments(status=status)
        return {
            "success": True,
            "count": len(experiments),
            "experiments": experiments
        }
    except Exception as e:
        logger.error(f"Failed to get experiments: {e}")
        return {"success": False, "error": str(e)}


@router.get("/experiments/{experiment_id}")
async def get_experiment(experiment_id: str) -> Dict[str, Any]:
    """특정 실험 정보 조회"""
    try:
        db = get_ab_test_db()
        experiment = db.get_experiment(experiment_id)
        if experiment:
            return {"success": True, "experiment": experiment}
        return {"success": False, "error": "Experiment not found"}
    except Exception as e:
        logger.error(f"Failed to get experiment: {e}")
        return {"success": False, "error": str(e)}


@router.get("/experiments/{experiment_id}/stats")
async def get_experiment_stats(experiment_id: str) -> Dict[str, Any]:
    """실험 통계 조회"""
    try:
        db = get_ab_test_db()
        stats = db.get_experiment_stats(experiment_id)
        return {"success": True, "stats": stats}
    except Exception as e:
        logger.error(f"Failed to get experiment stats: {e}")
        return {"success": False, "error": str(e)}


@router.get("/user/{user_id}/variant/{experiment_id}")
async def get_user_variant(user_id: str, experiment_id: str) -> Dict[str, Any]:
    """사용자의 특정 실험 변형 조회"""
    try:
        db = get_ab_test_db()
        variant = db.get_user_variant(experiment_id, user_id)
        if variant:
            return {"success": True, **variant}
        return {"success": False, "error": "No variant assigned"}
    except Exception as e:
        logger.error(f"Failed to get user variant: {e}")
        return {"success": False, "error": str(e)}


@router.get("/user/{user_id}/experiments")
async def get_user_experiments(user_id: str) -> Dict[str, Any]:
    """사용자의 모든 활성 실험 변형 조회"""
    try:
        db = get_ab_test_db()
        experiments = db.get_user_all_experiments(user_id)
        return {
            "success": True,
            "user_id": user_id,
            "experiments": experiments
        }
    except Exception as e:
        logger.error(f"Failed to get user experiments: {e}")
        return {"success": False, "error": str(e)}


@router.post("/track")
async def track_event(
    experiment_id: str = Body(...),
    user_id: str = Body(...),
    event_type: str = Body(...),
    event_data: Optional[Dict] = Body(default=None)
) -> Dict[str, Any]:
    """
    실험 이벤트 추적

    event_type 예시:
    - view: 페이지 조회
    - click: 클릭
    - conversion: 전환 (결제, 가입 등)
    - bounce: 이탈
    """
    try:
        db = get_ab_test_db()
        success = db.track_event(experiment_id, user_id, event_type, event_data)
        return {"success": success}
    except Exception as e:
        logger.error(f"Failed to track event: {e}")
        return {"success": False, "error": str(e)}


@router.post("/experiments")
async def create_experiment(
    experiment_id: str = Body(...),
    name: str = Body(...),
    description: str = Body(default=""),
    variants: Dict = Body(...),
    traffic_percentage: int = Body(default=100)
) -> Dict[str, Any]:
    """
    새 실험 생성

    variants 예시:
    {
        "control": {"weight": 50, "config": {"feature": false}},
        "variant_a": {"weight": 50, "config": {"feature": true}}
    }
    """
    try:
        db = get_ab_test_db()
        success = db.create_experiment(experiment_id, name, description, variants, traffic_percentage)
        if success:
            return {"success": True, "message": "Experiment created"}
        return {"success": False, "error": "Experiment already exists"}
    except Exception as e:
        logger.error(f"Failed to create experiment: {e}")
        return {"success": False, "error": str(e)}


@router.put("/experiments/{experiment_id}/status")
async def update_experiment_status(
    experiment_id: str,
    status: str = Body(..., embed=True)
) -> Dict[str, Any]:
    """실험 상태 업데이트 (draft, active, paused, completed)"""
    try:
        db = get_ab_test_db()
        success = db.update_experiment_status(experiment_id, status)
        if success:
            return {"success": True, "message": f"Status updated to {status}"}
        return {"success": False, "error": "Experiment not found"}
    except Exception as e:
        logger.error(f"Failed to update experiment status: {e}")
        return {"success": False, "error": str(e)}


@router.get("/health")
async def health_check() -> Dict[str, Any]:
    """A/B 테스트 시스템 상태 확인"""
    try:
        db = get_ab_test_db()
        experiments = db.get_all_experiments(status='active')
        return {
            "status": "healthy",
            "active_experiments": len(experiments),
            "experiment_ids": [e['id'] for e in experiments]
        }
    except Exception as e:
        return {"status": "unhealthy", "error": str(e)}
