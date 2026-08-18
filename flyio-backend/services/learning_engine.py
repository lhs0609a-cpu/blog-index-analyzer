"""
Advanced Machine Learning engine for ranking prediction
Goal: 99% accuracy matching Naver's actual ranking

Key Features:
1. Real-time instant weight adjustment
2. Per-keyword learning (different keywords may have different patterns)
3. Post-level analysis (not just blog-level)
4. Aggressive learning with momentum
"""
import numpy as np
from scipy.stats import spearmanr, kendalltau
from scipy.stats import rankdata
from typing import Dict, List, Tuple, Optional
import time
from datetime import datetime
import uuid
import json

# 2025 네이버 AI 신뢰도 평가 서비스
try:
    from services.trust_score_service import (
        calculate_total_trust_score,
        calculate_source_trust_score,
        detect_keyword_category,
        SOURCE_TRUST_SCORES
    )
    TRUST_SERVICE_AVAILABLE = True
except ImportError:
    TRUST_SERVICE_AVAILABLE = False


# ==============================================
# CONSTANTS
# ==============================================
DEFAULT_WEIGHTS = {
    'c_rank': {
        'weight': 0.25,  # 블로그 지수 (비중 축소)
        'sub_weights': {
            'context': 0.35,
            'content': 0.40,
            'chain': 0.25
        }
    },
    'dia': {
        'weight': 0.25,  # 블로그 지수 (비중 축소)
        'sub_weights': {
            'depth': 0.33,
            'information': 0.34,
            'accuracy': 0.33
        }
    },
    # 글 콘텐츠 요소 (50% - 핵심!)
    'content_factors': {
        'weight': 0.50,
        'sub_weights': {
            'content_length': 0.15,      # 본문 길이
            'heading_count': 0.12,       # 소제목 수
            'paragraph_count': 0.10,     # 문단 수
            'image_count': 0.12,         # 이미지 수
            'keyword_count': 0.15,       # 키워드 언급 횟수
            'keyword_density': 0.08,     # 키워드 밀도
            'freshness': 0.15,           # 글 최신성 (post_age_days 기반)
            'title_keyword': 0.13,       # 제목 키워드 포함
        }
    },
    # 블로그 메타 요소 (deprecated, 하위 호환용)
    'extra_factors': {
        'post_count': 0.05,
        'neighbor_count': 0.03,
        'visitor_count': 0.02,
    },
    # 부가 요소
    'bonus_factors': {
        'has_map': 0.03,       # 지도 포함
        'has_link': 0.02,      # 외부 링크
        'video_count': 0.05,   # 동영상 수
        'engagement': 0.05,    # 공감+댓글
    }
}


# ==============================================
# SCORE CALCULATION
# ==============================================
def calculate_blog_score(features: Dict, weights: Dict, keyword: str = '') -> float:
    """
    Calculate blog score based on features and weights

    새로운 점수 계산 공식 (글 콘텐츠 중심):
    Score = (C-Rank * 0.25) + (D.I.A. * 0.25) + (Content * 0.50) + Bonus

    Content 요소: heading_count, paragraph_count, image_count,
                  keyword_count, content_length, freshness, title_keyword
    """
    total_score = 0.0

    # ===== 1. C-Rank 점수 (25%) =====
    c_rank_score = features.get('c_rank_score', 0) or 0
    c_rank_weight = weights.get('c_rank', {}).get('weight', 0.25)

    # C-Rank sub-components
    context_score = features.get('context_score', 50) or 50
    content_score = features.get('content_score', 50) or 50
    chain_score = features.get('chain_score', 50) or 50

    c_sub = weights.get('c_rank', {}).get('sub_weights', {})
    if features.get('context_score') is not None:
        c_rank_final = (
            context_score * c_sub.get('context', 0.35) +
            content_score * c_sub.get('content', 0.40) +
            chain_score * c_sub.get('chain', 0.25)
        )
    else:
        c_rank_final = c_rank_score

    total_score += c_rank_final * c_rank_weight

    # ===== 2. D.I.A. 점수 (25%) =====
    dia_score = features.get('dia_score', 0) or 0
    dia_weight = weights.get('dia', {}).get('weight', 0.25)

    depth_score = features.get('depth_score', 50) or 50
    info_score = features.get('information_score', 50) or 50
    accuracy_score = features.get('accuracy_score', 50) or 50

    d_sub = weights.get('dia', {}).get('sub_weights', {})
    if features.get('depth_score') is not None:
        dia_final = (
            depth_score * d_sub.get('depth', 0.33) +
            info_score * d_sub.get('information', 0.34) +
            accuracy_score * d_sub.get('accuracy', 0.33)
        )
    else:
        dia_final = dia_score

    total_score += dia_final * dia_weight

    # ===== 3. 글 콘텐츠 점수 (50% - 핵심!) =====
    content_weights = weights.get('content_factors', {}).get('sub_weights', {})
    content_main_weight = weights.get('content_factors', {}).get('weight', 0.50)

    content_score_total = 0.0

    # 본문 길이 (0-100점으로 정규화, 3000자 기준)
    content_length = features.get('content_length', 0) or 0
    length_score = min(content_length / 3000, 1.0) * 100
    content_score_total += length_score * content_weights.get('content_length', 0.15)

    # 소제목 수 (0-100점, 10개 기준)
    heading_count = features.get('heading_count', 0) or 0
    heading_score = min(heading_count / 10, 1.0) * 100
    content_score_total += heading_score * content_weights.get('heading_count', 0.12)

    # 문단 수 (0-100점, 20개 기준)
    paragraph_count = features.get('paragraph_count', 0) or 0
    paragraph_score = min(paragraph_count / 20, 1.0) * 100
    content_score_total += paragraph_score * content_weights.get('paragraph_count', 0.10)

    # 이미지 수 (0-100점, 15개 기준)
    image_count = features.get('image_count', 0) or 0
    image_score = min(image_count / 15, 1.0) * 100
    content_score_total += image_score * content_weights.get('image_count', 0.12)

    # 키워드 언급 횟수 (0-100점, 10회 기준)
    keyword_count = features.get('keyword_count', 0) or 0
    kw_count_score = min(keyword_count / 10, 1.0) * 100
    content_score_total += kw_count_score * content_weights.get('keyword_count', 0.15)

    # 키워드 밀도 (0-100점, 1.0% 기준이 최적, 너무 높으면 감점)
    keyword_density = features.get('keyword_density', 0) or 0
    if keyword_density <= 1.5:
        density_score = min(keyword_density / 1.0, 1.0) * 100
    else:
        # 밀도가 너무 높으면 감점 (스팸 방지)
        density_score = max(0, 100 - (keyword_density - 1.5) * 30)
    content_score_total += density_score * content_weights.get('keyword_density', 0.08)

    # 글 최신성 (post_age_days 기반, 0-100점)
    post_age_days = features.get('post_age_days')
    if post_age_days is not None:
        if post_age_days <= 1:
            freshness_score = 100
        elif post_age_days <= 7:
            freshness_score = 90
        elif post_age_days <= 30:
            freshness_score = 70
        elif post_age_days <= 90:
            freshness_score = 50
        elif post_age_days <= 180:
            freshness_score = 30
        else:
            freshness_score = 10
    else:
        freshness_score = 50  # 알 수 없으면 중간값
    content_score_total += freshness_score * content_weights.get('freshness', 0.15)

    # 제목 키워드 포함 (0 or 100점)
    title_has_keyword = features.get('title_has_keyword', False)
    title_score = 100 if title_has_keyword else 0
    content_score_total += title_score * content_weights.get('title_keyword', 0.13)

    total_score += content_score_total * content_main_weight

    # ===== 4. 보너스 요소 =====
    bonus_weights = weights.get('bonus_factors', {})

    # 지도 포함
    has_map = features.get('has_map', False)
    if has_map:
        total_score += 100 * bonus_weights.get('has_map', 0.03)

    # 외부 링크
    has_link = features.get('has_link', False)
    if has_link:
        total_score += 100 * bonus_weights.get('has_link', 0.02)

    # 동영상 수
    video_count = features.get('video_count', 0) or 0
    video_score = min(video_count / 3, 1.0) * 100
    total_score += video_score * bonus_weights.get('video_count', 0.05)

    # 공감 + 댓글 (engagement)
    like_count = features.get('like_count', 0) or 0
    comment_count = features.get('comment_count', 0) or 0
    engagement = like_count + comment_count * 2  # 댓글에 가중치
    engagement_score = min(engagement / 50, 1.0) * 100
    total_score += engagement_score * bonus_weights.get('engagement', 0.05)

    return total_score


def calculate_post_score(post_features: Dict, weights: Dict) -> float:
    """
    Calculate individual post score for ranking

    This analyzes the specific post that appeared in search results
    """
    post_weights = weights.get('post_factors', DEFAULT_WEIGHTS['post_factors'])

    title_match = post_features.get('title_keyword_match', 0.5) or 0.5
    keyword_density = post_features.get('content_keyword_density', 0.5) or 0.5
    content_length = min(post_features.get('content_length', 0) / 3000, 1.0) if post_features.get('content_length') else 0.5
    image_count = min(post_features.get('image_count', 0) / 10, 1.0) if post_features.get('image_count') else 0.3

    # Freshness: days since post (newer = higher score)
    days_old = post_features.get('days_since_post', 30) or 30
    if days_old <= 1:
        freshness = 1.0
    elif days_old <= 7:
        freshness = 0.9
    elif days_old <= 30:
        freshness = 0.7
    elif days_old <= 90:
        freshness = 0.5
    else:
        freshness = 0.3

    engagement = post_features.get('engagement_score', 0.5) or 0.5
    structure = post_features.get('structure_quality', 0.5) or 0.5

    post_score = (
        title_match * post_weights.get('title_keyword_match', 0.20) +
        keyword_density * post_weights.get('content_keyword_density', 0.15) +
        content_length * post_weights.get('content_length', 0.15) +
        image_count * post_weights.get('image_count', 0.10) +
        freshness * post_weights.get('freshness', 0.15) +
        engagement * post_weights.get('engagement', 0.10) +
        structure * post_weights.get('structure_quality', 0.15)
    )

    return post_score * 100  # Scale to 0-100


def calculate_combined_score(blog_features: Dict, post_features: Dict, weights: Dict) -> float:
    """
    Calculate combined score: Blog score + Post score

    Final Rank Score = Blog Score * 0.6 + Post Score * 0.4
    """
    blog_score = calculate_blog_score(blog_features, weights)
    post_score = calculate_post_score(post_features, weights) if post_features else 50

    blog_weight = weights.get('score_balance', {}).get('blog', 0.6)
    post_weight = weights.get('score_balance', {}).get('post', 0.4)

    return blog_score * blog_weight + post_score * post_weight


# ==============================================
# PREDICTION & LOSS CALCULATION
# ==============================================
def calculate_predicted_scores(samples: List[Dict], weights: Dict) -> np.ndarray:
    """Calculate predicted scores for all samples

    핵심 수정: 모든 피처를 calculate_blog_score에 전달
    - 블로그 지수: c_rank_score, dia_score
    - 글 콘텐츠: heading_count, paragraph_count, content_length, image_count, etc.
    - 보너스: has_map, has_link, video_count, like_count, comment_count
    """
    scores = []
    for sample in samples:
        features = {
            # ===== 블로그 전체 지수 (25% + 25%) =====
            'c_rank_score': sample.get('c_rank_score'),
            'dia_score': sample.get('dia_score'),
            'post_count': sample.get('post_count'),
            'neighbor_count': sample.get('neighbor_count'),
            'visitor_count': sample.get('visitor_count'),
            # C-Rank Sub-components
            'context_score': sample.get('context_score'),
            'content_score': sample.get('content_score'),
            'chain_score': sample.get('chain_score'),
            # D.I.A. Sub-components
            'depth_score': sample.get('depth_score'),
            'information_score': sample.get('information_score'),
            'accuracy_score': sample.get('accuracy_score'),

            # ===== 글 콘텐츠 요소 (50% - 핵심!) =====
            'content_length': sample.get('content_length', 0),
            'heading_count': sample.get('heading_count', 0),
            'paragraph_count': sample.get('paragraph_count', 0),
            'image_count': sample.get('image_count', 0),
            'keyword_count': sample.get('keyword_count', 0),
            'keyword_density': sample.get('keyword_density', 0),
            'post_age_days': sample.get('post_age_days'),
            'title_has_keyword': sample.get('title_has_keyword', False),

            # ===== 보너스 요소 =====
            'has_map': sample.get('has_map', False),
            'has_link': sample.get('has_link', False),
            'video_count': sample.get('video_count', 0),
            'like_count': sample.get('like_count', 0),
            'comment_count': sample.get('comment_count', 0),
        }
        score = calculate_blog_score(features, weights)
        scores.append(score)
    return np.array(scores)


def calculate_rank_loss(actual_ranks: np.ndarray, predicted_scores: np.ndarray) -> Tuple[float, float, float]:
    """
    Calculate multiple loss metrics for ranking

    Returns: (loss, spearman_correlation, kendall_tau)
    """
    # Convert predicted scores to ranks (higher score = lower rank number = better)
    predicted_ranks = rankdata(-predicted_scores, method='ordinal')

    # Spearman correlation
    spearman_corr, _ = spearmanr(actual_ranks, predicted_ranks)
    if np.isnan(spearman_corr):
        spearman_corr = 0.0

    # Kendall's tau (more robust for ranking)
    kendall_corr, _ = kendalltau(actual_ranks, predicted_ranks)
    if np.isnan(kendall_corr):
        kendall_corr = 0.0

    # Combined loss (we want to minimize this)
    loss = 1.0 - (spearman_corr * 0.6 + kendall_corr * 0.4)

    return loss, spearman_corr, kendall_corr


def calculate_exact_match_rate(actual_ranks: np.ndarray, predicted_scores: np.ndarray) -> Dict[str, float]:
    """
    Calculate exact match rates for different thresholds

    This is our key metric for 99% accuracy goal
    """
    predicted_ranks = rankdata(-predicted_scores, method='ordinal')
    differences = np.abs(predicted_ranks - actual_ranks)

    n = len(differences)

    return {
        'exact_match': float((differences == 0).sum() / n * 100),      # 정확히 일치
        'within_1': float((differences <= 1).sum() / n * 100),         # ±1 이내
        'within_2': float((differences <= 2).sum() / n * 100),         # ±2 이내
        'within_3': float((differences <= 3).sum() / n * 100),         # ±3 이내
        'avg_deviation': float(np.mean(differences)),                   # 평균 괴리
        'max_deviation': float(np.max(differences)),                    # 최대 괴리
    }


def calculate_exact_match_rate_by_keyword(samples: List[Dict], predicted_scores: np.ndarray) -> Dict[str, float]:
    """
    키워드별로 그룹화해서 정확도 계산 (핵심 수정!)

    같은 키워드 내에서만 순위를 예측해야 정확함
    예: 키워드A의 1-13위, 키워드B의 1-13위 각각 따로 계산
    """
    from collections import defaultdict

    # 키워드별로 그룹화.
    #
    # ⚠️ 같은 키워드를 여러 번 수집하면 한 그룹에 같은 블로그가 여러 번 들어온다.
    # 그대로 rankdata 를 돌리면 예측 순위는 1..60 으로 매겨지는데 actual_rank 는
    # 1..10 뿐이라, 모델이 완벽해도 편차가 폭발한다. 실제로 '대출' 그룹이
    # 6회 수집 × 10블로그 = 60개였고 그래서 정확도가 무작위(1/N)보다 낮은
    # 4.7% 로 표시되고 있었다(spearman 0.022 = 무상관).
    # → 키워드 안에서 blog_id 로 중복을 제거하고 **최신 수집분만** 남긴다.
    # samples 는 collected_at DESC 로 오므로 먼저 만난 것이 최신이다.
    keyword_groups = defaultdict(list)
    seen = set()
    for i, sample in enumerate(samples):
        keyword = sample.get('keyword', 'unknown')
        dedup_key = (keyword, sample.get('blog_id'))
        if dedup_key in seen:
            continue
        seen.add(dedup_key)
        # ⚠️ 본문을 못 읽은 샘플은 콘텐츠 피처가 전부 0 이다. '짧은 글'과
        # 구분되지 않아 학습을 오염시키므로 지표 계산에서 뺀다.
        # 0 = 이번에 읽기 실패 / NULL(None) = 플래그 도입 전 데이터라 판단 보류
        # (그것까지 빼면 기존 6,470건이 통째로 사라져 지표가 비어버린다).
        if sample.get('content_parsed') == 0:
            continue
        keyword_groups[keyword].append({
            'index': i,
            'actual_rank': sample.get('actual_rank', 0),
            'predicted_score': predicted_scores[i]
        })

    all_differences = []

    for keyword, group in keyword_groups.items():
        if len(group) < 2:
            continue

        # 이 키워드 내에서만 순위 예측
        scores = np.array([g['predicted_score'] for g in group])
        actual_ranks = np.array([g['actual_rank'] for g in group])

        # 점수 기반 예측 순위 (높은 점수 = 낮은 순위 번호)
        predicted_ranks = rankdata(-scores, method='ordinal')

        # 차이 계산
        differences = np.abs(predicted_ranks - actual_ranks)
        all_differences.extend(differences.tolist())

    if not all_differences:
        return {
            'exact_match': 0.0, 'within_1': 0.0, 'within_2': 0.0,
            'within_3': 0.0, 'avg_deviation': 13.0, 'max_deviation': 13.0
        }

    differences = np.array(all_differences)
    n = len(differences)

    return {
        'exact_match': float((differences == 0).sum() / n * 100),
        'within_1': float((differences <= 1).sum() / n * 100),
        'within_2': float((differences <= 2).sum() / n * 100),
        'within_3': float((differences <= 3).sum() / n * 100),
        'avg_deviation': float(np.mean(differences)),
        'max_deviation': float(np.max(differences)),
    }


# ==============================================
# GRADIENT CALCULATION (Numerical Differentiation)
# ==============================================
def calculate_all_gradients(samples: List[Dict], weights: Dict, epsilon: float = 0.0001) -> Dict:
    """
    Calculate gradients for ALL weight parameters using numerical differentiation

    More aggressive gradient calculation for faster convergence
    """
    actual_ranks = np.array([s['actual_rank'] for s in samples])
    base_scores = calculate_predicted_scores(samples, weights)
    base_loss, _, _ = calculate_rank_loss(actual_ranks, base_scores)

    gradients = {}

    # Helper function to perturb and calculate gradient
    def calc_gradient(weights_copy, path, epsilon):
        perturbed_scores = calculate_predicted_scores(samples, weights_copy)
        perturbed_loss, _, _ = calculate_rank_loss(actual_ranks, perturbed_scores)
        return (perturbed_loss - base_loss) / epsilon

    # C-Rank main weight gradient
    w_copy = json.loads(json.dumps(weights))  # Deep copy
    w_copy['c_rank']['weight'] += epsilon
    gradients['c_rank.weight'] = calc_gradient(w_copy, 'c_rank.weight', epsilon)

    # D.I.A. main weight gradient
    w_copy = json.loads(json.dumps(weights))
    w_copy['dia']['weight'] += epsilon
    gradients['dia.weight'] = calc_gradient(w_copy, 'dia.weight', epsilon)

    # C-Rank sub-weights gradients
    for sub in ['context', 'content', 'chain']:
        w_copy = json.loads(json.dumps(weights))
        if 'sub_weights' not in w_copy['c_rank']:
            w_copy['c_rank']['sub_weights'] = DEFAULT_WEIGHTS['c_rank']['sub_weights'].copy()
        w_copy['c_rank']['sub_weights'][sub] += epsilon
        gradients[f'c_rank.{sub}'] = calc_gradient(w_copy, f'c_rank.{sub}', epsilon)

    # D.I.A. sub-weights gradients
    for sub in ['depth', 'information', 'accuracy']:
        w_copy = json.loads(json.dumps(weights))
        if 'sub_weights' not in w_copy['dia']:
            w_copy['dia']['sub_weights'] = DEFAULT_WEIGHTS['dia']['sub_weights'].copy()
        w_copy['dia']['sub_weights'][sub] += epsilon
        gradients[f'dia.{sub}'] = calc_gradient(w_copy, f'dia.{sub}', epsilon)

    # Extra factors gradients (legacy)
    for factor in ['post_count', 'neighbor_count', 'visitor_count']:
        w_copy = json.loads(json.dumps(weights))
        if 'extra_factors' not in w_copy:
            w_copy['extra_factors'] = DEFAULT_WEIGHTS['extra_factors'].copy()
        w_copy['extra_factors'][factor] += epsilon
        gradients[f'extra.{factor}'] = calc_gradient(w_copy, f'extra.{factor}', epsilon)

    # Content factors gradients (핵심 - 50% 가중치!)
    content_sub_weights = [
        'content_length', 'heading_count', 'paragraph_count', 'image_count',
        'keyword_count', 'keyword_density', 'freshness', 'title_keyword'
    ]
    for factor in content_sub_weights:
        w_copy = json.loads(json.dumps(weights))
        if 'content_factors' not in w_copy:
            w_copy['content_factors'] = json.loads(json.dumps(DEFAULT_WEIGHTS['content_factors']))
        if 'sub_weights' not in w_copy['content_factors']:
            w_copy['content_factors']['sub_weights'] = json.loads(json.dumps(DEFAULT_WEIGHTS['content_factors']['sub_weights']))
        w_copy['content_factors']['sub_weights'][factor] += epsilon
        gradients[f'content.{factor}'] = calc_gradient(w_copy, f'content.{factor}', epsilon)

    # Content factors main weight gradient
    w_copy = json.loads(json.dumps(weights))
    if 'content_factors' not in w_copy:
        w_copy['content_factors'] = json.loads(json.dumps(DEFAULT_WEIGHTS['content_factors']))
    w_copy['content_factors']['weight'] += epsilon
    gradients['content_factors.weight'] = calc_gradient(w_copy, 'content_factors.weight', epsilon)

    # Bonus factors gradients
    for factor in ['has_map', 'has_link', 'video_count', 'engagement']:
        w_copy = json.loads(json.dumps(weights))
        if 'bonus_factors' not in w_copy:
            w_copy['bonus_factors'] = json.loads(json.dumps(DEFAULT_WEIGHTS['bonus_factors']))
        w_copy['bonus_factors'][factor] += epsilon
        gradients[f'bonus.{factor}'] = calc_gradient(w_copy, f'bonus.{factor}', epsilon)

    return gradients


# ==============================================
# INSTANT ADJUSTMENT (Real-time learning)
# ==============================================
def instant_adjust_weights(
    samples: List[Dict],
    current_weights: Dict,
    target_accuracy: float = 99.0,
    max_iterations: int = 100,
    learning_rate: float = 0.05,
    momentum: float = 0.9
) -> Tuple[Dict, Dict]:
    """
    INSTANT weight adjustment to match Naver's actual ranking

    Goal: Achieve target_accuracy (default 99%) as fast as possible

    Uses momentum-based gradient descent for faster convergence

    핵심 수정: 키워드별로 그룹화해서 순위 예측 및 정확도 계산
    """
    start_time = time.time()

    if len(samples) < 3:
        return current_weights, {'error': 'Need at least 3 samples'}

    # Initialize weights with deep copy
    weights = json.loads(json.dumps(current_weights))

    # Ensure all required keys exist
    if 'c_rank' not in weights:
        weights['c_rank'] = json.loads(json.dumps(DEFAULT_WEIGHTS['c_rank']))
    if 'dia' not in weights:
        weights['dia'] = json.loads(json.dumps(DEFAULT_WEIGHTS['dia']))
    if 'extra_factors' not in weights:
        weights['extra_factors'] = json.loads(json.dumps(DEFAULT_WEIGHTS['extra_factors']))
    if 'content_factors' not in weights:
        weights['content_factors'] = json.loads(json.dumps(DEFAULT_WEIGHTS['content_factors']))
    if 'bonus_factors' not in weights:
        weights['bonus_factors'] = json.loads(json.dumps(DEFAULT_WEIGHTS['bonus_factors']))
    if 'sub_weights' not in weights['c_rank']:
        weights['c_rank']['sub_weights'] = json.loads(json.dumps(DEFAULT_WEIGHTS['c_rank']['sub_weights']))
    if 'sub_weights' not in weights['dia']:
        weights['dia']['sub_weights'] = json.loads(json.dumps(DEFAULT_WEIGHTS['dia']['sub_weights']))
    if 'sub_weights' not in weights.get('content_factors', {}):
        if 'content_factors' not in weights:
            weights['content_factors'] = {}
        weights['content_factors']['sub_weights'] = json.loads(json.dumps(DEFAULT_WEIGHTS['content_factors']['sub_weights']))

    actual_ranks = np.array([s['actual_rank'] for s in samples])

    # Initial metrics - 키워드별 정확도 계산 (핵심 수정!)
    initial_scores = calculate_predicted_scores(samples, weights)
    initial_metrics = calculate_exact_match_rate_by_keyword(samples, initial_scores)
    initial_accuracy = initial_metrics['within_3']  # ±3 accuracy as main metric (더 현실적)

    # Momentum storage
    velocity = {}

    # Training loop
    history = []
    best_weights = json.loads(json.dumps(weights))
    best_accuracy = initial_accuracy

    for iteration in range(max_iterations):
        # Calculate current metrics - 키워드별 정확도 계산 (핵심 수정!)
        predicted_scores = calculate_predicted_scores(samples, weights)
        metrics = calculate_exact_match_rate_by_keyword(samples, predicted_scores)
        current_accuracy = metrics['within_3']

        # Check if target reached
        if current_accuracy >= target_accuracy:
            print(f"Target accuracy {target_accuracy}% reached at iteration {iteration}")
            break

        # Track best weights
        if current_accuracy > best_accuracy:
            best_accuracy = current_accuracy
            best_weights = json.loads(json.dumps(weights))

        # Calculate gradients
        gradients = calculate_all_gradients(samples, weights)

        # Update weights with momentum
        for key, grad in gradients.items():
            if key not in velocity:
                velocity[key] = 0.0

            # Momentum update
            velocity[key] = momentum * velocity[key] - learning_rate * grad

            # Apply update to weights
            parts = key.split('.')
            if len(parts) == 2:
                category, param = parts
                if category == 'c_rank' and param == 'weight':
                    weights['c_rank']['weight'] += velocity[key]
                elif category == 'dia' and param == 'weight':
                    weights['dia']['weight'] += velocity[key]
                elif category == 'content_factors' and param == 'weight':
                    weights['content_factors']['weight'] += velocity[key]
                elif category == 'c_rank' and param in ['context', 'content', 'chain']:
                    weights['c_rank']['sub_weights'][param] += velocity[key]
                elif category == 'dia' and param in ['depth', 'information', 'accuracy']:
                    weights['dia']['sub_weights'][param] += velocity[key]
                elif category == 'extra':
                    weights['extra_factors'][param] += velocity[key]
                elif category == 'content':
                    # content.heading_count, content.paragraph_count, etc.
                    weights['content_factors']['sub_weights'][param] += velocity[key]
                elif category == 'bonus':
                    # bonus.has_map, bonus.video_count, etc.
                    weights['bonus_factors'][param] += velocity[key]

        # Constrain weights to valid ranges
        weights = constrain_weights(weights)

        # Record history
        loss, spearman, kendall = calculate_rank_loss(actual_ranks, predicted_scores)
        history.append({
            'iteration': iteration,
            'accuracy': float(current_accuracy),
            'avg_deviation': float(metrics['avg_deviation']),
            'loss': float(loss),
            'spearman': float(spearman)
        })

        # Adaptive learning rate
        if iteration > 0 and iteration % 20 == 0:
            if history[-1]['accuracy'] <= history[-20]['accuracy']:
                learning_rate *= 0.5  # Reduce learning rate if stuck

    # Use best weights found
    weights = best_weights

    # Final metrics - 키워드별 정확도 계산 (핵심 수정!)
    final_scores = calculate_predicted_scores(samples, weights)
    final_metrics = calculate_exact_match_rate_by_keyword(samples, final_scores)
    _, final_spearman, final_kendall = calculate_rank_loss(actual_ranks, final_scores)

    duration = time.time() - start_time

    adjustment_info = {
        'session_id': f"instant_{uuid.uuid4().hex[:8]}",
        'samples_used': len(samples),
        'iterations': len(history),
        'duration_seconds': float(duration),
        'initial_accuracy': float(initial_accuracy),
        'final_accuracy': float(final_metrics['within_3']),
        'improvement': float(final_metrics['within_3'] - initial_accuracy),
        'exact_match_rate': float(final_metrics['exact_match']),
        'within_1': float(final_metrics['within_1']),
        'within_3': float(final_metrics['within_3']),
        'avg_deviation': float(final_metrics['avg_deviation']),
        'spearman_correlation': float(final_spearman),
        'kendall_tau': float(final_kendall),
        'target_reached': final_metrics['within_3'] >= target_accuracy,
        'weight_changes': calculate_weight_changes(current_weights, weights)
    }

    return weights, adjustment_info


def constrain_weights(weights: Dict) -> Dict:
    """Ensure all weights are within valid ranges

    새로운 구조:
    - c_rank: 25%, dia: 25%, content_factors: 50%
    - content_factors.sub_weights: 8개 요소
    - bonus_factors: 추가 보너스 (별도 합산)
    """
    # Main weights: 0.05 ~ 0.6
    weights['c_rank']['weight'] = max(0.05, min(0.6, weights['c_rank']['weight']))
    weights['dia']['weight'] = max(0.05, min(0.6, weights['dia']['weight']))

    # Content factors main weight: 0.2 ~ 0.7 (핵심!)
    if 'content_factors' in weights and 'weight' in weights['content_factors']:
        weights['content_factors']['weight'] = max(0.2, min(0.7, weights['content_factors']['weight']))

    # Normalize main weights to sum to 1 (c_rank + dia + content_factors)
    c_rank_w = weights.get('c_rank', {}).get('weight', 0.25)
    dia_w = weights.get('dia', {}).get('weight', 0.25)
    content_w = weights.get('content_factors', {}).get('weight', 0.50)
    total = c_rank_w + dia_w + content_w
    if total > 0:
        weights['c_rank']['weight'] = c_rank_w / total
        weights['dia']['weight'] = dia_w / total
        if 'content_factors' in weights:
            weights['content_factors']['weight'] = content_w / total

    # C-Rank Sub-weights: 0.1 ~ 0.6
    for sub in ['context', 'content', 'chain']:
        if sub in weights.get('c_rank', {}).get('sub_weights', {}):
            weights['c_rank']['sub_weights'][sub] = max(0.1, min(0.6, weights['c_rank']['sub_weights'][sub]))

    # D.I.A. Sub-weights: 0.1 ~ 0.6
    for sub in ['depth', 'information', 'accuracy']:
        if sub in weights.get('dia', {}).get('sub_weights', {}):
            weights['dia']['sub_weights'][sub] = max(0.1, min(0.6, weights['dia']['sub_weights'][sub]))

    # Content factors sub-weights: 0.05 ~ 0.3
    content_subs = ['content_length', 'heading_count', 'paragraph_count', 'image_count',
                    'keyword_count', 'keyword_density', 'freshness', 'title_keyword']
    for sub in content_subs:
        if sub in weights.get('content_factors', {}).get('sub_weights', {}):
            weights['content_factors']['sub_weights'][sub] = max(0.05, min(0.3, weights['content_factors']['sub_weights'][sub]))

    # Normalize C-Rank sub-weights
    if 'c_rank' in weights and 'sub_weights' in weights['c_rank']:
        c_total = sum(weights['c_rank']['sub_weights'].values())
        if c_total > 0:
            for k in weights['c_rank']['sub_weights']:
                weights['c_rank']['sub_weights'][k] /= c_total

    # Normalize D.I.A. sub-weights
    if 'dia' in weights and 'sub_weights' in weights['dia']:
        d_total = sum(weights['dia']['sub_weights'].values())
        if d_total > 0:
            for k in weights['dia']['sub_weights']:
                weights['dia']['sub_weights'][k] /= d_total

    # Normalize content factors sub-weights
    if 'content_factors' in weights and 'sub_weights' in weights['content_factors']:
        cf_total = sum(weights['content_factors']['sub_weights'].values())
        if cf_total > 0:
            for k in weights['content_factors']['sub_weights']:
                weights['content_factors']['sub_weights'][k] /= cf_total

    # Extra factors: 0.01 ~ 0.3 (legacy)
    for factor in weights.get('extra_factors', {}):
        weights['extra_factors'][factor] = max(0.01, min(0.3, weights['extra_factors'][factor]))

    # Bonus factors: 0.01 ~ 0.15
    for factor in weights.get('bonus_factors', {}):
        weights['bonus_factors'][factor] = max(0.01, min(0.15, weights['bonus_factors'][factor]))

    return weights


def calculate_weight_changes(old_weights: Dict, new_weights: Dict) -> Dict:
    """Calculate changes between old and new weights"""
    changes = {}

    # C-Rank main weight
    old_c = old_weights.get('c_rank', {}).get('weight', 0.5)
    new_c = new_weights.get('c_rank', {}).get('weight', 0.5)
    changes['c_rank.weight'] = {
        'before': float(old_c),
        'after': float(new_c),
        'change': float(new_c - old_c)
    }

    # D.I.A. main weight
    old_d = old_weights.get('dia', {}).get('weight', 0.5)
    new_d = new_weights.get('dia', {}).get('weight', 0.5)
    changes['dia.weight'] = {
        'before': float(old_d),
        'after': float(new_d),
        'change': float(new_d - old_d)
    }

    # C-Rank sub-weights
    old_c_sub = old_weights.get('c_rank', {}).get('sub_weights', {})
    new_c_sub = new_weights.get('c_rank', {}).get('sub_weights', {})
    for sub in ['context', 'content', 'chain']:
        old_v = old_c_sub.get(sub, 0.33)
        new_v = new_c_sub.get(sub, 0.33)
        changes[f'c_rank.{sub}'] = {
            'before': float(old_v),
            'after': float(new_v),
            'change': float(new_v - old_v)
        }

    # D.I.A. sub-weights
    old_d_sub = old_weights.get('dia', {}).get('sub_weights', {})
    new_d_sub = new_weights.get('dia', {}).get('sub_weights', {})
    for sub in ['depth', 'information', 'accuracy']:
        old_v = old_d_sub.get(sub, 0.33)
        new_v = new_d_sub.get(sub, 0.33)
        changes[f'dia.{sub}'] = {
            'before': float(old_v),
            'after': float(new_v),
            'change': float(new_v - old_v)
        }

    return changes


# ==============================================
# KEYWORD-SPECIFIC LEARNING
# ==============================================
def learn_keyword_pattern(
    keyword: str,
    samples: List[Dict],
    base_weights: Dict,
    keyword_weights_db: Dict = None
) -> Tuple[Dict, Dict]:
    """
    Learn keyword-specific patterns

    Different keywords may require different weight distributions
    e.g., "맛집" may prioritize recent posts, "의료" may prioritize expertise
    """
    if keyword_weights_db is None:
        keyword_weights_db = {}

    # Get existing keyword weights or start from base
    if keyword in keyword_weights_db:
        current_weights = keyword_weights_db[keyword]
    else:
        current_weights = json.loads(json.dumps(base_weights))

    # Filter samples for this keyword
    keyword_samples = [s for s in samples if s.get('keyword') == keyword]

    if len(keyword_samples) < 3:
        return current_weights, {'error': f'Not enough samples for keyword: {keyword}'}

    # Run instant adjustment for this keyword
    new_weights, info = instant_adjust_weights(
        samples=keyword_samples,
        current_weights=current_weights,
        target_accuracy=95.0,
        max_iterations=50,
        learning_rate=0.1
    )

    info['keyword'] = keyword
    info['samples_for_keyword'] = len(keyword_samples)

    return new_weights, info


# ==============================================
# LEGACY FUNCTIONS (for backward compatibility)
# ==============================================
def calculate_loss(actual_ranks: np.ndarray, predicted_scores: np.ndarray) -> Tuple[float, float]:
    """Legacy: Calculate loss using Spearman rank correlation"""
    loss, correlation, _ = calculate_rank_loss(actual_ranks, predicted_scores)
    return loss, correlation


def calculate_accuracy(actual_ranks: np.ndarray, predicted_scores: np.ndarray, threshold: int = 3) -> float:
    """Legacy: Calculate accuracy within threshold"""
    metrics = calculate_exact_match_rate(actual_ranks, predicted_scores)
    if threshold == 1:
        return metrics['within_1']
    elif threshold == 2:
        return metrics['within_2']
    elif threshold == 3:
        return metrics['within_3']
    else:
        predicted_ranks = rankdata(-predicted_scores, method='ordinal')
        differences = np.abs(predicted_ranks - actual_ranks)
        return float((differences <= threshold).sum() / len(differences) * 100)


def calculate_gradients(samples: List[Dict], weights: Dict, epsilon: float = 0.001) -> Dict:
    """Legacy: Calculate gradients (redirects to new function)"""
    all_grads = calculate_all_gradients(samples, weights, epsilon)

    # Convert to legacy format
    return {
        'c_rank_weight': all_grads.get('c_rank.weight', 0),
        'dia_weight': all_grads.get('dia.weight', 0),
        'extra_post_count': all_grads.get('extra.post_count', 0),
        'extra_neighbor_count': all_grads.get('extra.neighbor_count', 0),
        'extra_visitor_count': all_grads.get('extra.visitor_count', 0)
    }


def train_model(
    samples: List[Dict],
    initial_weights: Dict,
    learning_rate: float = 0.01,
    epochs: int = 50,
    min_samples: int = 1
) -> Tuple[Dict, Dict]:
    """
    Train the model - now uses instant_adjust_weights for better results
    """
    if len(samples) < min_samples:
        raise ValueError(f"Need at least {min_samples} samples to train")

    # Use the new instant adjustment
    new_weights, info = instant_adjust_weights(
        samples=samples,
        current_weights=initial_weights,
        target_accuracy=95.0,
        max_iterations=epochs * 2,
        learning_rate=learning_rate * 5,  # More aggressive
        momentum=0.9
    )

    # Convert to legacy format
    training_info = {
        'session_id': info.get('session_id', f"session_{uuid.uuid4().hex[:8]}"),
        'samples_used': info.get('samples_used', len(samples)),
        'initial_accuracy': info.get('initial_accuracy', 0),
        'final_accuracy': info.get('final_accuracy', 0),
        'improvement': info.get('improvement', 0),
        'duration_seconds': info.get('duration_seconds', 0),
        'epochs': info.get('iterations', epochs),
        'learning_rate': learning_rate,
        'weight_changes': info.get('weight_changes', {})
    }

    return new_weights, training_info


def auto_train_if_needed(samples: List[Dict], current_weights: Dict, min_samples: int = 1) -> Tuple[bool, Dict, Dict]:
    """
    Automatically train if there are enough samples

    Now uses instant adjustment for real-time learning
    """
    if len(samples) < min_samples:
        return False, current_weights, {}

    try:
        new_weights, training_info = instant_adjust_weights(
            samples=samples,
            current_weights=current_weights,
            target_accuracy=95.0,
            max_iterations=100,
            learning_rate=0.05,
            momentum=0.9
        )
        return True, new_weights, training_info
    except Exception as e:
        print(f"Auto-training failed: {e}")
        import traceback
        traceback.print_exc()
        return False, current_weights, {'error': str(e)}


# ==============================================
# FEATURE CORRELATION ANALYSIS (네이버 순위와 특성별 상관관계)
# ==============================================
def analyze_feature_correlations(samples: List[Dict]) -> Dict:
    """
    각 특성이 네이버 순위와 얼마나 상관관계가 있는지 분석

    Returns: 각 특성별 순위 상관계수 (높을수록 순위에 영향이 큼)
    """
    if len(samples) < 10:
        return {'error': 'Need at least 10 samples for correlation analysis'}

    # 실제 순위 (낮을수록 좋음: 1위 > 13위)
    actual_ranks = np.array([s.get('actual_rank', 0) for s in samples])

    # 분석할 특성들
    features_to_analyze = {
        # 블로그 전체 특성
        'c_rank_score': 'C-Rank 점수',
        'dia_score': 'D.I.A. 점수',
        'post_count': '총 포스팅 수',
        'neighbor_count': '이웃 수',
        'visitor_count': '방문자 수',
        'context_score': 'C-Rank: 주제집중도',
        'content_score': 'C-Rank: 콘텐츠품질',
        'chain_score': 'C-Rank: 연결성',
        'depth_score': 'D.I.A: 깊이',
        'information_score': 'D.I.A: 정보성',
        'accuracy_score': 'D.I.A: 정확성',
        # 개별 글 특성
        'title_has_keyword': '제목에 키워드 포함',
        'title_keyword_position': '제목 키워드 위치',
        'content_length': '본문 길이',
        'image_count': '이미지 수',
        'video_count': '동영상 수',
        'keyword_count': '키워드 언급 횟수',
        'keyword_density': '키워드 밀도',
        'heading_count': '소제목 수',
        'paragraph_count': '문단 수',
        'has_map': '지도 포함',
        'has_link': '링크 포함',
        'like_count': '공감 수',
        'comment_count': '댓글 수',
        'post_age_days': '글 작성 후 경과일',
    }

    correlations = {}

    for feature_key, feature_name in features_to_analyze.items():
        feature_values = []
        valid_ranks = []

        for i, sample in enumerate(samples):
            value = sample.get(feature_key)
            if value is not None and value != -1:  # -1은 "없음" 표시
                feature_values.append(float(value))
                valid_ranks.append(actual_ranks[i])

        if len(feature_values) >= 10:
            feature_arr = np.array(feature_values)
            rank_arr = np.array(valid_ranks)

            # Spearman 순위 상관계수 계산
            corr, p_value = spearmanr(feature_arr, rank_arr)

            if not np.isnan(corr):
                # 음수 상관관계 = 특성값이 높을수록 순위가 좋음 (1위에 가까움)
                correlations[feature_key] = {
                    'name': feature_name,
                    'correlation': float(corr),
                    'abs_correlation': abs(float(corr)),
                    'direction': '높을수록 순위 좋음' if corr < 0 else '높을수록 순위 나쁨',
                    'p_value': float(p_value),
                    'significant': bool(p_value < 0.05),  # numpy.bool -> Python bool
                    'sample_count': int(len(feature_values))
                }

    # 상관관계 절대값 기준 정렬 (영향력 큰 순서)
    sorted_features = sorted(
        correlations.items(),
        key=lambda x: x[1]['abs_correlation'],
        reverse=True
    )

    return {
        'correlations': dict(sorted_features),
        'top_positive_factors': [
            {'feature': k, **v} for k, v in sorted_features
            if v['correlation'] < 0  # 음수 = 순위에 긍정적
        ][:10],
        'top_negative_factors': [
            {'feature': k, **v} for k, v in sorted_features
            if v['correlation'] > 0  # 양수 = 순위에 부정적
        ][:5],
        'total_samples': len(samples),
        'features_analyzed': len(correlations)
    }


def analyze_top_vs_bottom(samples: List[Dict]) -> Dict:
    """
    상위권(1-3위) vs 하위권(10-13위) 블로그/글의 특성 차이 분석

    이를 통해 "상위 노출되려면 어떤 특성이 필요한지" 파악
    """
    if len(samples) < 20:
        return {'error': 'Need at least 20 samples for top vs bottom analysis'}

    # 상위권/하위권 분리
    top_samples = [s for s in samples if s.get('actual_rank', 99) <= 3]
    bottom_samples = [s for s in samples if s.get('actual_rank', 0) >= 10]

    if len(top_samples) < 5 or len(bottom_samples) < 5:
        return {'error': 'Not enough samples in top or bottom groups'}

    # 분석할 특성들
    features = [
        'c_rank_score', 'dia_score', 'post_count', 'neighbor_count', 'visitor_count',
        'content_length', 'image_count', 'video_count', 'keyword_count', 'keyword_density',
        'heading_count', 'paragraph_count', 'like_count', 'comment_count', 'post_age_days',
        'title_has_keyword'
    ]

    feature_names = {
        'c_rank_score': 'C-Rank 점수',
        'dia_score': 'D.I.A. 점수',
        'post_count': '총 포스팅 수',
        'neighbor_count': '이웃 수',
        'visitor_count': '방문자 수',
        'content_length': '본문 길이 (자)',
        'image_count': '이미지 수',
        'video_count': '동영상 수',
        'keyword_count': '키워드 언급 횟수',
        'keyword_density': '키워드 밀도 (%)',
        'heading_count': '소제목 수',
        'paragraph_count': '문단 수',
        'like_count': '공감 수',
        'comment_count': '댓글 수',
        'post_age_days': '글 경과일',
        'title_has_keyword': '제목 키워드 포함률 (%)'
    }

    def avg_feature(samples_list, key):
        values = [s.get(key, 0) or 0 for s in samples_list]
        return sum(values) / len(values) if values else 0

    comparison = {}
    insights = []

    for feature in features:
        top_avg = avg_feature(top_samples, feature)
        bottom_avg = avg_feature(bottom_samples, feature)

        if bottom_avg > 0:
            ratio = top_avg / bottom_avg
        elif top_avg > 0:
            ratio = float('inf')
        else:
            ratio = 1.0

        diff_percent = ((top_avg - bottom_avg) / max(bottom_avg, 0.001)) * 100

        comparison[feature] = {
            'name': feature_names.get(feature, feature),
            'top_3_avg': round(top_avg, 2),
            'bottom_avg': round(bottom_avg, 2),
            'ratio': round(ratio, 2) if ratio != float('inf') else '∞',
            'diff_percent': round(diff_percent, 1),
            'insight': ''
        }

        # 인사이트 생성
        if abs(diff_percent) >= 30:
            if diff_percent > 0:
                insight = f"✅ {feature_names.get(feature, feature)}: 상위권이 {abs(diff_percent):.0f}% 더 높음"
            else:
                insight = f"⚠️ {feature_names.get(feature, feature)}: 상위권이 {abs(diff_percent):.0f}% 더 낮음"
            insights.append(insight)
            comparison[feature]['insight'] = insight

    # 가장 큰 차이를 보이는 특성 정렬
    sorted_comparison = sorted(
        comparison.items(),
        key=lambda x: abs(x[1]['diff_percent']),
        reverse=True
    )

    return {
        'comparison': dict(sorted_comparison),
        'top_count': len(top_samples),
        'bottom_count': len(bottom_samples),
        'key_insights': insights[:10],
        'recommendation': generate_optimization_tips(comparison)
    }


def generate_optimization_tips(comparison: Dict) -> List[str]:
    """상위 노출을 위한 최적화 팁 생성"""
    tips = []

    # 본문 길이
    if comparison.get('content_length', {}).get('diff_percent', 0) > 30:
        top_len = comparison['content_length']['top_3_avg']
        tips.append(f"📝 본문 길이를 {int(top_len)}자 이상으로 작성하세요")

    # 이미지 수
    if comparison.get('image_count', {}).get('diff_percent', 0) > 20:
        top_img = comparison['image_count']['top_3_avg']
        tips.append(f"🖼️ 이미지를 {int(top_img)}개 이상 포함하세요")

    # 키워드 밀도
    if comparison.get('keyword_density', {}).get('top_3_avg', 0) > 0:
        top_density = comparison['keyword_density']['top_3_avg']
        tips.append(f"🔑 키워드 밀도를 {top_density:.1f}% 정도로 유지하세요")

    # 소제목
    if comparison.get('heading_count', {}).get('diff_percent', 0) > 20:
        top_heading = comparison['heading_count']['top_3_avg']
        tips.append(f"📌 소제목을 {int(top_heading)}개 이상 사용하세요")

    # 제목 키워드
    if comparison.get('title_has_keyword', {}).get('top_3_avg', 0) > 0.7:
        tips.append("🏷️ 제목에 반드시 핵심 키워드를 포함하세요")

    # 글 최신성
    post_age = comparison.get('post_age_days', {})
    if post_age.get('top_3_avg', 999) < post_age.get('bottom_avg', 0):
        tips.append("🕐 최신 글이 유리합니다 - 주기적으로 업데이트하세요")

    return tips if tips else ["충분한 데이터가 쌓이면 구체적인 팁을 제공합니다"]


# ==============================================
# ANALYSIS HELPERS
# ==============================================
def analyze_ranking_patterns(samples: List[Dict]) -> Dict:
    """
    Analyze patterns in ranking data to understand what factors matter most
    """
    if len(samples) < 5:
        return {'error': 'Need at least 5 samples for pattern analysis'}

    # Group by rank position
    top_3 = [s for s in samples if s.get('actual_rank', 0) <= 3]
    mid_range = [s for s in samples if 4 <= s.get('actual_rank', 0) <= 7]
    bottom = [s for s in samples if s.get('actual_rank', 0) >= 8]

    def avg(lst, key):
        vals = [s.get(key, 0) or 0 for s in lst]
        return sum(vals) / len(vals) if vals else 0

    patterns = {
        'top_3_avg': {
            'c_rank_score': avg(top_3, 'c_rank_score'),
            'dia_score': avg(top_3, 'dia_score'),
            'post_count': avg(top_3, 'post_count'),
            'neighbor_count': avg(top_3, 'neighbor_count'),
        },
        'mid_range_avg': {
            'c_rank_score': avg(mid_range, 'c_rank_score'),
            'dia_score': avg(mid_range, 'dia_score'),
            'post_count': avg(mid_range, 'post_count'),
            'neighbor_count': avg(mid_range, 'neighbor_count'),
        },
        'bottom_avg': {
            'c_rank_score': avg(bottom, 'c_rank_score'),
            'dia_score': avg(bottom, 'dia_score'),
            'post_count': avg(bottom, 'post_count'),
            'neighbor_count': avg(bottom, 'neighbor_count'),
        },
        'sample_counts': {
            'top_3': len(top_3),
            'mid_range': len(mid_range),
            'bottom': len(bottom)
        }
    }

    # Determine which factors correlate most with high ranking
    recommendations = []

    t = patterns['top_3_avg']
    b = patterns['bottom_avg']

    if t['c_rank_score'] > b['c_rank_score'] * 1.2:
        recommendations.append("C-Rank is a strong ranking factor")
    if t['dia_score'] > b['dia_score'] * 1.2:
        recommendations.append("D.I.A. is a strong ranking factor")
    if t['post_count'] > b['post_count'] * 1.5:
        recommendations.append("Post count significantly affects ranking")
    if t['neighbor_count'] > b['neighbor_count'] * 1.5:
        recommendations.append("Neighbor count significantly affects ranking")

    patterns['recommendations'] = recommendations

    return patterns
