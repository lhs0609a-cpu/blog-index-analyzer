"""
Machine Learning engine for ranking prediction
Uses Spearman correlation and gradient descent
"""
import numpy as np
from scipy.stats import spearmanr
from scipy.stats import rankdata
from typing import Dict, List, Tuple
import time
from datetime import datetime
import uuid


def calculate_blog_score(features: Dict, weights: Dict) -> float:
    """
    Calculate blog score based on features and weights

    Score = (C-Rank * c_rank_weight) + (D.I.A. * dia_weight) + extra_factors
    """
    # C-Rank component
    c_rank_score = features.get('c_rank_score', 0) or 0
    c_rank_weight = weights['c_rank']['weight']

    # D.I.A. component
    dia_score = features.get('dia_score', 0) or 0
    dia_weight = weights['dia']['weight']

    # Extra factors
    extra_weights = weights['extra_factors']
    post_count = features.get('post_count', 0) or 0
    neighbor_count = features.get('neighbor_count', 0) or 0
    visitor_count = features.get('visitor_count', 0) or 0

    # Normalize extra factors (assume max values)
    post_score = min(post_count / 1000, 1.0) * extra_weights['post_count']
    neighbor_score = min(neighbor_count / 1000, 1.0) * extra_weights['neighbor_count']
    visitor_score = min(visitor_count / 10000, 1.0) * extra_weights['visitor_count']

    total_score = (
        c_rank_score * c_rank_weight +
        dia_score * dia_weight +
        post_score * 100 +
        neighbor_score * 100 +
        visitor_score * 100
    )

    return total_score


def calculate_predicted_scores(samples: List[Dict], weights: Dict) -> np.ndarray:
    """Calculate predicted scores for all samples"""
    scores = []
    for sample in samples:
        features = {
            'c_rank_score': sample.get('c_rank_score'),
            'dia_score': sample.get('dia_score'),
            'post_count': sample.get('post_count'),
            'neighbor_count': sample.get('neighbor_count'),
            'visitor_count': sample.get('visitor_count')
        }
        score = calculate_blog_score(features, weights)
        scores.append(score)
    return np.array(scores)


def calculate_loss(actual_ranks: np.ndarray, predicted_scores: np.ndarray) -> Tuple[float, float]:
    """
    Calculate loss using Spearman rank correlation

    Returns: (loss, correlation)
    """
    # Convert predicted scores to ranks (higher score = lower rank number)
    predicted_ranks = rankdata(-predicted_scores, method='ordinal')

    # Calculate Spearman correlation
    correlation, _ = spearmanr(actual_ranks, predicted_ranks)

    # Handle NaN correlation
    if np.isnan(correlation):
        correlation = 0.0

    # Loss = 1 - correlation (we want to minimize this)
    loss = 1.0 - correlation

    return loss, correlation


def calculate_accuracy(actual_ranks: np.ndarray, predicted_scores: np.ndarray, threshold: int = 3) -> float:
    """
    Calculate accuracy: percentage of predictions within ±threshold ranks
    """
    predicted_ranks = rankdata(-predicted_scores, method='ordinal')
    differences = np.abs(predicted_ranks - actual_ranks)
    within_threshold = (differences <= threshold).sum()
    accuracy = (within_threshold / len(differences)) * 100.0
    return accuracy


def calculate_gradients(samples: List[Dict], weights: Dict, epsilon: float = 0.001) -> Dict:
    """
    Calculate gradients using numerical differentiation
    """
    actual_ranks = np.array([s['actual_rank'] for s in samples])
    base_scores = calculate_predicted_scores(samples, weights)
    base_loss, _ = calculate_loss(actual_ranks, base_scores)

    gradients = {}

    # Gradient for c_rank weight
    weights_copy = weights.copy()
    weights_copy['c_rank'] = weights['c_rank'].copy()
    weights_copy['c_rank']['weight'] += epsilon
    perturbed_scores = calculate_predicted_scores(samples, weights_copy)
    perturbed_loss, _ = calculate_loss(actual_ranks, perturbed_scores)
    gradients['c_rank_weight'] = (perturbed_loss - base_loss) / epsilon

    # Gradient for dia weight
    weights_copy = weights.copy()
    weights_copy['dia'] = weights['dia'].copy()
    weights_copy['dia']['weight'] += epsilon
    perturbed_scores = calculate_predicted_scores(samples, weights_copy)
    perturbed_loss, _ = calculate_loss(actual_ranks, perturbed_scores)
    gradients['dia_weight'] = (perturbed_loss - base_loss) / epsilon

    # Gradients for extra factors
    for factor in ['post_count', 'neighbor_count', 'visitor_count']:
        weights_copy = weights.copy()
        weights_copy['extra_factors'] = weights['extra_factors'].copy()
        weights_copy['extra_factors'][factor] += epsilon
        perturbed_scores = calculate_predicted_scores(samples, weights_copy)
        perturbed_loss, _ = calculate_loss(actual_ranks, perturbed_scores)
        gradients[f'extra_{factor}'] = (perturbed_loss - base_loss) / epsilon

    return gradients


def train_model(
    samples: List[Dict],
    initial_weights: Dict,
    learning_rate: float = 0.01,
    epochs: int = 50,
    min_samples: int = 1
) -> Tuple[Dict, Dict]:
    """
    Train the model using gradient descent

    Returns: (updated_weights, training_info)
    """
    if len(samples) < min_samples:
        raise ValueError(f"Need at least {min_samples} samples to train")

    start_time = time.time()
    session_id = f"session_{uuid.uuid4().hex[:8]}"

    weights = {
        'c_rank': initial_weights['c_rank'].copy(),
        'dia': initial_weights['dia'].copy(),
        'extra_factors': initial_weights['extra_factors'].copy()
    }

    actual_ranks = np.array([s['actual_rank'] for s in samples])

    # Initial accuracy
    initial_scores = calculate_predicted_scores(samples, weights)
    initial_accuracy = calculate_accuracy(actual_ranks, initial_scores)

    # Training loop
    history = []
    for epoch in range(epochs):
        # Calculate predictions
        predicted_scores = calculate_predicted_scores(samples, weights)

        # Calculate loss
        loss, correlation = calculate_loss(actual_ranks, predicted_scores)
        accuracy = calculate_accuracy(actual_ranks, predicted_scores)

        # Calculate gradients
        gradients = calculate_gradients(samples, weights)

        # Update weights
        weights['c_rank']['weight'] -= learning_rate * gradients['c_rank_weight']
        weights['dia']['weight'] -= learning_rate * gradients['dia_weight']
        weights['extra_factors']['post_count'] -= learning_rate * gradients['extra_post_count']
        weights['extra_factors']['neighbor_count'] -= learning_rate * gradients['extra_neighbor_count']
        weights['extra_factors']['visitor_count'] -= learning_rate * gradients['extra_visitor_count']

        # Ensure weights stay positive and normalized
        weights['c_rank']['weight'] = max(0.1, min(0.9, weights['c_rank']['weight']))
        weights['dia']['weight'] = max(0.1, min(0.9, weights['dia']['weight']))

        for factor in ['post_count', 'neighbor_count', 'visitor_count']:
            weights['extra_factors'][factor] = max(0.01, min(0.5, weights['extra_factors'][factor]))

        history.append({
            'epoch': epoch,
            'loss': float(loss),
            'correlation': float(correlation),
            'accuracy': float(accuracy)
        })

        # Early stopping if correlation is very high
        if correlation > 0.95:
            break

    # Final accuracy
    final_scores = calculate_predicted_scores(samples, weights)
    final_accuracy = calculate_accuracy(actual_ranks, final_scores)

    duration = time.time() - start_time

    training_info = {
        'session_id': session_id,
        'samples_used': len(samples),
        'initial_accuracy': float(initial_accuracy),
        'final_accuracy': float(final_accuracy),
        'improvement': float(final_accuracy - initial_accuracy),
        'duration_seconds': float(duration),
        'epochs': len(history),
        'learning_rate': learning_rate,
        'history': history,
        'weight_changes': {
            'c_rank.weight': {
                'before': float(initial_weights['c_rank']['weight']),
                'after': float(weights['c_rank']['weight']),
                'change': float(weights['c_rank']['weight'] - initial_weights['c_rank']['weight'])
            },
            'dia.weight': {
                'before': float(initial_weights['dia']['weight']),
                'after': float(weights['dia']['weight']),
                'change': float(weights['dia']['weight'] - initial_weights['dia']['weight'])
            }
        }
    }

    return weights, training_info


def auto_train_if_needed(samples: List[Dict], current_weights: Dict, min_samples: int = 1) -> Tuple[bool, Dict, Dict]:
    """
    Automatically train if there are enough samples

    Returns: (trained, new_weights, training_info)
    """
    if len(samples) < min_samples:
        return False, current_weights, {}

    try:
        new_weights, training_info = train_model(
            samples=samples,
            initial_weights=current_weights,
            learning_rate=0.01,
            epochs=50,
            min_samples=min_samples
        )
        return True, new_weights, training_info
    except Exception as e:
        print(f"Auto-training failed: {e}")
        return False, current_weights, {}
