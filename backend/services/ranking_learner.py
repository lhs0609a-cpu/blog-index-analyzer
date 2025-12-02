"""
순위 학습 시스템 - 네이버 실제 순위와 예측 순위 비교
"""
import logging
from typing import Dict, Any, List
from datetime import datetime
from database.sqlite_db import get_sqlite_client

logger = logging.getLogger(__name__)


class RankingLearner:
    """순위 학습 및 데이터 수집 서비스"""

    def __init__(self):
        self.db = get_sqlite_client()

    def record_ranking_data(self, keyword: str, search_results: List[Dict[str, Any]]):
        """
        검색 결과의 실제 순위와 예측 순위를 기록

        Args:
            keyword: 검색 키워드
            search_results: 검색 결과 리스트
        """
        try:
            logger.info(f"순위 학습 데이터 기록 시작: {keyword}, {len(search_results)}개 블로그")

            for idx, result in enumerate(search_results):
                # 실제 순위 (네이버)
                actual_rank = idx + 1
                actual_tab_type = result.get('tab_type', 'BLOG')

                # 블로그 정보
                blog_id = result.get('blog_id')
                blog_name = result.get('blog_name')

                # 점수 정보
                index_data = result.get('index', {})
                stats_data = result.get('stats', {})
                blog_data = result.get('blog', {})

                c_rank_score = None
                dia_score = None
                total_score = index_data.get('total_score', 0)

                # score_breakdown에서 C-Rank와 DIA 추출
                breakdown = index_data.get('score_breakdown', {})
                if breakdown:
                    c_rank_score = breakdown.get('c_rank') or breakdown.get('trust', 0)
                    dia_score = breakdown.get('dia') or breakdown.get('content', 0)

                # C-Rank 구성 요소
                blog_age_days = blog_data.get('blog_age_days', 0)
                total_posts = stats_data.get('total_posts', 0)
                neighbor_count = stats_data.get('neighbor_count', 0)
                total_visitors = stats_data.get('total_visitors', 0)

                # C-Rank로 예측 순위 계산 (단순 점수 기반)
                predicted_rank = self._predict_rank_by_score(c_rank_score, search_results)

                # 순위 차이
                rank_difference = predicted_rank - actual_rank

                # 데이터베이스에 저장
                with self.db.get_connection() as conn:
                    cur = conn.cursor()
                    cur.execute("""
                        INSERT INTO ranking_learning_data
                        (keyword, search_date, blog_id, blog_name,
                         actual_rank, actual_tab_type, predicted_rank,
                         c_rank_score, dia_score, total_score,
                         blog_age_days, total_posts, neighbor_count, total_visitors,
                         rank_difference)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        keyword,
                        datetime.utcnow(),
                        blog_id,
                        blog_name,
                        actual_rank,
                        actual_tab_type,
                        predicted_rank,
                        c_rank_score,
                        dia_score,
                        total_score,
                        blog_age_days,
                        total_posts,
                        neighbor_count,
                        total_visitors,
                        rank_difference
                    ))

            logger.info(f"순위 학습 데이터 기록 완료: {len(search_results)}개")

        except Exception as e:
            logger.error(f"순위 학습 데이터 기록 오류: {e}", exc_info=True)

    def _predict_rank_by_score(self, score: float, all_results: List[Dict[str, Any]]) -> int:
        """
        C-Rank 점수로 예측 순위 계산

        Args:
            score: 비교할 C-Rank 점수
            all_results: 전체 검색 결과

        Returns:
            예측 순위
        """
        if score is None:
            return len(all_results)  # 점수 없으면 최하위

        # 점수가 더 높은 블로그 개수 세기
        better_count = 0
        for result in all_results:
            index_data = result.get('index', {})
            breakdown = index_data.get('score_breakdown', {})
            other_score = breakdown.get('c_rank') or breakdown.get('trust', 0)

            if other_score and other_score > score:
                better_count += 1

        return better_count + 1

    def get_learning_stats(self) -> Dict[str, Any]:
        """학습 데이터 통계 조회"""
        try:
            with self.db.get_connection() as conn:
                cur = conn.cursor()

                # 전체 데이터 개수
                cur.execute("SELECT COUNT(*) FROM ranking_learning_data")
                total_count = cur.fetchone()[0]

                # 평균 순위 차이
                cur.execute("SELECT AVG(ABS(rank_difference)) FROM ranking_learning_data")
                avg_diff = cur.fetchone()[0] or 0

                # 최근 데이터 개수 (1주일)
                cur.execute("""
                    SELECT COUNT(*) FROM ranking_learning_data
                    WHERE search_date >= datetime('now', '-7 days')
                """)
                recent_count = cur.fetchone()[0]

                # 키워드별 데이터 개수
                cur.execute("""
                    SELECT keyword, COUNT(*) as cnt
                    FROM ranking_learning_data
                    GROUP BY keyword
                    ORDER BY cnt DESC
                    LIMIT 10
                """)
                top_keywords = [{"keyword": row[0], "count": row[1]} for row in cur.fetchall()]

                return {
                    "total_samples": total_count,
                    "avg_rank_difference": round(avg_diff, 2),
                    "recent_samples": recent_count,
                    "top_keywords": top_keywords
                }

        except Exception as e:
            logger.error(f"학습 통계 조회 오류: {e}", exc_info=True)
            return {
                "total_samples": 0,
                "avg_rank_difference": 0,
                "recent_samples": 0,
                "top_keywords": []
            }


def get_ranking_learner() -> RankingLearner:
    """RankingLearner 인스턴스 반환"""
    return RankingLearner()
