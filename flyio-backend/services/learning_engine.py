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


# ==============================================
# CONSTANTS
# ==============================================
DEFAULT_WEIGHTS = {
    'c_rank': {
        'weight': 0.50,
        'sub_weights': {
            'context': 0.35,  # 주제 집중도
            'content': 0.40,  # 콘텐츠 품질
            'chain': 0.25     # 연결성
        }
    },
    'dia': {
        'weight': 0.50,
        'sub_weights': {
            'depth': 0.33,      # 깊이
            'information': 0.34, # 정보성
            'accuracy': 0.33    # 정확성
        }
    },
    'extra_factors': {
        'post_count': 0.15,
        'neighbor_count': 0.10,
        'visitor_count': 0.05,
        'recent_activity': 0.10,
        'content_length': 0.10
    },
    'post_factors': {  # 글 단위 요소
        'title_keyword_match': 0.20,
        'content_keyword_density': 0.15,
        'content_length': 0.15,
        'image_count': 0.10,
        'freshness': 0.15,
        'engagement': 0.10,
        'structure_quality': 0.15
    }
}


# ==============================================
# SCORE CALCULATION
# ==============================================
def calculate_blog_score(features: Dict, weights: Dict) -> float:
    """
    Calculate blog score based on features and weights

    Score = (C-Rank * c_rank_weight) + (D.I.A. * dia_weight) + extra_factors
    """
    # C-Rank component
    c_rank_score = features.get('c_rank_score', 0) or 0
    c_rank_weight = weights.get('c_rank', {}).get('weight', 0.5)

    # D.I.A. component
    dia_score = features.get('dia_score', 0) or 0
    dia_weight = weights.get('dia', {}).get('weight', 0.5)

    # Extra factors
    extra_weights = weights.get('extra_factors', {})

    # Blog-level factors
    post_count = features.get('post_count', 0) or 0
    neighbor_count = features.get('neighbor_count', 0) or 0
    visitor_count = features.get('visitor_count', 0) or 0

    # Normalize and calculate extra scores
    post_score = min(post_count / 1000, 1.0) * extra_weights.get('post_count', 0.15)
    neighbor_score = min(neighbor_count / 1000, 1.0) * extra_weights.get('neighbor_count', 0.10)
    visitor_score = min(visitor_count / 100000, 1.0) * extra_weights.get('visitor_count', 0.05)

    # C-Rank sub-components (if available)
    context_score = features.get('context_score', 50) or 50
    content_score = features.get('content_score', 50) or 50
    chain_score = features.get('chain_score', 50) or 50

    c_sub = weights.get('c_rank', {}).get('sub_weights', {})
    c_rank_detailed = (
        context_score * c_sub.get('context', 0.35) +
        content_score * c_sub.get('content', 0.40) +
        chain_score * c_sub.get('chain', 0.25)
    )

    # D.I.A. sub-components (if available)
    depth_score = features.get('depth_score', 50) or 50
    info_score = features.get('information_score', 50) or 50
    accuracy_score = features.get('accuracy_score', 50) or 50

    d_sub = weights.get('dia', {}).get('sub_weights', {})
    dia_detailed = (
        depth_score * d_sub.get('depth', 0.33) +
        info_score * d_sub.get('information', 0.34) +
        accuracy_score * d_sub.get('accuracy', 0.33)
    )

    # Use detailed scores if sub-components are available, otherwise use provided scores
    if features.get('context_score') is not None:
        final_c_rank = c_rank_detailed
    else:
        final_c_rank = c_rank_score

    if features.get('depth_score') is not None:
        final_dia = dia_detailed
    else:
        final_dia = dia_score

    # Total score calculation
    total_score = (
        final_c_rank * c_rank_weight +
        final_dia * dia_weight +
        post_score * 100 +
        neighbor_score * 100 +
        visitor_score * 100
    )

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
    """Calculate predicted scores for all samples"""
    scores = []
    for sample in samples:
        features = {
            'c_rank_score': sample.get('c_rank_score'),
            'dia_score': sample.get('dia_score'),
            'post_count': sample.get('post_count'),
            'neighbor_count': sample.get('neighbor_count'),
            'visitor_count': sample.get('visitor_count'),
            # Sub-components
            'context_score': sample.get('context_score'),
            'content_score': sample.get('content_score'),
            'chain_score': sample.get('chain_score'),
            'depth_score': sample.get('depth_score'),
            'information_score': sample.get('information_score'),
            'accuracy_score': sample.get('accuracy_score'),
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

    # Extra factors gradients
    for factor in ['post_count', 'neighbor_count', 'visitor_count']:
        w_copy = json.loads(json.dumps(weights))
        if 'extra_factors' not in w_copy:
            w_copy['extra_factors'] = DEFAULT_WEIGHTS['extra_factors'].copy()
        w_copy['extra_factors'][factor] += epsilon
        gradients[f'extra.{factor}'] = calc_gradient(w_copy, f'extra.{factor}', epsilon)

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
    """
    start_time = time.time()

    if len(samples) < 3:
        return current_weights, {'error': 'Need at least 3 samples'}

    # Initialize weights with deep copy
    weights = json.loads(json.dumps(current_weights))

    # Ensure all required keys exist
    if 'c_rank' not in weights:
        weights['c_rank'] = DEFAULT_WEIGHTS['c_rank'].copy()
    if 'dia' not in weights:
        weights['dia'] = DEFAULT_WEIGHTS['dia'].copy()
    if 'extra_factors' not in weights:
        weights['extra_factors'] = DEFAULT_WEIGHTS['extra_factors'].copy()
    if 'sub_weights' not in weights['c_rank']:
        weights['c_rank']['sub_weights'] = DEFAULT_WEIGHTS['c_rank']['sub_weights'].copy()
    if 'sub_weights' not in weights['dia']:
        weights['dia']['sub_weights'] = DEFAULT_WEIGHTS['dia']['sub_weights'].copy()

    actual_ranks = np.array([s['actual_rank'] for s in samples])

    # Initial metrics
    initial_scores = calculate_predicted_scores(samples, weights)
    initial_metrics = calculate_exact_match_rate(actual_ranks, initial_scores)
    initial_accuracy = initial_metrics['within_1']  # ±1 accuracy as main metric

    # Momentum storage
    velocity = {}

    # Training loop
    history = []
    best_weights = json.loads(json.dumps(weights))
    best_accuracy = initial_accuracy

    for iteration in range(max_iterations):
        # Calculate current metrics
        predicted_scores = calculate_predicted_scores(samples, weights)
        metrics = calculate_exact_match_rate(actual_ranks, predicted_scores)
        current_accuracy = metrics['within_1']

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
                elif category == 'c_rank' and param in ['context', 'content', 'chain']:
                    weights['c_rank']['sub_weights'][param] += velocity[key]
                elif category == 'dia' and param in ['depth', 'information', 'accuracy']:
                    weights['dia']['sub_weights'][param] += velocity[key]
                elif category == 'extra':
                    weights['extra_factors'][param] += velocity[key]

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

    # Final metrics
    final_scores = calculate_predicted_scores(samples, weights)
    final_metrics = calculate_exact_match_rate(actual_ranks, final_scores)
    _, final_spearman, final_kendall = calculate_rank_loss(actual_ranks, final_scores)

    duration = time.time() - start_time

    adjustment_info = {
        'session_id': f"instant_{uuid.uuid4().hex[:8]}",
        'samples_used': len(samples),
        'iterations': len(history),
        'duration_seconds': float(duration),
        'initial_accuracy': float(initial_accuracy),
        'final_accuracy': float(final_metrics['within_1']),
        'improvement': float(final_metrics['within_1'] - initial_accuracy),
        'exact_match_rate': float(final_metrics['exact_match']),
        'avg_deviation': float(final_metrics['avg_deviation']),
        'spearman_correlation': float(final_spearman),
        'kendall_tau': float(final_kendall),
        'target_reached': final_metrics['within_1'] >= target_accuracy,
        'weight_changes': calculate_weight_changes(current_weights, weights)
    }

    return weights, adjustment_info


def constrain_weights(weights: Dict) -> Dict:
    """Ensure all weights are within valid ranges"""
    # Main weights: 0.1 ~ 0.9
    weights['c_rank']['weight'] = max(0.1, min(0.9, weights['c_rank']['weight']))
    weights['dia']['weight'] = max(0.1, min(0.9, weights['dia']['weight']))

    # Normalize main weights to sum to 1
    total = weights['c_rank']['weight'] + weights['dia']['weight']
    if total != 0:
        weights['c_rank']['weight'] /= total
        weights['dia']['weight'] /= total

    # Sub-weights: 0.1 ~ 0.6
    for sub in ['context', 'content', 'chain']:
        weights['c_rank']['sub_weights'][sub] = max(0.1, min(0.6, weights['c_rank']['sub_weights'][sub]))

    for sub in ['depth', 'information', 'accuracy']:
        weights['dia']['sub_weights'][sub] = max(0.1, min(0.6, weights['dia']['sub_weights'][sub]))

    # Normalize sub-weights
    c_total = sum(weights['c_rank']['sub_weights'].values())
    if c_total != 0:
        for k in weights['c_rank']['sub_weights']:
            weights['c_rank']['sub_weights'][k] /= c_total

    d_total = sum(weights['dia']['sub_weights'].values())
    if d_total != 0:
        for k in weights['dia']['sub_weights']:
            weights['dia']['sub_weights'][k] /= d_total

    # Extra factors: 0.01 ~ 0.5
    for factor in weights.get('extra_factors', {}):
        weights['extra_factors'][factor] = max(0.01, min(0.5, weights['extra_factors'][factor]))

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
