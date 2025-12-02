"""
머신러닝 기반 순위 예측 모델
- 네이버 실제 순위와 우리 예측 순위 비교
- 가중치 자동 조정
"""
import logging
import numpy as np
from typing import Dict, Any, List, Tuple
from datetime import datetime
from database.sqlite_db import get_sqlite_client

logger = logging.getLogger(__name__)

try:
    from sklearn.ensemble import RandomForestRegressor, GradientBoostingRegressor
    from sklearn.model_selection import train_test_split
    from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
    SKLEARN_AVAILABLE = True
except ImportError:
    logger.warning("scikit-learn이 설치되지 않았습니다. ML 기능이 제한됩니다.")
    SKLEARN_AVAILABLE = False


class MLRankingModel:
    """ML 기반 순위 예측 모델"""

    def __init__(self):
        self.db = get_sqlite_client()
        self.model = None
        self.feature_names = [
            'c_rank_score',
            'dia_score',
            'blog_age_days',
            'total_posts',
            'neighbor_count',
            'total_visitors'
        ]

    def load_training_data(self, min_samples: int = 50) -> Tuple[np.ndarray, np.ndarray]:
        """
        학습 데이터 로드

        Args:
            min_samples: 최소 필요 샘플 수

        Returns:
            (X, y) - 특성 행렬과 타겟 벡터
        """
        try:
            with self.db.get_connection() as conn:
                cur = conn.cursor()

                # 최근 데이터 로드 (NULL 값 제외)
                cur.execute("""
                    SELECT
                        c_rank_score,
                        dia_score,
                        blog_age_days,
                        total_posts,
                        neighbor_count,
                        total_visitors,
                        actual_rank
                    FROM ranking_learning_data
                    WHERE c_rank_score IS NOT NULL
                      AND dia_score IS NOT NULL
                      AND blog_age_days IS NOT NULL
                      AND total_posts IS NOT NULL
                      AND neighbor_count IS NOT NULL
                      AND total_visitors IS NOT NULL
                      AND actual_rank IS NOT NULL
                    ORDER BY search_date DESC
                    LIMIT 1000
                """)

                rows = cur.fetchall()

                if len(rows) < min_samples:
                    raise ValueError(f"학습 데이터 부족: {len(rows)}개 (최소 {min_samples}개 필요)")

                # numpy 배열로 변환
                data = np.array([list(row) for row in rows])
                X = data[:, :6]  # 특성 6개
                y = data[:, 6]   # 실제 순위

                logger.info(f"학습 데이터 로드 완료: {len(X)}개 샘플")
                return X, y

        except Exception as e:
            logger.error(f"학습 데이터 로드 오류: {e}", exc_info=True)
            raise

    def train_model(self, X: np.ndarray, y: np.ndarray) -> Dict[str, Any]:
        """
        모델 학습

        Args:
            X: 특성 행렬
            y: 타겟 벡터 (실제 순위)

        Returns:
            학습 결과 (성능 지표, 가중치 등)
        """
        if not SKLEARN_AVAILABLE:
            raise RuntimeError("scikit-learn이 설치되지 않았습니다")

        try:
            # 학습/테스트 데이터 분할
            X_train, X_test, y_train, y_test = train_test_split(
                X, y, test_size=0.2, random_state=42
            )

            # 랜덤 포레스트 모델 학습
            self.model = RandomForestRegressor(
                n_estimators=100,
                max_depth=10,
                random_state=42,
                n_jobs=-1
            )

            logger.info("모델 학습 시작...")
            self.model.fit(X_train, y_train)

            # 예측
            y_pred = self.model.predict(X_test)

            # 성능 평가
            mae = mean_absolute_error(y_test, y_pred)
            rmse = np.sqrt(mean_squared_error(y_test, y_pred))
            r2 = r2_score(y_test, y_pred)

            # Feature Importance (가중치)
            feature_importances = self.model.feature_importances_
            weights = {
                name: float(importance)
                for name, importance in zip(self.feature_names, feature_importances)
            }

            logger.info(f"모델 학습 완료 - MAE: {mae:.2f}, RMSE: {rmse:.2f}, R²: {r2:.3f}")
            logger.info(f"Feature Importances: {weights}")

            return {
                "mae": float(mae),
                "rmse": float(rmse),
                "r2_score": float(r2),
                "weights": weights,
                "training_samples": len(X_train),
                "test_samples": len(X_test)
            }

        except Exception as e:
            logger.error(f"모델 학습 오류: {e}", exc_info=True)
            raise

    def save_weights(self, training_result: Dict[str, Any]) -> int:
        """
        가중치를 데이터베이스에 저장

        Args:
            training_result: 학습 결과

        Returns:
            저장된 모델 ID
        """
        try:
            weights = training_result["weights"]
            model_version = f"v{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"

            with self.db.get_connection() as conn:
                cur = conn.cursor()

                # 기존 활성 모델 비활성화
                cur.execute("UPDATE ml_model_weights SET is_active = 0")

                # 새 가중치 저장
                cur.execute("""
                    INSERT INTO ml_model_weights
                    (model_version, weight_c_rank, weight_dia, weight_blog_age,
                     weight_posts, weight_neighbors, weight_visitors,
                     weight_content_length, weight_recency,
                     mae, rmse, r2_score, training_samples, is_active)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                """, (
                    model_version,
                    weights.get('c_rank_score', 0),
                    weights.get('dia_score', 0),
                    weights.get('blog_age_days', 0),
                    weights.get('total_posts', 0),
                    weights.get('neighbor_count', 0),
                    weights.get('total_visitors', 0),
                    0,  # content_length (추후 추가)
                    0,  # recency (추후 추가)
                    training_result["mae"],
                    training_result["rmse"],
                    training_result["r2_score"],
                    training_result["training_samples"]
                ))

                model_id = cur.lastrowid
                logger.info(f"가중치 저장 완료: {model_version} (ID: {model_id})")
                return model_id

        except Exception as e:
            logger.error(f"가중치 저장 오류: {e}", exc_info=True)
            raise

    def get_active_weights(self) -> Dict[str, float]:
        """활성 모델의 가중치 조회"""
        try:
            with self.db.get_connection() as conn:
                cur = conn.cursor()

                cur.execute("""
                    SELECT weight_c_rank, weight_dia, weight_blog_age,
                           weight_posts, weight_neighbors, weight_visitors
                    FROM ml_model_weights
                    WHERE is_active = 1
                    ORDER BY trained_at DESC
                    LIMIT 1
                """)

                row = cur.fetchone()
                if not row:
                    # 기본 가중치 반환
                    return {
                        'c_rank_score': 0.30,
                        'dia_score': 0.20,
                        'blog_age_days': 0.15,
                        'total_posts': 0.15,
                        'neighbor_count': 0.10,
                        'total_visitors': 0.10
                    }

                return {
                    'c_rank_score': float(row[0] or 0.30),
                    'dia_score': float(row[1] or 0.20),
                    'blog_age_days': float(row[2] or 0.15),
                    'total_posts': float(row[3] or 0.15),
                    'neighbor_count': float(row[4] or 0.10),
                    'total_visitors': float(row[5] or 0.10)
                }

        except Exception as e:
            logger.error(f"가중치 조회 오류: {e}", exc_info=True)
            # 오류 시 기본 가중치 반환
            return {
                'c_rank_score': 0.30,
                'dia_score': 0.20,
                'blog_age_days': 0.15,
                'total_posts': 0.15,
                'neighbor_count': 0.10,
                'total_visitors': 0.10
            }

    def auto_train(self, min_samples: int = 50) -> Dict[str, Any]:
        """
        자동 학습 실행

        Args:
            min_samples: 최소 필요 샘플 수

        Returns:
            학습 결과
        """
        try:
            logger.info("자동 학습 시작...")

            # 데이터 로드
            X, y = self.load_training_data(min_samples)

            # 모델 학습
            result = self.train_model(X, y)

            # 가중치 저장
            model_id = self.save_weights(result)
            result["model_id"] = model_id

            logger.info(f"자동 학습 완료: Model ID {model_id}")
            return result

        except Exception as e:
            logger.error(f"자동 학습 오류: {e}", exc_info=True)
            raise


def get_ml_ranking_model() -> MLRankingModel:
    """MLRankingModel 인스턴스 반환"""
    return MLRankingModel()
