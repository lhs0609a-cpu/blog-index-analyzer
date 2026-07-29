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

# ===== 점수 산출 버전 =====
# 스코어링 파이프라인이 바뀌면 과거 점수는 다른 자로 잰 값이라 같은 분포에 섞으면 안 된다.
# v4: 모바일 하이드레이션 스크래핑 복구(포스트/이웃/방문자 실측) +
#     c_rank/dia 가중치 정규화(총점 상한 56 → 100). 그 이전 점수는 전부 무효.
SCORING_VERSION = 4

# 백분위를 신뢰하려면 실측 모집단이 이만큼은 있어야 한다.
# 그 아래에서는 표본이 얇아 백분위가 요동치므로 절대 기준표로 판정한다.
MIN_POPULATION_FOR_PERCENTILE = 300


class BlogPercentileDB:
    """블로그 백분위 데이터베이스"""

    def __init__(self, db_path: str = PERCENTILE_DB_PATH):
        self.db_path = db_path
        self._ensure_db_exists()
        self._init_tables()
        self._purge_invalid_scores()

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

            # 기존 DB에 scoring_version 컬럼 추가 (마이그레이션)
            cursor.execute("PRAGMA table_info(blog_scores)")
            columns = {row['name'] for row in cursor.fetchall()}
            if 'scoring_version' not in columns:
                cursor.execute("ALTER TABLE blog_scores ADD COLUMN scoring_version INTEGER DEFAULT 0")

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

    def _purge_invalid_scores(self):
        """가짜 시드 + 구버전 점수 제거.

        예전에는 여기서 가상 블로그 10만 개를 심어 그 분포로 백분위를 냈다.
        그 시드의 중앙값은 55점인데 당시 실측 파이프라인은 스크래핑이 깨져 30점을
        넘지 못했다. 결과적으로 어떤 블로그를 넣어도 하위 5%로 떨어져
        전부 "준최1"이 나왔다. (2026-07-29 진단)

        이제 백분위는 같은 SCORING_VERSION으로 실측된 블로그끼리만 계산하고,
        모집단이 얇으면 아예 백분위를 쓰지 않는다(절대 기준표로 폴백).
        """
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            cursor.execute("DELETE FROM blog_scores WHERE is_seed = 1")
            seed_deleted = cursor.rowcount

            # 다른 자로 잰 점수는 같은 분포에 섞을 수 없다
            cursor.execute(
                "DELETE FROM blog_scores WHERE COALESCE(scoring_version, 0) < ?",
                (SCORING_VERSION,),
            )
            stale_deleted = cursor.rowcount

            if seed_deleted or stale_deleted:
                cursor.execute("DELETE FROM score_distribution")
                self._update_distribution_cache(cursor)
                logger.info(
                    f"Purged percentile population: seeds={seed_deleted}, "
                    f"stale(<v{SCORING_VERSION})={stale_deleted}"
                )

            cursor.execute(
                "INSERT OR REPLACE INTO percentile_stats (stat_key, stat_value, updated_at) "
                "VALUES ('scoring_version', ?, CURRENT_TIMESTAMP)",
                (SCORING_VERSION,),
            )
            conn.commit()
        except Exception as e:
            logger.error(f"Error purging invalid scores: {e}")
            conn.rollback()
        finally:
            conn.close()

    def get_population_size(self) -> int:
        """현재 스코어링 버전으로 실측된 블로그 수 (백분위 신뢰도의 근거)"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT COUNT(*) as cnt FROM blog_scores "
                "WHERE is_seed = 0 AND scoring_version = ?",
                (SCORING_VERSION,),
            )
            return cursor.fetchone()['cnt']
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
                WHERE is_seed = 0 AND scoring_version = ?
                GROUP BY bucket
            """, (SCORING_VERSION,))

            # 통계 업데이트 (현재 버전 실측 모집단 기준)
            cursor.execute("""
                SELECT
                    COUNT(*) as total,
                    AVG(total_score) as avg_score,
                    MIN(total_score) as min_score,
                    MAX(total_score) as max_score
                FROM blog_scores
                WHERE is_seed = 0 AND scoring_version = ?
            """, (SCORING_VERSION,))
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
                INSERT INTO blog_scores (blog_id, total_score, level, is_seed, scoring_version, updated_at)
                VALUES (?, ?, ?, 0, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(blog_id) DO UPDATE SET
                    total_score = ?,
                    level = ?,
                    is_seed = 0,
                    scoring_version = ?,
                    updated_at = CURRENT_TIMESTAMP
            """, (blog_id, total_score, level, SCORING_VERSION,
                  total_score, level, SCORING_VERSION))

            conn.commit()
            return True
        except Exception as e:
            logger.error(f"Error adding blog score: {e}")
            return False
        finally:
            conn.close()

    def get_percentile(self, total_score: float) -> Optional[float]:
        """주어진 점수의 백분위 계산 (0-100).

        같은 SCORING_VERSION으로 실측된 블로그만 모집단에 넣는다.
        모집단이 MIN_POPULATION_FOR_PERCENTILE 미만이면 **None**을 돌려준다.
        예전처럼 50.0 같은 값을 지어내지 않는다 — 표본이 없는데 백분위를 만들어내면
        호출부가 그걸 근거 있는 판정으로 착각한다.
        """
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            cursor.execute("""
                SELECT COUNT(*) as cnt FROM blog_scores
                WHERE is_seed = 0 AND scoring_version = ?
            """, (SCORING_VERSION,))
            total_count = cursor.fetchone()['cnt']

            if total_count < MIN_POPULATION_FOR_PERCENTILE:
                return None

            cursor.execute("""
                SELECT COUNT(*) as cnt FROM blog_scores
                WHERE is_seed = 0 AND scoring_version = ? AND total_score < ?
            """, (SCORING_VERSION, total_score))
            lower_count = cursor.fetchone()['cnt']

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
        """백분위 기반 레벨 계산 (v4 - 일반/준최/최적/최적+ 체계)

        백분위 → 레벨 매핑:
        상위 0.5% = Lv.15 (최적4+)
        상위 1.5% = Lv.14 (최적3+)
        상위 3%   = Lv.13 (최적2+)
        상위 5%   = Lv.12 (최적1+)
        상위 8%   = Lv.11 (최적3)
        상위 12%  = Lv.10 (최적2)
        상위 17%  = Lv.9  (최적1)   ← 네이버 Lv.4 시작
        상위 25%  = Lv.8  (준최7)
        상위 35%  = Lv.7  (준최6)
        상위 50%  = Lv.6  (준최5)   ← 네이버 Lv.3 중심
        상위 60%  = Lv.5  (준최4)
        상위 75%  = Lv.4  (준최3)
        상위 90%  = Lv.3  (준최2)
        상위 97%  = Lv.2  (준최1)
        하위 3%   = Lv.1  (일반)    ← 네이버 Lv.1 영역
        """
        if percentile >= 99.5:
            return 15, "최적4+"
        elif percentile >= 98.5:
            return 14, "최적3+"
        elif percentile >= 97.0:
            return 13, "최적2+"
        elif percentile >= 95.0:
            return 12, "최적1+"
        elif percentile >= 92.0:
            return 11, "최적3"
        elif percentile >= 88.0:
            return 10, "최적2"
        elif percentile >= 83.0:
            return 9, "최적1"        # 네이버 Lv.4 영역 시작
        elif percentile >= 75.0:
            return 8, "준최7"
        elif percentile >= 65.0:
            return 7, "준최6"
        elif percentile >= 50.0:
            return 6, "준최5"        # 네이버 Lv.3 중심
        elif percentile >= 40.0:
            return 5, "준최4"
        elif percentile >= 25.0:
            return 4, "준최3"
        elif percentile >= 10.0:
            return 3, "준최2"
        elif percentile >= 3.0:
            return 2, "준최1"
        else:
            return 1, "일반"          # 네이버 Lv.1 영역

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

            cursor.execute(
                "SELECT COUNT(*) as cnt FROM blog_scores WHERE is_seed = 0 AND scoring_version = ?",
                (SCORING_VERSION,),
            )
            population = cursor.fetchone()['cnt']
            stats['population'] = population
            stats['scoring_version'] = SCORING_VERSION
            stats['min_population_for_percentile'] = MIN_POPULATION_FOR_PERCENTILE
            # False면 절대 기준표로 판정 중이라는 뜻
            stats['percentile_active'] = population >= MIN_POPULATION_FOR_PERCENTILE

            return stats
        finally:
            conn.close()

    def get_score_for_percentile(self, target_percentile: float) -> Optional[float]:
        """특정 백분위에 해당하는 점수 조회 (모집단이 없으면 None)"""
        conn = self._get_connection()
        try:
            cursor = conn.cursor()

            # 현재 스코어링 버전의 실측 모집단만
            cursor.execute(
                "SELECT COUNT(*) as cnt FROM blog_scores WHERE is_seed = 0 AND scoring_version = ?",
                (SCORING_VERSION,),
            )
            total = cursor.fetchone()['cnt']

            if total == 0:
                return None

            # 해당 백분위 위치의 점수
            offset = int(total * (target_percentile / 100))

            cursor.execute("""
                SELECT total_score FROM blog_scores
                WHERE is_seed = 0 AND scoring_version = ?
                ORDER BY total_score ASC
                LIMIT 1 OFFSET ?
            """, (SCORING_VERSION, offset))

            row = cursor.fetchone()
            return row['total_score'] if row else None
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
        """가짜 시드/구버전 점수 제거 (재생성하지 않는다).

        이름은 호환을 위해 유지한다. 시드 재생성은 폐기됐다 —
        가짜 모집단이 모든 블로그를 "준최1"로 만든 원인이었다.
        """
        self._purge_invalid_scores()
        population = self.get_population_size()
        logger.info(f"Percentile population after purge: {population}")
        return {
            "status": "success",
            "population": population,
            "scoring_version": SCORING_VERSION,
            "percentile_active": population >= MIN_POPULATION_FOR_PERCENTILE,
        }


# 싱글톤 인스턴스
_db_instance: Optional[BlogPercentileDB] = None


def get_blog_percentile_db() -> BlogPercentileDB:
    """블로그 백분위 DB 인스턴스 반환"""
    global _db_instance
    if _db_instance is None:
        _db_instance = BlogPercentileDB()
    return _db_instance
