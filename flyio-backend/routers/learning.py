"""
Learning Engine API Router
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Dict, Optional
from datetime import datetime

router = APIRouter()

# Import learning functions
try:
    from database.learning_db import (
        get_current_weights,
        save_current_weights,
        add_learning_sample,
        get_learning_samples,
        save_training_session,
        save_weight_history,
        get_training_history,
        get_learning_statistics
    )
    from services.learning_engine import (
        train_model,
        auto_train_if_needed,
        calculate_blog_score
    )
except ImportError as e:
    print(f"Warning: Learning modules not found: {e}")


# Request/Response Models
class BlogFeatures(BaseModel):
    c_rank_score: Optional[float] = 0
    dia_score: Optional[float] = 0
    post_count: Optional[int] = 0
    neighbor_count: Optional[int] = 0
    blog_age_days: Optional[int] = 0
    recent_posts_30d: Optional[int] = 0
    visitor_count: Optional[int] = 0


class SearchResult(BaseModel):
    blog_id: str
    actual_rank: int
    blog_features: BlogFeatures


class CollectRequest(BaseModel):
    keyword: str
    search_results: List[SearchResult]


class TrainRequest(BaseModel):
    batch_size: int = Field(default=100, ge=1, le=1000)
    learning_rate: float = Field(default=0.01, gt=0, le=1)
    epochs: int = Field(default=50, ge=1, le=200)


@router.post("/collect")
async def collect_learning_data(request: CollectRequest):
    """데이터 수집 + 자동 학습 (1개 샘플부터)"""
    try:
        current_weights = get_current_weights()
        samples_collected = 0

        for result in request.search_results:
            features = result.blog_features.dict()
            predicted_score = calculate_blog_score(features, current_weights)

            add_learning_sample(
                keyword=request.keyword,
                blog_id=result.blog_id,
                actual_rank=result.actual_rank,
                predicted_score=predicted_score,
                blog_features=features
            )
            samples_collected += 1

        all_samples = get_learning_samples(limit=1000)
        learning_triggered = False
        training_info = {}

        if len(all_samples) >= 1:
            trained, new_weights, training_info = auto_train_if_needed(
                samples=all_samples,
                current_weights=current_weights,
                min_samples=1
            )

            if trained:
                save_current_weights(new_weights)
                # 사용된 키워드 목록 추출
                unique_keywords = list(set([s.get('keyword', '') for s in all_samples if s.get('keyword')]))
                save_training_session(
                    session_id=training_info['session_id'],
                    samples_used=training_info['samples_used'],
                    accuracy_before=training_info['initial_accuracy'],
                    accuracy_after=training_info['final_accuracy'],
                    improvement=training_info['improvement'],
                    duration_seconds=training_info['duration_seconds'],
                    epochs=training_info['epochs'],
                    learning_rate=training_info['learning_rate'],
                    started_at=datetime.now().isoformat(),
                    completed_at=datetime.now().isoformat(),
                    keywords=unique_keywords[:10],  # 최대 10개 키워드 저장
                    weight_changes=training_info.get('weight_changes', {})
                )
                save_weight_history(
                    session_id=training_info['session_id'],
                    weights=new_weights,
                    accuracy=training_info['final_accuracy'],
                    total_samples=len(all_samples)
                )
                learning_triggered = True

        return {
            "success": True,
            "samples_collected": samples_collected,
            "total_samples": len(all_samples),
            "learning_triggered": learning_triggered,
            "message": "학습 완료!" if learning_triggered else "데이터 수집 완료",
            "training_info": training_info if learning_triggered else None
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"데이터 수집 실패: {str(e)}")


@router.post("/train")
async def manual_train(request: TrainRequest):
    """수동 학습 실행"""
    try:
        current_weights = get_current_weights()
        samples = get_learning_samples(limit=request.batch_size)

        if len(samples) < 1:
            raise HTTPException(
                status_code=400,
                detail="학습 데이터가 없습니다. 먼저 '키워드 검색' 페이지에서 검색을 수행하여 데이터를 수집해주세요."
            )

        new_weights, training_info = train_model(
            samples=samples,
            initial_weights=current_weights,
            learning_rate=request.learning_rate,
            epochs=request.epochs,
            min_samples=1
        )

        save_current_weights(new_weights)
        # 사용된 키워드 목록 추출
        unique_keywords = list(set([s.get('keyword', '') for s in samples if s.get('keyword')]))
        save_training_session(
            session_id=training_info['session_id'],
            samples_used=training_info['samples_used'],
            accuracy_before=training_info['initial_accuracy'],
            accuracy_after=training_info['final_accuracy'],
            improvement=training_info['improvement'],
            duration_seconds=training_info['duration_seconds'],
            epochs=training_info['epochs'],
            learning_rate=request.learning_rate,
            started_at=datetime.now().isoformat(),
            completed_at=datetime.now().isoformat(),
            keywords=unique_keywords[:10],  # 최대 10개 키워드 저장
            weight_changes=training_info.get('weight_changes', {})
        )
        save_weight_history(
            session_id=training_info['session_id'],
            weights=new_weights,
            accuracy=training_info['final_accuracy'],
            total_samples=len(samples)
        )

        return {
            "success": True,
            "session_id": training_info['session_id'],
            "initial_accuracy": training_info['initial_accuracy'],
            "final_accuracy": training_info['final_accuracy'],
            "improvement": training_info['improvement'],
            "iterations": training_info['epochs'],
            "duration_seconds": training_info['duration_seconds'],
            "weight_updates": training_info['weight_changes'],
            "keywords": unique_keywords[:10]
        }

    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Training error: {error_trace}")
        raise HTTPException(status_code=500, detail=f"학습 실행 실패: {str(e)}")


@router.get("/status")
async def get_learning_status():
    """현재 학습 상태"""
    try:
        current_weights = get_current_weights()
        statistics = get_learning_statistics()
        return {
            "current_weights": current_weights,
            "statistics": statistics
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"상태 조회 실패: {str(e)}")


@router.get("/history")
async def get_learning_history(limit: int = 50):
    """학습 히스토리"""
    try:
        sessions = get_training_history(limit=limit)
        return {"sessions": sessions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"히스토리 조회 실패: {str(e)}")


@router.get("/weights")
async def get_weights():
    """현재 가중치"""
    try:
        weights = get_current_weights()
        return weights
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"가중치 조회 실패: {str(e)}")


@router.get("/samples")
async def get_samples(limit: int = 100):
    """학습 샘플"""
    try:
        samples = get_learning_samples(limit=limit)
        return {"samples": samples, "total": len(samples)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"샘플 조회 실패: {str(e)}")
