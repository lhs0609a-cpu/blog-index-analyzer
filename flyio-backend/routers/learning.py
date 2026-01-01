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


@router.get("/deviation-analysis")
async def get_deviation_analysis():
    """
    괴리율 분석 - 실제 순위와 예측 점수의 차이 분석 (키워드별 그룹화)

    Returns:
        - overall_deviation: 전체 평균 괴리율
        - rank_accuracy: 순위 예측 정확도 (±3 순위 이내)
        - deviation_by_rank: 순위별 괴리율
        - worst_predictions: 가장 크게 벗어난 예측들
        - weight_impact: 각 가중치가 순위에 미치는 영향
        - keyword_analysis: 키워드별 분석 결과
    """
    try:
        from scipy.stats import spearmanr, rankdata
        import numpy as np
        from collections import defaultdict

        samples = get_learning_samples(limit=1000)
        current_weights = get_current_weights()

        if len(samples) < 13:
            return {
                "message": "분석에 필요한 데이터가 부족합니다. 최소 1개 키워드(13개 블로그) 이상 필요합니다.",
                "total_samples": len(samples),
                "overall_deviation": None
            }

        # ===== 키워드별로 그룹화 (핵심 수정!) =====
        keyword_groups = defaultdict(list)
        for s in samples:
            keyword = s.get('keyword', '')
            if keyword and s.get('actual_rank') and s.get('predicted_score'):
                keyword_groups[keyword].append({
                    'keyword': keyword,
                    'blog_id': s.get('blog_id', ''),
                    'actual_rank': s.get('actual_rank'),
                    'predicted_score': s.get('predicted_score'),
                    'c_rank_score': s.get('c_rank_score', 0),
                    'dia_score': s.get('dia_score', 0),
                    'post_count': s.get('post_count', 0),
                    'neighbor_count': s.get('neighbor_count', 0)
                })

        # 최소 10개 블로그가 있는 키워드만 분석
        valid_keywords = {k: v for k, v in keyword_groups.items() if len(v) >= 10}

        if not valid_keywords:
            return {
                "message": "유효한 키워드 그룹이 없습니다. 최소 10개 블로그가 있는 키워드가 필요합니다.",
                "total_samples": len(samples),
                "keywords_found": len(keyword_groups),
                "overall_deviation": None
            }

        # ===== 키워드별로 순위 계산 =====
        all_deviations = []
        keyword_results = []
        all_sample_details = []

        for keyword, group in valid_keywords.items():
            # 해당 키워드 내에서만 순위 계산
            actual_ranks = np.array([s['actual_rank'] for s in group])
            predicted_scores = np.array([s['predicted_score'] for s in group])

            # 예측 점수를 순위로 변환 (해당 키워드 내에서만!)
            predicted_ranks = rankdata(-predicted_scores, method='ordinal')

            # 순위 차이 계산
            rank_diffs = np.abs(predicted_ranks - actual_ranks)
            all_deviations.extend(rank_diffs.tolist())

            # 키워드별 결과 저장
            keyword_results.append({
                'keyword': keyword,
                'sample_count': len(group),
                'avg_deviation': round(float(np.mean(rank_diffs)), 2),
                'exact_match': round(float(np.mean(rank_diffs == 0) * 100), 1),
                'within_3': round(float(np.mean(rank_diffs <= 3) * 100), 1),
                'correlation': round(float(spearmanr(actual_ranks, predicted_ranks)[0]), 3) if len(group) > 2 else 0
            })

            # 개별 샘플 정보 저장
            for i, s in enumerate(group):
                all_sample_details.append({
                    **s,
                    'predicted_rank': int(predicted_ranks[i]),
                    'deviation': int(rank_diffs[i])
                })

        # ===== 전체 통계 계산 =====
        all_deviations = np.array(all_deviations)
        overall_deviation = float(np.mean(all_deviations))

        # 순위 예측 정확도
        rank_accuracy = {
            "perfect_match": round(float(np.mean(all_deviations == 0) * 100), 1),
            "within_1_rank": round(float(np.mean(all_deviations <= 1) * 100), 1),
            "within_3_ranks": round(float(np.mean(all_deviations <= 3) * 100), 1),
            "within_5_ranks": round(float(np.mean(all_deviations <= 5) * 100), 1)
        }

        # 순위별 괴리율
        deviation_by_rank = {}
        for i in range(1, 14):
            mask = [s['actual_rank'] == i for s in all_sample_details]
            if any(mask):
                deviations_for_rank = [s['deviation'] for s, m in zip(all_sample_details, mask) if m]
                predicted_ranks_for_rank = [s['predicted_rank'] for s, m in zip(all_sample_details, mask) if m]
                deviation_by_rank[str(i)] = {
                    "count": len(deviations_for_rank),
                    "avg_predicted_rank": round(float(np.mean(predicted_ranks_for_rank)), 1),
                    "avg_deviation": round(float(np.mean(deviations_for_rank)), 1),
                    "accuracy": round((1 - np.mean(deviations_for_rank) / 13) * 100, 1)
                }

        # 가장 큰 괴리 예측들
        sorted_samples = sorted(all_sample_details, key=lambda x: x['deviation'], reverse=True)
        worst_predictions = [{
            "keyword": s['keyword'],
            "blog_id": s['blog_id'],
            "actual_rank": s['actual_rank'],
            "predicted_rank": s['predicted_rank'],
            "deviation": s['deviation'],
            "predicted_score": round(s['predicted_score'], 1)
        } for s in sorted_samples[:10]]

        # 키워드 분석 결과 정렬 (정확도 높은 순)
        keyword_results.sort(key=lambda x: x['avg_deviation'])

        # ===== 5. 가중치 영향 분석 =====
        # 상위권(1-3위)과 하위권(10-13위) 비교
        top_mask = actual_ranks <= 3
        bottom_mask = actual_ranks >= 10

        weight_impact = {
            "c_rank": {
                "top_avg": round(float(np.mean([s['c_rank_score'] for i, s in enumerate(sample_details) if top_mask[i]])) if np.sum(top_mask) > 0 else 0, 1),
                "bottom_avg": round(float(np.mean([s['c_rank_score'] for i, s in enumerate(sample_details) if bottom_mask[i]])) if np.sum(bottom_mask) > 0 else 0, 1),
                "current_weight": current_weights.get('c_rank', {}).get('weight', 0.5)
            },
            "dia": {
                "top_avg": round(float(np.mean([s['dia_score'] for i, s in enumerate(sample_details) if top_mask[i]])) if np.sum(top_mask) > 0 else 0, 1),
                "bottom_avg": round(float(np.mean([s['dia_score'] for i, s in enumerate(sample_details) if bottom_mask[i]])) if np.sum(bottom_mask) > 0 else 0, 1),
                "current_weight": current_weights.get('dia', {}).get('weight', 0.5)
            },
            "post_count": {
                "top_avg": round(float(np.mean([s['post_count'] for i, s in enumerate(sample_details) if top_mask[i]])) if np.sum(top_mask) > 0 else 0, 0),
                "bottom_avg": round(float(np.mean([s['post_count'] for i, s in enumerate(sample_details) if bottom_mask[i]])) if np.sum(bottom_mask) > 0 else 0, 0),
                "current_weight": current_weights.get('extra_factors', {}).get('post_count', 0.15)
            },
            "neighbor_count": {
                "top_avg": round(float(np.mean([s['neighbor_count'] for i, s in enumerate(sample_details) if top_mask[i]])) if np.sum(top_mask) > 0 else 0, 0),
                "bottom_avg": round(float(np.mean([s['neighbor_count'] for i, s in enumerate(sample_details) if bottom_mask[i]])) if np.sum(bottom_mask) > 0 else 0, 0),
                "current_weight": current_weights.get('extra_factors', {}).get('neighbor_count', 0.10)
            }
        }

        # 상위권에서 더 높은 요소 = 가중치 올려야 함
        recommendations = []
        for factor, data in weight_impact.items():
            if data['top_avg'] > data['bottom_avg'] * 1.2:  # 20% 이상 차이
                recommendations.append(f"{factor}: 상위권에서 더 높음 → 가중치 유지/증가 권장")
            elif data['bottom_avg'] > data['top_avg'] * 1.2:
                recommendations.append(f"{factor}: 하위권에서 더 높음 → 가중치 감소 권장")

        # ===== 6. 키워드별 분석 =====
        keyword_stats = {}
        for s in sample_details:
            kw = s['keyword']
            if kw not in keyword_stats:
                keyword_stats[kw] = {'count': 0, 'deviations': []}
            keyword_stats[kw]['count'] += 1

        # 각 키워드의 평균 괴리율 계산
        for i, s in enumerate(sample_details):
            kw = s['keyword']
            keyword_stats[kw]['deviations'].append(rank_differences[i])

        keyword_analysis = []
        for kw, data in keyword_stats.items():
            if data['count'] >= 3:
                avg_dev = np.mean(data['deviations'])
                keyword_analysis.append({
                    'keyword': kw,
                    'sample_count': data['count'],
                    'avg_deviation': round(float(avg_dev), 1),
                    'accuracy': round((1 - avg_dev / 13) * 100, 1)
                })

        keyword_analysis.sort(key=lambda x: x['avg_deviation'])

        return {
            "total_samples": len(samples),
            "analyzed_samples": len(actual_ranks),

            # 전체 괴리율
            "overall_deviation": round(overall_deviation, 2),
            "spearman_correlation": round(float(correlation) if not np.isnan(correlation) else 0, 3),

            # 순위 예측 정확도
            "rank_accuracy": rank_accuracy,

            # 순위별 분석
            "deviation_by_rank": deviation_by_rank,

            # 가장 큰 괴리
            "worst_predictions": worst_predictions[:5],

            # 가중치 영향 분석
            "weight_impact": weight_impact,
            "recommendations": recommendations,

            # 키워드별 분석
            "keyword_analysis": keyword_analysis[:10],

            # 현재 가중치
            "current_weights": current_weights
        }

    except Exception as e:
        import traceback
        print(f"Deviation analysis error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"괴리율 분석 실패: {str(e)}")


@router.get("/realtime-tuning")
async def get_realtime_tuning_status():
    """
    실시간 조율 현황 - 학습 진행 상황 및 가중치 변화 추이
    """
    try:
        current_weights = get_current_weights()
        history = get_training_history(limit=20)
        statistics = get_learning_statistics()

        # 가중치 변화 추이 추출
        weight_history = []
        for session in history:
            weight_changes = session.get('weight_changes', {})
            if weight_changes:
                weight_history.append({
                    'session_id': session.get('session_id', ''),
                    'timestamp': session.get('completed_at', ''),
                    'accuracy_before': session.get('accuracy_before', 0),
                    'accuracy_after': session.get('accuracy_after', 0),
                    'improvement': session.get('improvement', 0),
                    'c_rank_weight': weight_changes.get('c_rank.weight', {}).get('after', 0.5),
                    'dia_weight': weight_changes.get('dia.weight', {}).get('after', 0.5),
                    'samples_used': session.get('samples_used', 0),
                    'keywords': session.get('keywords', [])
                })

        # 정확도 추이
        accuracy_trend = []
        for session in reversed(history):  # 시간순 정렬
            accuracy_trend.append({
                'timestamp': session.get('completed_at', ''),
                'accuracy': session.get('accuracy_after', 0),
                'samples': session.get('samples_used', 0)
            })

        # 학습 효과 요약
        if len(history) >= 2:
            first_accuracy = history[-1].get('accuracy_after', 0) if history else 0
            last_accuracy = history[0].get('accuracy_after', 0) if history else 0
            total_improvement = last_accuracy - first_accuracy
        else:
            total_improvement = 0

        return {
            "current_status": {
                "total_samples": statistics.get('total_samples', 0),
                "training_count": statistics.get('training_count', 0),
                "current_accuracy": statistics.get('current_accuracy', 0),
                "last_training": statistics.get('last_training', '-')
            },

            "current_weights": {
                "c_rank": current_weights.get('c_rank', {}).get('weight', 0.5),
                "dia": current_weights.get('dia', {}).get('weight', 0.5),
                "c_rank_sub": current_weights.get('c_rank', {}).get('sub_weights', {}),
                "dia_sub": current_weights.get('dia', {}).get('sub_weights', {}),
                "extra_factors": current_weights.get('extra_factors', {})
            },

            "accuracy_trend": accuracy_trend[-10:],  # 최근 10개

            "weight_history": weight_history[:10],

            "learning_summary": {
                "total_training_sessions": len(history),
                "total_improvement": round(total_improvement, 1),
                "avg_improvement_per_session": round(total_improvement / len(history), 2) if history else 0
            }
        }

    except Exception as e:
        import traceback
        print(f"Realtime tuning error: {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"실시간 조율 현황 조회 실패: {str(e)}")
