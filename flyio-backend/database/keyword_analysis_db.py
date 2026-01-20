"""
키워드 분석 시스템 - 데이터베이스
"""
import sqlite3
import json
import os
import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from contextlib import contextmanager

logger = logging.getLogger(__name__)

# 데이터베이스 파일 경로
DB_DIR = os.path.join(os.path.dirname(__file__), '..', 'data')
DB_PATH = os.path.join(DB_DIR, 'keyword_analysis.db')

# Fly.io 영구 볼륨 경로
FLYIO_DATA_DIR = '/data'
if os.path.exists(FLYIO_DATA_DIR):
    DB_PATH = os.path.join(FLYIO_DATA_DIR, 'keyword_analysis.db')


def get_connection() -> sqlite3.Connection:
    """데이터베이스 연결 반환"""
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def get_db():
    """컨텍스트 매니저로 DB 연결 관리"""
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise e
    finally:
        conn.close()


def init_keyword_analysis_tables():
    """키워드 분석 테이블 초기화"""
    with get_db() as conn:
        cursor = conn.cursor()

        # 1. 키워드 분석 캐시 테이블
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS keyword_analysis_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                keyword VARCHAR(200) NOT NULL UNIQUE,
                analysis_data TEXT NOT NULL,
                search_volume INTEGER DEFAULT 0,
                competition_level VARCHAR(20),
                top10_avg_score REAL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL
            )
        """)

        # 2. 키워드 유형 학습 테이블
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS keyword_type_training (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                keyword VARCHAR(200) NOT NULL UNIQUE,
                classified_type VARCHAR(50) NOT NULL,
                user_corrected_type VARCHAR(50),
                confidence REAL DEFAULT 0,
                is_verified BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # 3. 질환 키워드 계층 테이블
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS disease_keyword_hierarchy (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                main_keyword VARCHAR(200) NOT NULL,
                sub_keyword VARCHAR(200) NOT NULL,
                relation_type VARCHAR(50) DEFAULT 'related',
                search_volume INTEGER DEFAULT 0,
                keyword_type VARCHAR(50),
                depth INTEGER DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(main_keyword, sub_keyword)
            )
        """)

        # 4. 키워드 경쟁도 이력 테이블
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS keyword_competition_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                keyword VARCHAR(200) NOT NULL,
                date DATE NOT NULL,
                search_volume INTEGER DEFAULT 0,
                top10_avg_score REAL DEFAULT 0,
                top10_avg_c_rank REAL DEFAULT 0,
                top10_avg_dia REAL DEFAULT 0,
                blog_ratio REAL DEFAULT 0,
                cafe_ratio REAL DEFAULT 0,
                kin_ratio REAL DEFAULT 0,
                web_ratio REAL DEFAULT 0,
                entry_difficulty VARCHAR(20),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(keyword, date)
            )
        """)

        # 5. 탭별 검색 결과 캐시
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS tab_ratio_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                keyword VARCHAR(200) NOT NULL UNIQUE,
                blog_count INTEGER DEFAULT 0,
                cafe_count INTEGER DEFAULT 0,
                kin_count INTEGER DEFAULT 0,
                web_count INTEGER DEFAULT 0,
                total_count INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL
            )
        """)

        # 6. 연관 키워드 API 결과 캐시 (가장 느린 API 호출 캐싱)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS related_keywords_cache (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                keyword VARCHAR(200) NOT NULL UNIQUE,
                response_data TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL
            )
        """)

        # 인덱스 생성
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_kac_keyword ON keyword_analysis_cache(keyword)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_kac_expires ON keyword_analysis_cache(expires_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ktt_type ON keyword_type_training(classified_type)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_ktt_keyword ON keyword_type_training(keyword)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_dkh_main ON disease_keyword_hierarchy(main_keyword)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_dkh_sub ON disease_keyword_hierarchy(sub_keyword)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_kch_keyword ON keyword_competition_history(keyword)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_kch_date ON keyword_competition_history(date)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_trc_keyword ON tab_ratio_cache(keyword)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_rkc_keyword ON related_keywords_cache(keyword)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_rkc_expires ON related_keywords_cache(expires_at)")

        logger.info("Keyword analysis tables initialized successfully")


# ========== 캐시 관련 함수 ==========

def get_cached_analysis(keyword: str) -> Optional[Dict[str, Any]]:
    """캐시된 키워드 분석 결과 조회"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT analysis_data FROM keyword_analysis_cache
            WHERE keyword = ? AND expires_at > datetime('now')
        """, (keyword,))

        row = cursor.fetchone()
        if row:
            return json.loads(row['analysis_data'])
        return None


def cache_analysis(keyword: str, data: Dict[str, Any], ttl_hours: int = 24):
    """키워드 분석 결과 캐싱"""
    with get_db() as conn:
        cursor = conn.cursor()
        expires_at = datetime.now() + timedelta(hours=ttl_hours)

        cursor.execute("""
            INSERT OR REPLACE INTO keyword_analysis_cache
            (keyword, analysis_data, search_volume, competition_level, top10_avg_score, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            keyword,
            json.dumps(data, ensure_ascii=False),
            data.get('competition_summary', {}).get('search_volume', 0),
            data.get('competition_summary', {}).get('competition_level', 'LOW'),
            data.get('competition_summary', {}).get('top10_stats', {}).get('avg_total_score', 0),
            expires_at.isoformat()
        ))


def clear_expired_cache():
    """만료된 캐시 삭제"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM keyword_analysis_cache WHERE expires_at < datetime('now')")
        cursor.execute("DELETE FROM tab_ratio_cache WHERE expires_at < datetime('now')")
        cursor.execute("DELETE FROM related_keywords_cache WHERE expires_at < datetime('now')")
        deleted = cursor.rowcount
        logger.info(f"Cleared {deleted} expired cache entries")
        return deleted


# ========== 연관 키워드 캐시 ==========

def get_cached_related_keywords(keyword: str) -> Optional[Dict[str, Any]]:
    """캐시된 연관 키워드 결과 조회"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT response_data FROM related_keywords_cache
            WHERE keyword = ? AND expires_at > datetime('now')
        """, (keyword,))

        row = cursor.fetchone()
        if row:
            return json.loads(row['response_data'])
        return None


def cache_related_keywords(keyword: str, data: Dict[str, Any], ttl_hours: int = 24):
    """연관 키워드 결과 캐싱 (24시간 기본)"""
    with get_db() as conn:
        cursor = conn.cursor()
        expires_at = datetime.now() + timedelta(hours=ttl_hours)

        cursor.execute("""
            INSERT OR REPLACE INTO related_keywords_cache
            (keyword, response_data, expires_at)
            VALUES (?, ?, ?)
        """, (
            keyword,
            json.dumps(data, ensure_ascii=False),
            expires_at.isoformat()
        ))


# ========== 키워드 트리 캐시 ==========

def get_cached_keyword_tree(cache_key: str) -> Optional[Dict[str, Any]]:
    """캐시된 키워드 트리 결과 조회"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT response_data FROM related_keywords_cache
            WHERE keyword = ? AND expires_at > datetime('now')
        """, (cache_key,))

        row = cursor.fetchone()
        if row:
            return json.loads(row['response_data'])
        return None


def cache_keyword_tree(cache_key: str, data: Dict[str, Any], ttl_hours: int = 12):
    """키워드 트리 결과 캐싱 (12시간 기본)"""
    with get_db() as conn:
        cursor = conn.cursor()
        expires_at = datetime.now() + timedelta(hours=ttl_hours)

        cursor.execute("""
            INSERT OR REPLACE INTO related_keywords_cache
            (keyword, response_data, expires_at)
            VALUES (?, ?, ?)
        """, (
            cache_key,
            json.dumps(data, ensure_ascii=False),
            expires_at.isoformat()
        ))


# ========== 키워드 유형 학습 ==========

def get_learned_type(keyword: str) -> Optional[Dict[str, Any]]:
    """학습된 키워드 유형 조회"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT classified_type, user_corrected_type, confidence, is_verified
            FROM keyword_type_training
            WHERE keyword = ?
        """, (keyword,))

        row = cursor.fetchone()
        if row:
            return {
                'classified_type': row['user_corrected_type'] or row['classified_type'],
                'confidence': row['confidence'],
                'is_verified': row['is_verified']
            }
        return None


def save_keyword_type(keyword: str, classified_type: str, confidence: float = 0.0, is_verified: bool = False):
    """키워드 유형 저장 (학습)"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO keyword_type_training (keyword, classified_type, confidence, is_verified)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(keyword) DO UPDATE SET
                classified_type = excluded.classified_type,
                confidence = excluded.confidence,
                updated_at = CURRENT_TIMESTAMP
        """, (keyword, classified_type, confidence, is_verified))


def correct_keyword_type(keyword: str, corrected_type: str):
    """사용자가 키워드 유형 수정 (학습 피드백)"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE keyword_type_training
            SET user_corrected_type = ?, is_verified = TRUE, updated_at = CURRENT_TIMESTAMP
            WHERE keyword = ?
        """, (corrected_type, keyword))


def get_type_statistics() -> Dict[str, int]:
    """키워드 유형별 통계"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT COALESCE(user_corrected_type, classified_type) as type, COUNT(*) as count
            FROM keyword_type_training
            GROUP BY type
        """)

        return {row['type']: row['count'] for row in cursor.fetchall()}


# ========== 질환 키워드 계층 ==========

def get_sub_keywords(main_keyword: str) -> List[Dict[str, Any]]:
    """메인 키워드의 세부 키워드 조회"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT sub_keyword, relation_type, search_volume, keyword_type, depth
            FROM disease_keyword_hierarchy
            WHERE main_keyword = ?
            ORDER BY search_volume DESC
        """, (main_keyword,))

        return [dict(row) for row in cursor.fetchall()]


def save_keyword_hierarchy(main_keyword: str, sub_keyword: str,
                          search_volume: int = 0, keyword_type: str = None,
                          relation_type: str = 'related', depth: int = 1):
    """키워드 계층 저장"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO disease_keyword_hierarchy
            (main_keyword, sub_keyword, search_volume, keyword_type, relation_type, depth)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(main_keyword, sub_keyword) DO UPDATE SET
                search_volume = excluded.search_volume,
                keyword_type = excluded.keyword_type,
                updated_at = CURRENT_TIMESTAMP
        """, (main_keyword, sub_keyword, search_volume, keyword_type, relation_type, depth))


def get_all_main_keywords() -> List[str]:
    """저장된 모든 메인 키워드 목록"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT DISTINCT main_keyword FROM disease_keyword_hierarchy")
        return [row['main_keyword'] for row in cursor.fetchall()]


# ========== 경쟁도 이력 ==========

def save_competition_history(keyword: str, data: Dict[str, Any]):
    """경쟁도 분석 이력 저장"""
    with get_db() as conn:
        cursor = conn.cursor()
        today = datetime.now().date().isoformat()

        top10_stats = data.get('top10_stats', {})
        tab_ratio = data.get('tab_ratio', {})

        cursor.execute("""
            INSERT INTO keyword_competition_history
            (keyword, date, search_volume, top10_avg_score, top10_avg_c_rank, top10_avg_dia,
             blog_ratio, cafe_ratio, kin_ratio, web_ratio, entry_difficulty)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(keyword, date) DO UPDATE SET
                search_volume = excluded.search_volume,
                top10_avg_score = excluded.top10_avg_score,
                top10_avg_c_rank = excluded.top10_avg_c_rank,
                top10_avg_dia = excluded.top10_avg_dia,
                blog_ratio = excluded.blog_ratio,
                cafe_ratio = excluded.cafe_ratio,
                kin_ratio = excluded.kin_ratio,
                web_ratio = excluded.web_ratio,
                entry_difficulty = excluded.entry_difficulty
        """, (
            keyword,
            today,
            data.get('search_volume', 0),
            top10_stats.get('avg_total_score', 0),
            top10_stats.get('avg_c_rank', 0),
            top10_stats.get('avg_dia', 0),
            tab_ratio.get('blog', 0),
            tab_ratio.get('cafe', 0),
            tab_ratio.get('kin', 0),
            tab_ratio.get('web', 0),
            data.get('entry_difficulty', 'ACHIEVABLE')
        ))


def get_competition_trend(keyword: str, days: int = 30) -> List[Dict[str, Any]]:
    """키워드 경쟁도 트렌드 조회"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM keyword_competition_history
            WHERE keyword = ? AND date >= date('now', ?)
            ORDER BY date ASC
        """, (keyword, f'-{days} days'))

        return [dict(row) for row in cursor.fetchall()]


# ========== 탭별 비율 캐시 ==========

def get_cached_tab_ratio(keyword: str) -> Optional[Dict[str, Any]]:
    """캐시된 탭별 비율 조회"""
    with get_db() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT blog_count, cafe_count, kin_count, web_count, total_count
            FROM tab_ratio_cache
            WHERE keyword = ? AND expires_at > datetime('now')
        """, (keyword,))

        row = cursor.fetchone()
        if row:
            return dict(row)
        return None


def cache_tab_ratio(keyword: str, blog: int, cafe: int, kin: int, web: int, ttl_hours: int = 6):
    """탭별 비율 캐싱"""
    with get_db() as conn:
        cursor = conn.cursor()
        expires_at = datetime.now() + timedelta(hours=ttl_hours)
        total = blog + cafe + kin + web

        cursor.execute("""
            INSERT OR REPLACE INTO tab_ratio_cache
            (keyword, blog_count, cafe_count, kin_count, web_count, total_count, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (keyword, blog, cafe, kin, web, total, expires_at.isoformat()))


# 앱 시작 시 테이블 초기화
init_keyword_analysis_tables()
