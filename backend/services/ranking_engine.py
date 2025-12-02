"""
네이버 블로그 순위 분석 엔진
실제 검색 순위와 블로그 품질을 종합 분석
"""
import logging
from typing import Dict, Any, List
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)


class BlogRankingEngine:
    """블로그 순위 분석 엔진"""

    def __init__(self):
        # 네이버 검색 순위 결정 요인 가중치
        self.weights = {
            "search_position": 40,  # 검색 결과 위치 (가장 중요)
            "post_count": 12,        # 포스트 개수
            "neighbor_count": 8,     # 이웃 수
            "visitor_count": 12,     # 방문자 수
            "posting_frequency": 8,  # 포스팅 주기
            "engagement": 8,         # 참여도 (댓글, 좋아요)
            "blog_age": 12           # 블로그 운영 기간 (신뢰도)
        }

    def calculate_search_rank_score(self, search_position: int, total_results: int) -> Dict[str, Any]:
        """
        검색 순위 기반 점수 계산

        Args:
            search_position: 검색 결과에서의 위치 (1위, 2위, ...)
            total_results: 전체 검색 결과 개수

        Returns:
            검색 순위 점수 및 분석
        """
        # 1위는 100점, 10위는 55점 정도로 차등
        if search_position <= 3:
            position_score = 100 - (search_position - 1) * 5
        elif search_position <= 5:
            position_score = 85 - (search_position - 4) * 8
        elif search_position <= 10:
            position_score = 70 - (search_position - 6) * 3
        else:
            position_score = max(40, 55 - (search_position - 10) * 2)

        # 상위 퍼센트 계산
        percentile = ((total_results - search_position) / total_results) * 100 if total_results > 0 else 0

        return {
            "search_position": search_position,
            "position_score": round(position_score, 2),
            "percentile": round(percentile, 2),
            "tier": self._get_tier(search_position)
        }

    def calculate_blog_quality_score(self, blog_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        블로그 품질 점수 계산

        Args:
            blog_data: 블로그 통계 데이터

        Returns:
            품질 점수 및 세부 분석
        """
        scores = {}

        # 1. 포스트 개수 점수 (0-100)
        post_count = blog_data.get("total_posts", 0)
        if post_count >= 500:
            scores["post_count"] = 100
        elif post_count >= 300:
            scores["post_count"] = 85 + (post_count - 300) / 200 * 15
        elif post_count >= 100:
            scores["post_count"] = 70 + (post_count - 100) / 200 * 15
        elif post_count >= 50:
            scores["post_count"] = 50 + (post_count - 50) / 50 * 20
        else:
            scores["post_count"] = post_count / 50 * 50

        # 2. 이웃 수 점수 (0-100)
        neighbor_count = blog_data.get("neighbor_count", 0)
        if neighbor_count >= 1000:
            scores["neighbor_count"] = 100
        elif neighbor_count >= 500:
            scores["neighbor_count"] = 85 + (neighbor_count - 500) / 500 * 15
        elif neighbor_count >= 100:
            scores["neighbor_count"] = 70 + (neighbor_count - 100) / 400 * 15
        elif neighbor_count >= 50:
            scores["neighbor_count"] = 50 + (neighbor_count - 50) / 50 * 20
        else:
            scores["neighbor_count"] = neighbor_count / 50 * 50

        # 3. 방문자 수 점수 (0-100)
        total_visitors = blog_data.get("total_visitors", 0)
        if total_visitors >= 100000:
            scores["visitor_count"] = 100
        elif total_visitors >= 50000:
            scores["visitor_count"] = 85 + (total_visitors - 50000) / 50000 * 15
        elif total_visitors >= 10000:
            scores["visitor_count"] = 70 + (total_visitors - 10000) / 40000 * 15
        elif total_visitors >= 5000:
            scores["visitor_count"] = 50 + (total_visitors - 5000) / 5000 * 20
        else:
            scores["visitor_count"] = total_visitors / 5000 * 50

        # 4. 포스팅 주기 점수 (최근 활동성)
        # RSS 데이터에서 최근 포스트 날짜 분석
        posting_frequency_score = self._calculate_posting_frequency(blog_data.get("posts", []))
        scores["posting_frequency"] = posting_frequency_score

        # 5. 참여도 점수 (댓글, 좋아요 등)
        post_stats = blog_data.get("post_stats", {})
        avg_comments = post_stats.get("avg_comments", 0)
        avg_likes = post_stats.get("avg_likes", 0)
        engagement_score = min(100, (avg_comments * 3 + avg_likes * 2))
        scores["engagement"] = engagement_score

        # 6. 블로그 운영 기간 점수 (신뢰도 및 권위)
        blog_age_days = blog_data.get("blog_age_days", 0)
        blog_age_score = self._calculate_blog_age_score(blog_age_days)
        scores["blog_age"] = blog_age_score

        # 가중 평균 계산
        total_score = (
            scores["post_count"] * 0.20 +
            scores["neighbor_count"] * 0.15 +
            scores["visitor_count"] * 0.20 +
            scores["posting_frequency"] * 0.15 +
            scores["engagement"] * 0.15 +
            scores["blog_age"] * 0.15
        )

        return {
            "total_score": round(total_score, 2),
            "breakdown": {
                "post_count": round(scores["post_count"], 2),
                "neighbor_count": round(scores["neighbor_count"], 2),
                "visitor_count": round(scores["visitor_count"], 2),
                "posting_frequency": round(scores["posting_frequency"], 2),
                "engagement": round(scores["engagement"], 2),
                "blog_age": round(scores["blog_age"], 2)
            },
            "grade": self._get_quality_grade(total_score)
        }

    def calculate_combined_rank(self, search_rank_data: Dict[str, Any],
                               quality_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        검색 순위와 품질 점수를 결합한 최종 순위

        Args:
            search_rank_data: 검색 순위 데이터
            quality_data: 품질 점수 데이터

        Returns:
            최종 순위 분석
        """
        # 검색 순위 60%, 품질 40% 비중
        combined_score = (
            search_rank_data["position_score"] * 0.6 +
            quality_data["total_score"] * 0.4
        )

        return {
            "combined_score": round(combined_score, 2),
            "search_weight": 60,
            "quality_weight": 40,
            "final_grade": self._get_combined_grade(combined_score),
            "explanation": self._generate_explanation(search_rank_data, quality_data)
        }

    def _calculate_posting_frequency(self, posts: List[Dict[str, Any]]) -> float:
        """포스팅 주기 점수 계산"""
        if not posts or len(posts) < 2:
            return 30  # 최소 점수

        try:
            # 최근 포스트 날짜들 파싱
            dates = []
            for post in posts[:20]:  # 최근 20개만
                try:
                    date_str = post.get("date", "")
                    if date_str:
                        date = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                        dates.append(date)
                except (ValueError, KeyError, AttributeError) as e:
                    logger.debug(f"Failed to parse post date: {e}")
                    continue

            if len(dates) < 2:
                return 30

            dates.sort(reverse=True)  # 최신순 정렬

            # 최근 포스트가 얼마나 최신인지
            days_since_last = (datetime.now(dates[0].tzinfo) - dates[0]).days
            if days_since_last <= 3:
                recency_score = 50
            elif days_since_last <= 7:
                recency_score = 40
            elif days_since_last <= 30:
                recency_score = 30
            elif days_since_last <= 90:
                recency_score = 20
            else:
                recency_score = 10

            # 포스팅 간격 일관성
            if len(dates) >= 5:
                intervals = []
                for i in range(len(dates) - 1):
                    interval = (dates[i] - dates[i+1]).days
                    intervals.append(interval)

                avg_interval = sum(intervals) / len(intervals)

                if avg_interval <= 3:  # 3일에 1번 이상
                    consistency_score = 50
                elif avg_interval <= 7:  # 주 1회
                    consistency_score = 40
                elif avg_interval <= 14:  # 2주에 1번
                    consistency_score = 30
                elif avg_interval <= 30:  # 월 1회
                    consistency_score = 20
                else:
                    consistency_score = 10
            else:
                consistency_score = 20

            return recency_score + consistency_score

        except Exception as e:
            logger.error(f"포스팅 주기 계산 오류: {e}")
            return 30

    def _calculate_blog_age_score(self, blog_age_days: int) -> float:
        """
        블로그 운영 기간 점수 계산 (0-100)

        오래된 블로그일수록 신뢰도와 권위가 높음
        - 5년 이상: 100점
        - 3년 이상: 85-100점
        - 2년 이상: 70-85점
        - 1년 이상: 55-70점
        - 6개월 이상: 40-55점
        - 6개월 미만: 20-40점
        """
        try:
            if blog_age_days <= 0:
                return 20  # 개설일 정보 없음

            # 년 단위로 변환
            years = blog_age_days / 365.0

            if years >= 5:
                # 5년 이상 - 최고 신뢰도
                score = 100
            elif years >= 3:
                # 3-5년 - 매우 높은 신뢰도
                score = 85 + (years - 3) / 2 * 15
            elif years >= 2:
                # 2-3년 - 높은 신뢰도
                score = 70 + (years - 2) * 15
            elif years >= 1:
                # 1-2년 - 중간 신뢰도
                score = 55 + (years - 1) * 15
            elif years >= 0.5:
                # 6개월-1년 - 낮은 신뢰도
                score = 40 + (years - 0.5) / 0.5 * 15
            else:
                # 6개월 미만 - 매우 낮은 신뢰도
                score = 20 + years / 0.5 * 20

            return min(100, max(20, score))

        except Exception as e:
            logger.error(f"블로그 운영 기간 점수 계산 오류: {e}")
            return 20

    def _get_tier(self, position: int) -> str:
        """검색 순위 티어"""
        if position == 1:
            return "S+ (1위)"
        elif position <= 3:
            return "S (TOP 3)"
        elif position <= 5:
            return "A (TOP 5)"
        elif position <= 10:
            return "B (TOP 10)"
        elif position <= 20:
            return "C (TOP 20)"
        else:
            return "D (20위 이하)"

    def _get_quality_grade(self, score: float) -> str:
        """품질 점수 등급"""
        if score >= 90:
            return "최우수"
        elif score >= 80:
            return "우수"
        elif score >= 70:
            return "양호"
        elif score >= 60:
            return "보통"
        elif score >= 50:
            return "미흡"
        else:
            return "개선 필요"

    def _get_combined_grade(self, score: float) -> str:
        """최종 등급"""
        if score >= 95:
            return "SSS급 (최상위)"
        elif score >= 90:
            return "SS급 (매우 우수)"
        elif score >= 85:
            return "S급 (우수)"
        elif score >= 80:
            return "A+급 (상위)"
        elif score >= 75:
            return "A급 (중상위)"
        elif score >= 70:
            return "B+급 (중위)"
        elif score >= 65:
            return "B급 (평균)"
        elif score >= 60:
            return "C+급 (중하위)"
        else:
            return "C급 (하위)"

    def _generate_explanation(self, search_rank_data: Dict[str, Any],
                             quality_data: Dict[str, Any]) -> str:
        """순위 분석 설명 생성"""
        position = search_rank_data["search_position"]
        position_score = search_rank_data["position_score"]
        quality_score = quality_data["total_score"]

        explanation = f"검색 결과 {position}위 (검색순위점수: {position_score:.1f}점). "

        if quality_score >= 80:
            explanation += f"블로그 품질이 매우 우수합니다({quality_score:.1f}점). "
        elif quality_score >= 70:
            explanation += f"블로그 품질이 양호합니다({quality_score:.1f}점). "
        elif quality_score >= 60:
            explanation += f"블로그 품질이 보통 수준입니다({quality_score:.1f}점). "
        else:
            explanation += f"블로그 품질 개선이 필요합니다({quality_score:.1f}점). "

        # 약점 파악
        breakdown = quality_data["breakdown"]
        weak_points = []
        if breakdown["post_count"] < 50:
            weak_points.append("포스트 수 증가")
        if breakdown["neighbor_count"] < 50:
            weak_points.append("이웃 확보")
        if breakdown["visitor_count"] < 50:
            weak_points.append("방문자 유입")
        if breakdown["posting_frequency"] < 50:
            weak_points.append("꾸준한 포스팅")

        if weak_points:
            explanation += f"개선 포인트: {', '.join(weak_points)}."

        return explanation


def get_ranking_engine() -> BlogRankingEngine:
    """순위 엔진 인스턴스 반환"""
    return BlogRankingEngine()
