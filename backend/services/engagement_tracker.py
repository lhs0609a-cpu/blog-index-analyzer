"""
실시간 참여도 추적 시스템
일별 통계 수집 및 증감 추이 분석
"""
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta
from database.sqlite_db import get_sqlite_client
import json

logger = logging.getLogger(__name__)


class EngagementTracker:
    """참여도 추적기"""

    def __init__(self):
        self.db = get_sqlite_client()
        self._ensure_tables()

    def _ensure_tables(self):
        """필요한 테이블 생성"""
        with self.db.get_connection() as conn:
            cur = conn.cursor()

            # 일별 참여도 통계 테이블
            cur.execute("""
                CREATE TABLE IF NOT EXISTS daily_engagement (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    blog_id TEXT NOT NULL,
                    tracked_date DATE NOT NULL,
                    total_visitors INTEGER DEFAULT 0,
                    neighbor_count INTEGER DEFAULT 0,
                    total_posts INTEGER DEFAULT 0,
                    avg_likes INTEGER DEFAULT 0,
                    avg_comments INTEGER DEFAULT 0,
                    new_posts_count INTEGER DEFAULT 0,
                    engagement_score REAL DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(blog_id, tracked_date)
                )
            """)

            # 포스트별 참여도 추적 테이블
            cur.execute("""
                CREATE TABLE IF NOT EXISTS post_engagement (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    blog_id TEXT NOT NULL,
                    post_no TEXT NOT NULL,
                    post_url TEXT,
                    post_title TEXT,
                    tracked_date DATE NOT NULL,
                    views INTEGER DEFAULT 0,
                    likes INTEGER DEFAULT 0,
                    comments INTEGER DEFAULT 0,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(blog_id, post_no, tracked_date)
                )
            """)

            conn.commit()
            logger.info("[참여도 추적] 테이블 초기화 완료")

    def track_daily_engagement(self, blog_id: str, blog_stats: Dict[str, Any]) -> Dict[str, Any]:
        """
        일별 참여도 기록

        Args:
            blog_id: 블로그 ID
            blog_stats: 블로그 통계 정보

        Returns:
            저장된 참여도 정보
        """
        try:
            today = datetime.utcnow().date()

            # 참여도 점수 계산
            engagement_score = self._calculate_engagement_score(blog_stats)

            with self.db.get_connection() as conn:
                cur = conn.cursor()

                # 오늘 날짜 데이터 저장 (이미 있으면 업데이트)
                cur.execute("""
                    INSERT INTO daily_engagement
                    (blog_id, tracked_date, total_visitors, neighbor_count, total_posts,
                     avg_likes, avg_comments, new_posts_count, engagement_score)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(blog_id, tracked_date)
                    DO UPDATE SET
                        total_visitors = excluded.total_visitors,
                        neighbor_count = excluded.neighbor_count,
                        total_posts = excluded.total_posts,
                        avg_likes = excluded.avg_likes,
                        avg_comments = excluded.avg_comments,
                        new_posts_count = excluded.new_posts_count,
                        engagement_score = excluded.engagement_score
                """, (
                    blog_id,
                    today,
                    blog_stats.get('total_visitors', 0),
                    blog_stats.get('neighbor_count', 0),
                    blog_stats.get('total_posts', 0),
                    blog_stats.get('avg_likes', 0),
                    blog_stats.get('avg_comments', 0),
                    blog_stats.get('new_posts_count', 0),
                    engagement_score
                ))

                conn.commit()

            logger.info(f"[참여도 추적] 일별 기록 완료: {blog_id} - {today}, 점수: {engagement_score}")

            return {
                "blog_id": blog_id,
                "tracked_date": str(today),
                "engagement_score": engagement_score,
                "stats": blog_stats
            }

        except Exception as e:
            logger.error(f"[참여도 추적] 오류: {e}", exc_info=True)
            return {"error": str(e)}

    def _calculate_engagement_score(self, stats: Dict[str, Any]) -> float:
        """참여도 점수 계산"""
        try:
            visitors = stats.get('total_visitors', 0)
            neighbors = stats.get('neighbor_count', 0)
            avg_likes = stats.get('avg_likes', 0)
            avg_comments = stats.get('avg_comments', 0)
            new_posts = stats.get('new_posts_count', 0)

            # 가중 점수
            score = (
                (min(visitors / 1000, 100) * 0.3) +  # 방문자 (최대 10만 = 100점)
                (min(neighbors / 10, 100) * 0.2) +    # 이웃 (최대 1000 = 100점)
                (min(avg_likes * 2, 100) * 0.2) +     # 좋아요 (50개 = 100점)
                (min(avg_comments * 5, 100) * 0.2) +  # 댓글 (20개 = 100점)
                (min(new_posts * 10, 100) * 0.1)      # 신규 포스트 (10개 = 100점)
            )

            return round(score, 2)

        except Exception as e:
            logger.error(f"참여도 점수 계산 오류: {e}")
            return 0.0

    def get_engagement_trend(self, blog_id: str, days: int = 30) -> Dict[str, Any]:
        """
        참여도 추이 조회

        Args:
            blog_id: 블로그 ID
            days: 조회할 일수 (기본 30일)

        Returns:
            일별 추이 데이터
        """
        try:
            with self.db.get_connection() as conn:
                cur = conn.cursor()

                # 최근 N일 데이터 조회
                end_date = datetime.utcnow().date()
                start_date = end_date - timedelta(days=days)

                cur.execute("""
                    SELECT
                        tracked_date,
                        total_visitors,
                        neighbor_count,
                        total_posts,
                        avg_likes,
                        avg_comments,
                        new_posts_count,
                        engagement_score
                    FROM daily_engagement
                    WHERE blog_id = ? AND tracked_date BETWEEN ? AND ?
                    ORDER BY tracked_date ASC
                """, (blog_id, start_date, end_date))

                rows = cur.fetchall()

                # 데이터 변환
                trend_data = []
                for row in rows:
                    trend_data.append({
                        "date": row['tracked_date'],
                        "visitors": row['total_visitors'],
                        "neighbors": row['neighbor_count'],
                        "posts": row['total_posts'],
                        "avg_likes": row['avg_likes'],
                        "avg_comments": row['avg_comments'],
                        "new_posts": row['new_posts_count'],
                        "engagement_score": row['engagement_score']
                    })

                # 통계 계산
                stats = self._calculate_trend_stats(trend_data)

                return {
                    "blog_id": blog_id,
                    "period_days": days,
                    "data_points": len(trend_data),
                    "trend_data": trend_data,
                    "statistics": stats
                }

        except Exception as e:
            logger.error(f"[참여도 추이 조회] 오류: {e}", exc_info=True)
            return {"error": str(e), "trend_data": []}

    def _calculate_trend_stats(self, trend_data: List[Dict]) -> Dict[str, Any]:
        """추이 통계 계산"""
        try:
            if not trend_data:
                return {}

            # 평균
            avg_visitors = sum(d['visitors'] for d in trend_data) / len(trend_data)
            avg_engagement = sum(d['engagement_score'] for d in trend_data) / len(trend_data)

            # 증감률 (첫날 대비 마지막날)
            if len(trend_data) >= 2:
                first_day = trend_data[0]
                last_day = trend_data[-1]

                visitor_change = ((last_day['visitors'] - first_day['visitors']) / first_day['visitors'] * 100) if first_day['visitors'] > 0 else 0
                neighbor_change = ((last_day['neighbors'] - first_day['neighbors']) / first_day['neighbors'] * 100) if first_day['neighbors'] > 0 else 0
                engagement_change = ((last_day['engagement_score'] - first_day['engagement_score']) / first_day['engagement_score'] * 100) if first_day['engagement_score'] > 0 else 0
            else:
                visitor_change = 0
                neighbor_change = 0
                engagement_change = 0

            # 최고/최저
            max_visitors_day = max(trend_data, key=lambda x: x['visitors'])
            min_visitors_day = min(trend_data, key=lambda x: x['visitors'])

            return {
                "average_visitors": round(avg_visitors, 1),
                "average_engagement_score": round(avg_engagement, 2),
                "visitor_change_percent": round(visitor_change, 1),
                "neighbor_change_percent": round(neighbor_change, 1),
                "engagement_change_percent": round(engagement_change, 1),
                "max_visitors": {
                    "date": max_visitors_day['date'],
                    "count": max_visitors_day['visitors']
                },
                "min_visitors": {
                    "date": min_visitors_day['date'],
                    "count": min_visitors_day['visitors']
                },
                "trend_direction": self._get_trend_direction(engagement_change)
            }

        except Exception as e:
            logger.error(f"추이 통계 계산 오류: {e}")
            return {}

    def _get_trend_direction(self, change_percent: float) -> str:
        """추세 방향 판단"""
        if change_percent > 10:
            return "급상승"
        elif change_percent > 5:
            return "상승"
        elif change_percent > -5:
            return "안정"
        elif change_percent > -10:
            return "하락"
        else:
            return "급하락"

    def track_post_engagement(self, blog_id: str, post_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        개별 포스트 참여도 기록

        Args:
            blog_id: 블로그 ID
            post_data: 포스트 정보

        Returns:
            저장 결과
        """
        try:
            today = datetime.utcnow().date()

            with self.db.get_connection() as conn:
                cur = conn.cursor()

                cur.execute("""
                    INSERT INTO post_engagement
                    (blog_id, post_no, post_url, post_title, tracked_date, views, likes, comments)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(blog_id, post_no, tracked_date)
                    DO UPDATE SET
                        views = excluded.views,
                        likes = excluded.likes,
                        comments = excluded.comments
                """, (
                    blog_id,
                    post_data.get('post_no'),
                    post_data.get('post_url'),
                    post_data.get('title'),
                    today,
                    post_data.get('views', 0),
                    post_data.get('likes', 0),
                    post_data.get('comments', 0)
                ))

                conn.commit()

            logger.info(f"[포스트 참여도] 기록 완료: {blog_id}/{post_data.get('post_no')}")

            return {"success": True, "blog_id": blog_id, "post_no": post_data.get('post_no')}

        except Exception as e:
            logger.error(f"[포스트 참여도] 오류: {e}", exc_info=True)
            return {"error": str(e)}

    def get_post_engagement_history(self, blog_id: str, post_no: str, days: int = 30) -> Dict[str, Any]:
        """포스트별 참여도 이력 조회"""
        try:
            with self.db.get_connection() as conn:
                cur = conn.cursor()

                end_date = datetime.utcnow().date()
                start_date = end_date - timedelta(days=days)

                cur.execute("""
                    SELECT
                        tracked_date,
                        views,
                        likes,
                        comments,
                        post_title,
                        post_url
                    FROM post_engagement
                    WHERE blog_id = ? AND post_no = ? AND tracked_date BETWEEN ? AND ?
                    ORDER BY tracked_date ASC
                """, (blog_id, post_no, start_date, end_date))

                rows = cur.fetchall()

                history_data = []
                for row in rows:
                    history_data.append({
                        "date": row['tracked_date'],
                        "views": row['views'],
                        "likes": row['likes'],
                        "comments": row['comments']
                    })

                # 증감 계산
                growth_stats = {}
                if len(history_data) >= 2:
                    first = history_data[0]
                    last = history_data[-1]

                    growth_stats = {
                        "views_growth": last['views'] - first['views'],
                        "likes_growth": last['likes'] - first['likes'],
                        "comments_growth": last['comments'] - first['comments']
                    }

                return {
                    "blog_id": blog_id,
                    "post_no": post_no,
                    "post_title": rows[0]['post_title'] if rows else "",
                    "history": history_data,
                    "growth_stats": growth_stats
                }

        except Exception as e:
            logger.error(f"[포스트 이력 조회] 오류: {e}", exc_info=True)
            return {"error": str(e), "history": []}

    def compare_engagement(self, blog_id: str, compare_days: int = 7) -> Dict[str, Any]:
        """
        기간별 참여도 비교

        Args:
            blog_id: 블로그 ID
            compare_days: 비교 기간 (기본 7일)

        Returns:
            비교 결과
        """
        try:
            with self.db.get_connection() as conn:
                cur = conn.cursor()

                today = datetime.utcnow().date()

                # 최근 N일
                recent_start = today - timedelta(days=compare_days)
                cur.execute("""
                    SELECT AVG(total_visitors) as avg_visitors,
                           AVG(engagement_score) as avg_engagement,
                           SUM(new_posts_count) as total_new_posts
                    FROM daily_engagement
                    WHERE blog_id = ? AND tracked_date BETWEEN ? AND ?
                """, (blog_id, recent_start, today))

                recent = cur.fetchone()

                # 이전 N일
                previous_end = recent_start - timedelta(days=1)
                previous_start = previous_end - timedelta(days=compare_days)
                cur.execute("""
                    SELECT AVG(total_visitors) as avg_visitors,
                           AVG(engagement_score) as avg_engagement,
                           SUM(new_posts_count) as total_new_posts
                    FROM daily_engagement
                    WHERE blog_id = ? AND tracked_date BETWEEN ? AND ?
                """, (blog_id, previous_start, previous_end))

                previous = cur.fetchone()

                # 비교
                if recent and previous:
                    visitor_change = ((recent['avg_visitors'] - previous['avg_visitors']) / previous['avg_visitors'] * 100) if previous['avg_visitors'] > 0 else 0
                    engagement_change = ((recent['avg_engagement'] - previous['avg_engagement']) / previous['avg_engagement'] * 100) if previous['avg_engagement'] > 0 else 0

                    return {
                        "comparison_period_days": compare_days,
                        "recent_period": {
                            "avg_visitors": round(recent['avg_visitors'] or 0, 1),
                            "avg_engagement": round(recent['avg_engagement'] or 0, 2),
                            "new_posts": recent['total_new_posts'] or 0
                        },
                        "previous_period": {
                            "avg_visitors": round(previous['avg_visitors'] or 0, 1),
                            "avg_engagement": round(previous['avg_engagement'] or 0, 2),
                            "new_posts": previous['total_new_posts'] or 0
                        },
                        "changes": {
                            "visitor_change_percent": round(visitor_change, 1),
                            "engagement_change_percent": round(engagement_change, 1),
                            "trend": "개선" if engagement_change > 0 else "악화"
                        }
                    }
                else:
                    return {"message": "비교할 데이터가 부족합니다"}

        except Exception as e:
            logger.error(f"[참여도 비교] 오류: {e}", exc_info=True)
            return {"error": str(e)}


def get_engagement_tracker() -> EngagementTracker:
    """참여도 추적기 인스턴스 반환"""
    return EngagementTracker()
