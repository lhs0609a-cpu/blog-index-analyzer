"""
User database module for authentication
"""
import sqlite3
from contextlib import contextmanager
from typing import Optional, Dict
from datetime import datetime
import logging
import os

logger = logging.getLogger(__name__)

# Database path - use persistent volume
DATABASE_PATH = os.environ.get("DATABASE_PATH", "/app/data/blog_analyzer.db")


class UserDB:
    """User database client"""

    def __init__(self, db_path: str = DATABASE_PATH):
        self.db_path = db_path
        self._ensure_db_exists()
        self._init_tables()

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

    def _init_tables(self):
        """Initialize user tables"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT UNIQUE NOT NULL,
                    hashed_password TEXT NOT NULL,
                    name TEXT,
                    blog_id TEXT,
                    is_active BOOLEAN DEFAULT 1,
                    is_verified BOOLEAN DEFAULT 0,
                    plan TEXT DEFAULT 'free',
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
            logger.info("User tables initialized")

    def create_user(self, email: str, hashed_password: str, name: Optional[str] = None) -> int:
        """Create a new user and return the user ID"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                INSERT INTO users (email, hashed_password, name)
                VALUES (?, ?, ?)
                """,
                (email, hashed_password, name)
            )
            return cursor.lastrowid

    def get_user_by_email(self, email: str) -> Optional[Dict]:
        """Get user by email"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE email = ?", (email,))
            row = cursor.fetchone()
            if row:
                return dict(row)
            return None

    def get_user_by_id(self, user_id: int) -> Optional[Dict]:
        """Get user by ID"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
            row = cursor.fetchone()
            if row:
                return dict(row)
            return None

    def update_user(self, user_id: int, **kwargs) -> bool:
        """Update user fields"""
        if not kwargs:
            return False

        kwargs['updated_at'] = datetime.now().isoformat()
        set_clause = ", ".join([f"{k} = ?" for k in kwargs.keys()])
        values = list(kwargs.values()) + [user_id]

        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                f"UPDATE users SET {set_clause} WHERE id = ?",
                values
            )
            return cursor.rowcount > 0

    def delete_user(self, user_id: int) -> bool:
        """Delete user by ID"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM users WHERE id = ?", (user_id,))
            return cursor.rowcount > 0


# Singleton instance
_user_db: Optional[UserDB] = None


def get_user_db() -> UserDB:
    """Get UserDB singleton"""
    global _user_db
    if _user_db is None:
        _user_db = UserDB()
    return _user_db
