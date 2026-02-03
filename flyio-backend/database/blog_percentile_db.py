"""
블로그 백분위 계산을 위한 데이터베이스
분석된 모든 블로그 점수를 저장하고 실제 백분위를 계산
"""
import sqlite3
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Tuple
import logging
import os
import random

logger = logging.getLogger(__name__)

# Database path
import sys
if sys.platform == "win32":
    _default_path = os.path.join(os.path.dirname(__file__), "..", "data", "blog_percentile.db")
else:
    _default_path = "/data/blog_percentile.db"
PERCENTILE_DB_PATH = os.environ.get("PERCENTILE_DB_PATH", _default_path)


class BlogPercentileDB:
    """블로그 백분위 데이터베이스"""

    def __init__(self, db_path: str = PERCENTILE_DB_PATH):
        self.db_path = db_path
        self._ensure_db_exists()
        self._init_tables()
        self._seed_initial_data()

    def _ensure_db_exists(self):
        """DB 디렉토리 생성"""
        db_dir = os.path.dirname(self.db_path)
        if db_dir and not os.path.exists(db_dir):
            try:
                os.makedirs(db_dir, exist_ok=True)
            except Exception as e:
                logger.warning(f"Could not create db directory: {e}")

    def _get_connection(self):
        """DB 연결"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_tables(self):
        """테이블 초기화"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            # 블로그 점수 테이블 - 실제 분석된 블로그 저장
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS blog_scores (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    blog_id TEXT UNIQUE NOT NULL,
                    total_score REAL NOT NULL,
                    level INTEGER,
                    is_seed INTEGER DEFAULT 0,
                    analyzed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # 점수 분포 캐시 테이블 - 빠른 백분위 계산용
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS score_distribution (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    score_bucket INTEGER NOT NULL,
                    count INTEGER DEFAULT 0,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(score_bucket)
                )
            """)

            # 통계 테이블
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS percentile_stats (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    stat_key TEXT UNIQUE NOT NULL,
                    stat_value REAL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # 인덱스 생성
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_blog_scores_score ON blog_scores(total_score)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_blog_scores_blog_id ON blog_scores(blog_id)")

            conn.commit()
            logger.info("Blog percentile tables initialized")
        finally:
            conn.close()

    def _seed_initial_data(self):
        """초기 데이터 시드 - 현실적인 네이버 블로그 점수 분포

        실제 블로그 분석 결과 기준:
        - 일반/신규 블로그: 25-45점
        - 활성 블로그: 45-55점
        - 준최적화 블로그: 55-65점 (Lv.4-6)
        - 최적화 블로그: 65-75점 (Lv.7-9)
        - 인플루언서급: 75-85점 (Lv.10-12)
        - 파워블로거: 85점 이상 (Lv.13+)
        """
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            # 시드 데이터 버전 확인 (v2로 업그레이드 필요 시 리셋)
            # 버전: 1.0 = 초기, 2.0 = 현실적 분포 (상향 조정)
            SEED_VERSION = 2.0

            cursor.execute("""
                SELECT stat_value FROM percentile_stats WHERE stat_key = 'seed_version'
            """)
            version_row = cursor.fetchone()
            current_version = version_row['stat_value'] if version_row else None

            if current_version and current_version >= SEED_VERSION:
                # 이미 최신 버전 시드 데이터가 있음
                cursor.execute("SELECT COUNT(*) as cnt FROM blog_scores WHERE is_seed = 1")
                row = cursor.fetchone()
                if row and row['cnt'] > 1000:
                    return

            # 버전이 낮거나 없으면 기존 시드 삭제 후 재생성
            if current_version and current_version < SEED_VERSION:
                logger.info(f"Upgrading seed data from v{current_version} to v{SEED_VERSION}")
                cursor.execute("DELETE FROM blog_scores WHERE is_seed = 1")
                cursor.execute("DELETE FROM score_distribution")
                conn.commit()

            logger.info(f"Seeding initial blog score distribution ({SEED_VERSION})...")

            # 네이버 블로그 점수 분포 시뮬레이션 (상향 조정)
            # 실제 분석에서 45-55점이 일반적으로 나오므로 이를 중앙값으로 설정
            #
            # 점수 분포 (100,000개 블로그 기준):
            # - 10-25점: 3% (방치/신규 블로그)
            # - 25-35점: 10% (초보 블로그)
            # - 35-45점: 20% (입문 블로그)
            # - 45-55점: 30% (일반 활성 블로그) ← 중앙값
            # - 55-65점: 20% (준최적화 블로그)
            # - 65-75점: 10% (최적화 블로그)
            # - 75-85점: 5% (인플루언서급)
            # - 85-95점: 1.5% (파워블로거)
            # - 95-100점: 0.5% (최상위)

            distribution = [
                (10, 25, 3000),     # 3% - 방치/신규
                (25, 35, 10000),    # 10% - 초보
                (35, 45, 20000),    # 20% - 입문
                (45, 55, 30000),    # 30% - 일반 활성 (중앙)
                (55, 65, 20000),    # 20% - 준최적화
                (65, 75, 10000),    # 10% - 최적화
                (75, 85, 5000),     # 5% - 인플루언서급
                (85, 95, 1500),     # 1.5% - 파워블로거
                (95, 100, 500),     # 0.5% - 최상위
            ]

            seed_data = []
            for min_score, max_score, count in distribution:
                for i in range(count):
                    # 각 범위 내에서 정규 분포에 가깝게 점수 생성
                    mid = (min_score + max_score) / 2
                    std = (max_score - min_score) / 4
                    score = random.gauss(mid, std)
                    score = max(min_score, min(max_score - 0.1, score))

                    # 가상 블로그 ID
                    fake_blog_id = f"seed_blog_{min_score}_{i}"
                    seed_data.append((fake_blog_id, round(score, 1), 1))

            # 배치 삽입
            cursor.executemany("""
                INSERT OR IGNORE INTO blog_scores (blog_id, total_score, is_seed)
                VALUES (?, ?, ?)
            """, seed_data)

            # 점수 분포 캐시 업데이트
            self._update_distribution_cache(cursor)

            # 시드 버전 저장
            cursor.execute("""
                INSERT OR REPLACE INTO percentile_stats (stat_key, stat_value, updated_at)
                VALUES ('seed_version', ?, CURRENT_TIMESTAMP)
            """, (SEED_VERSION,))

            conn.commit()
            logger.info(f"Seeded {len(seed_data)} blog scores ({SEED_VERSION})")
        except Exception as e:
            logger.error(f"Error seeding data: {e}")
            conn.rollback()
        finally:
            conn.close()

    def _update_distribution_cache(self, cursor=None):
        """점수 분포 캐시 업데이트"""
        close_conn = False
        if cursor is None:
            conn = self._get_connection()
            cursor = conn.cursor()
            close_conn = True

        try:
            # 점수대별 카운트 계산 (0-100, 1점 단위)
            cursor.execute("""
                DELETE FROM score_distribution
            """)

            cursor.execute("""
                INSERT INTO score_distribution (score_bucket, count)
                SELECT CAST(total_score AS INTEGER) as bucket, COUNT(*) as cnt
                FROM blog_scores
                GROUP BY bucket
            """)

            # 통계 업데이트
            cursor.execute("""
                SELECT
                    COUNT(*) as total,
                    AVG(total_score) as avg_score,
                    MIN(total_score) as min_score,
                    MAX(total_score) as max_score
                FROM blog_scores
            """)
            row = cursor.fetchone()

            if row:
                stats = [
                    ('total_blogs', row['total']),
                    ('avg_score', row['avg_score']),
                    ('min_score', row['min_score']),
                    ('max_score', row['max_score'])
                ]

                for key, value in stats:
                    cursor.execute("""
                        INSERT OR REPLACE INTO percentile_stats (stat_key, stat_value, updated_at)
                        VALUES (?, ?, CURRENT_TIMESTAMP)
                    """, (key, value))

            if close_conn:
                conn.commit()
        finally:
            if close_conn:
                conn.close()

    def add_blog_score(self, blog_id: str, total_score: float, level: int = None) -> bool:
        """블로그 점수 추가/업데이트"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            cursor.execute("""
                INSERT INTO blog_scores (blog_id, total_score, level, is_seed, updated_at)
                VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)
                ON CONFLICT(blog_id) DO UPDATE SET
                    total_score = ?,
                    level = ?,
                    is_seed = 0,
                    updated_at = CURRENT_TIMESTAMP
            """, (blog_id, total_score, level, total_score, level))

            conn.commit()
            return True
        except Exception as e:
            logger.error(f"Error adding blog score: {e}")
            return False
        finally:
            conn.close()

    def get_percentile(self, total_score: float) -> float:
        """주어진 점수의 백분위 계산 (0-100)

        백분위 = (이 점수보다 낮은 블로그 수 / 전체 블로그 수) * 100
        """
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            # 이 점수보다 낮은 블로그 수
            cursor.execute("""
                SELECT COUNT(*) as cnt FROM blog_scores
                WHERE total_score < ?
            """, (total_score,))
            lower_count = cursor.fetchone()['cnt']

            # 전체 블로그 수
            cursor.execute("SELECT COUNT(*) as cnt FROM blog_scores")
            total_count = cursor.fetchone()['cnt']

            if total_count == 0:
                return 50.0  # 데이터 없으면 중간값

            percentile = (lower_count / total_count) * 100
            return round(percentile, 1)
        finally:
            conn.close()

    def get_percentile_fast(self, total_score: float) -> float:
        """캐시를 사용한 빠른 백분위 계산"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            score_bucket = int(total_score)

            # 이 점수 버킷보다 낮은 모든 버킷의 합
            cursor.execute("""
                SELECT COALESCE(SUM(count), 0) as lower_count
                FROM score_distribution
                WHERE score_bucket < ?
            """, (score_bucket,))
            lower_count = cursor.fetchone()['lower_count']

            # 전체 합
            cursor.execute("SELECT COALESCE(SUM(count), 0) as total FROM score_distribution")
            total_count = cursor.fetchone()['total']

            if total_count == 0:
                return 50.0

            percentile = (lower_count / total_count) * 100
            return round(percentile, 1)
        finally:
            conn.close()

    def get_level_from_percentile(self, percentile: float) -> Tuple[int, str]:
        """백분위 기반 레벨 계산 (v2 - 현실적 기준)

        네이버 블로그 지수 기준 (실제 분포 반영):
        - 준최적화 블로그 (55-65점) = Lv.4-6
        - 최적화 블로그 (65-75점) = Lv.7-9
        - 인플루언서급 (75-85점) = Lv.10-12
        - 파워블로거 (85점+) = Lv.13-15

        상위 0.1% = Level 15 (마스터) - 최상위 파워블로거
        상위 0.5% = Level 14 (그랜드마스터)
        상위 1.5% = Level 13 (챌린저)
        상위 3% = Level 12 (다이아몬드) - 인플루언서
        상위 5% = Level 11 (플래티넘)
        상위 8% = Level 10 (골드)
        상위 12% = Level 9 (실버) - 최적화 블로그
        상위 17% = Level 8 (브론즈)
        상위 25% = Level 7 (아이언)
        상위 37% = Level 6 (성장기) - 준최적화 블로그
        상위 50% = Level 5 (입문)
        상위 63% = Level 4 (초보) - 일반 활성 블로그
        상위 80% = Level 3 (뉴비)
        상위 95% = Level 2 (스타터)
        하위 5% = Level 1 (시작)
        """
        if percentile >= 99.9:
            return 15, "마스터"
        elif percentile >= 99.5:
            return 14, "그랜드마스터"
        elif percentile >= 98.5:
            return 13, "챌린저"
        elif percentile >= 97.0:
            return 12, "다이아몬드"
        elif percentile >= 95.0:
            return 11, "플래티넘"
        elif percentile >= 92.0:
            return 10, "골드"
        elif percentile >= 88.0:
            return 9, "실버"
        elif percentile >= 83.0:
            return 8, "브론즈"
        elif percentile >= 75.0:
            return 7, "아이언"
        elif percentile >= 63.0:
            return 6, "성장기"
        elif percentile >= 50.0:
            return 5, "입문"
        elif percentile >= 37.0:
            return 4, "초보"
        elif percentile >= 20.0:
            return 3, "뉴비"
        elif percentile >= 5.0:
            return 2, "스타터"
        else:
            return 1, "시작"

    def get_stats(self) -> Dict:
        """전체 통계 조회"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            cursor.execute("""
                SELECT stat_key, stat_value FROM percentile_stats
            """)
            rows = cursor.fetchall()

            stats = {row['stat_key']: row['stat_value'] for row in rows}

            # 실제 분석된 블로그 수 (시드 제외)
            cursor.execute("SELECT COUNT(*) as cnt FROM blog_scores WHERE is_seed = 0")
            stats['real_blogs'] = cursor.fetchone()['cnt']

            return stats
        finally:
            conn.close()

    def get_score_for_percentile(self, target_percentile: float) -> float:
        """특정 백분위에 해당하는 점수 조회"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            # 전체 블로그 수
            cursor.execute("SELECT COUNT(*) as cnt FROM blog_scores")
            total = cursor.fetchone()['cnt']

            if total == 0:
                return 50.0

            # 해당 백분위 위치의 점수
            offset = int(total * (target_percentile / 100))

            cursor.execute("""
                SELECT total_score FROM blog_scores
                ORDER BY total_score ASC
                LIMIT 1 OFFSET ?
            """, (offset,))

            row = cursor.fetchone()
            return row['total_score'] if row else 50.0
        finally:
            conn.close()

    def refresh_distribution_cache(self):
        """분포 캐시 수동 갱신"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            self._update_distribution_cache(cursor)
            conn.commit()
            logger.info("Distribution cache refreshed")
        finally:
            conn.close()

    def reset_seed_data(self):
        """시드 데이터 리셋 - 새로운 분포로 재생성"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            # 기존 시드 데이터 삭제
            cursor.execute("DELETE FROM blog_scores WHERE is_seed = 1")
            deleted_count = cursor.rowcount

            # 분포 캐시 초기화
            cursor.execute("DELETE FROM score_distribution")

            conn.commit()
            logger.info(f"Deleted {deleted_count} seed records")

            # 새로운 시드 데이터 생성
            self._seed_initial_data()

            logger.info("Seed data reset completed with new distribution")
            return {"deleted": deleted_count, "status": "success"}
        except Exception as e:
            logger.error(f"Error resetting seed data: {e}")
            conn.rollback()
            return {"error": str(e), "status": "failed"}
        finally:
            conn.close()


# 싱글톤 인스턴스
_db_instance: Optional[BlogPercentileDB] = None


def get_blog_percentile_db() -> BlogPercentileDB:
    """블로그 백분위 DB 인스턴스 반환"""
    global _db_instance
    if _db_instance is None:
        _db_instance = BlogPercentileDB()
    return _db_instance
