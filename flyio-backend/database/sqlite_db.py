"""
SQLite database client for blog analyzer
"""
import sqlite3
from contextlib import contextmanager
from typing import List, Dict, Optional, Any
import logging
import os

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# blog_analyzer.db 는 WAL 없이 쓰이고 있었다 — 이 저장소의 다른 DB(keyword_pool,
# naver_ad, registered_keywords)는 이미 WAL 인데 정작 **로그인·사용량·관리자 화면이
# 읽는 DB** 만 기본 rollback journal 이었다.
#
# 그 모드에서는 쓰기 하나가 모든 읽기를 막는다. 그런데 /health 를 비롯한 API 는
# `async def` 안에서 이 동기 쿼리를 직접 부른다 — 락을 기다리는 동안 그 요청만 느린 게
# 아니라 **이벤트 루프 전체가 멈춘다**. 뒤따르는 요청이 줄줄이 같은 곳에서 5초씩
# 기다리면 수십 초가 된다 (2026-09-23 실측: /health 54초, 프론트 배지 '연결 끊김').
#
# WAL 에서는 읽기가 쓰기를 기다리지 않는다. busy_timeout 은 쓰기끼리 부딪힐 때
# 즉시 예외 대신 기다리게 한다.
def _tune(conn: sqlite3.Connection) -> sqlite3.Connection:
    try:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=10000")
        # synchronous 는 기본값(FULL) 유지 — 이 DB 는 회원 계정을 담는다.
        # WAL 만으로 읽기/쓰기 동시성 문제는 해결되므로 내구성을 낮출 이유가 없다.
    except Exception:
        # PRAGMA 실패로 연결 자체를 못 쓰게 만들지는 않는다.
        pass
    return conn


# Database path - use persistent volume
# Windows 로컬 개발환경에서는 ./data 사용
import sys
if sys.platform == "win32":
    _default_path = os.path.join(os.path.dirname(__file__), "..", "data", "blog_analyzer.db")
else:
    _default_path = "/data/blog_analyzer.db"
DATABASE_PATH = os.environ.get("DATABASE_PATH", _default_path)


class SQLiteClient:
    """SQLite database client"""

    def __init__(self, db_path: str = DATABASE_PATH):
        self.db_path = db_path
        self._ensure_db_exists()

    def _ensure_db_exists(self):
        """Ensure database file and directory exist"""
        db_dir = os.path.dirname(self.db_path)
        if db_dir and not os.path.exists(db_dir):
            try:
                os.makedirs(db_dir, exist_ok=True)
            except Exception as e:
                logger.warning(f"Could not create db directory: {e}")

    @contextmanager
    def get_connection(self):
        """Get database connection context manager"""
        conn = _tune(sqlite3.connect(self.db_path))
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def execute_query(self, query: str, params: tuple = ()) -> List[Dict]:
        """Execute a query and return results"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            if query.strip().upper().startswith("SELECT"):
                return [dict(row) for row in cursor.fetchall()]
            return []

    def execute_many(self, query: str, params_list: List[tuple]):
        """Execute a query with multiple parameter sets"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.executemany(query, params_list)

    def insert(self, table: str, data: Dict) -> int:
        """Insert a row and return the ID"""
        columns = ", ".join(data.keys())
        placeholders = ", ".join(["?" for _ in data])
        query = f"INSERT INTO {table} ({columns}) VALUES ({placeholders})"

        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, tuple(data.values()))
            return cursor.lastrowid


# Singleton instance
_client: Optional[SQLiteClient] = None


def get_sqlite_client() -> SQLiteClient:
    """Get SQLite client singleton"""
    global _client
    if _client is None:
        _client = SQLiteClient()
    return _client


def get_connection():
    """Get a raw sqlite3 connection (for platform_store etc.)"""
    client = get_sqlite_client()
    conn = _tune(sqlite3.connect(client.db_path))
    conn.row_factory = sqlite3.Row
    return conn


def initialize_db():
    """Initialize database tables"""
    client = get_sqlite_client()

    # Create basic tables
    queries = [
        """
        CREATE TABLE IF NOT EXISTS blogs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            blog_id TEXT UNIQUE NOT NULL,
            blog_name TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS analysis_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            blog_id TEXT NOT NULL,
            analysis_type TEXT,
            score REAL,
            level INTEGER,
            raw_data TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_blogs_blog_id ON blogs(blog_id)",
        "CREATE INDEX IF NOT EXISTS idx_analysis_blog_id ON analysis_history(blog_id)",
        "CREATE INDEX IF NOT EXISTS idx_analysis_created ON analysis_history(created_at)"
    ]

    for query in queries:
        try:
            client.execute_query(query)
        except Exception as e:
            logger.warning(f"Error executing init query: {e}")

    logger.info("SQLite database initialized")


async def get_blog_by_id(blog_id: str) -> Optional[Dict]:
    """
    블로그 ID로 블로그 정보 조회
    user_blogs.db의 user_saved_blogs 테이블에서 조회
    """
    # user_blogs.db 경로
    if sys.platform == "win32":
        user_blogs_db_path = os.path.join(os.path.dirname(__file__), "..", "data", "user_blogs.db")
    else:
        user_blogs_db_path = "/data/user_blogs.db"

    try:
        conn = sqlite3.connect(user_blogs_db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute("""
            SELECT
                blog_id,
                blog_name as name,
                level,
                grade,
                total_score,
                total_posts,
                total_visitors,
                neighbor_count,
                last_analyzed_at
            FROM user_saved_blogs
            WHERE blog_id = ?
            ORDER BY updated_at DESC
            LIMIT 1
        """, (blog_id,))

        row = cursor.fetchone()
        conn.close()

        if row:
            return dict(row)
        return None
    except Exception as e:
        logger.warning(f"Error getting blog by id: {e}")
        return None
