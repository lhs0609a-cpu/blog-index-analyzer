"""
SQLite database client for blog analyzer
"""
import sqlite3
from contextlib import contextmanager
from typing import List, Dict, Optional, Any
import logging
import os

logger = logging.getLogger(__name__)

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
        conn = sqlite3.connect(self.db_path)
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
    conn = sqlite3.connect(client.db_path)
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
