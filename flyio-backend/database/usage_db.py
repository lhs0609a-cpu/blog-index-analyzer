"""
Usage tracking database for rate limiting
- Guest users: IP-based tracking
- Registered users: User ID-based tracking
"""
import sqlite3
from contextlib import contextmanager
from typing import Optional, Dict, List
from datetime import datetime, date
import logging
import os

logger = logging.getLogger(__name__)

DATABASE_PATH = os.environ.get("DATABASE_PATH", "/app/data/blog_analyzer.db")


class UsageDB:
    """Usage tracking database client"""

    # Daily limits by plan
    DAILY_LIMITS = {
        'guest': 5,           # 비회원: 하루 5회
        'free': 10,           # 무료회원: 하루 10회
        'basic': 50,          # 기본 구독: 하루 50회
        'pro': 200,           # 프로 구독: 하루 200회
        'unlimited': -1,      # 무제한 (-1 = 무제한)
    }

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
        """Initialize usage tracking tables"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            # Guest usage tracking (IP-based)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS guest_usage (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ip_address TEXT NOT NULL,
                    usage_date DATE NOT NULL,
                    usage_count INTEGER DEFAULT 0,
                    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(ip_address, usage_date)
                )
            """)

            # User usage tracking (User ID-based)
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_usage (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    usage_date DATE NOT NULL,
                    usage_count INTEGER DEFAULT 0,
                    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, usage_date)
                )
            """)

            cursor.execute("CREATE INDEX IF NOT EXISTS idx_guest_usage_ip_date ON guest_usage(ip_address, usage_date)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_usage_user_date ON user_usage(user_id, usage_date)")

            logger.info("Usage tracking tables initialized")

    def get_guest_usage(self, ip_address: str) -> Dict:
        """Get guest usage for today"""
        today = date.today().isoformat()

        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT usage_count, last_used_at FROM guest_usage WHERE ip_address = ? AND usage_date = ?",
                (ip_address, today)
            )
            row = cursor.fetchone()

            if row:
                return {
                    'count': row['usage_count'],
                    'limit': self.DAILY_LIMITS['guest'],
                    'remaining': max(0, self.DAILY_LIMITS['guest'] - row['usage_count']),
                    'last_used': row['last_used_at']
                }

            return {
                'count': 0,
                'limit': self.DAILY_LIMITS['guest'],
                'remaining': self.DAILY_LIMITS['guest'],
                'last_used': None
            }

    def increment_guest_usage(self, ip_address: str) -> bool:
        """Increment guest usage and return True if within limit"""
        today = date.today().isoformat()
        limit = self.DAILY_LIMITS['guest']

        with self.get_connection() as conn:
            cursor = conn.cursor()

            # Try to get existing record
            cursor.execute(
                "SELECT usage_count FROM guest_usage WHERE ip_address = ? AND usage_date = ?",
                (ip_address, today)
            )
            row = cursor.fetchone()

            if row:
                current_count = row['usage_count']
                if current_count >= limit:
                    return False  # Limit exceeded

                cursor.execute(
                    """UPDATE guest_usage
                       SET usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP
                       WHERE ip_address = ? AND usage_date = ?""",
                    (ip_address, today)
                )
            else:
                cursor.execute(
                    "INSERT INTO guest_usage (ip_address, usage_date, usage_count) VALUES (?, ?, 1)",
                    (ip_address, today)
                )

            return True

    def get_user_usage(self, user_id: int, plan: str = 'free') -> Dict:
        """Get user usage for today"""
        today = date.today().isoformat()
        limit = self.DAILY_LIMITS.get(plan, self.DAILY_LIMITS['free'])

        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT usage_count, last_used_at FROM user_usage WHERE user_id = ? AND usage_date = ?",
                (user_id, today)
            )
            row = cursor.fetchone()

            if row:
                remaining = -1 if limit == -1 else max(0, limit - row['usage_count'])
                return {
                    'count': row['usage_count'],
                    'limit': limit,
                    'remaining': remaining,
                    'last_used': row['last_used_at']
                }

            return {
                'count': 0,
                'limit': limit,
                'remaining': limit,
                'last_used': None
            }

    def increment_user_usage(self, user_id: int, plan: str = 'free') -> bool:
        """Increment user usage and return True if within limit"""
        today = date.today().isoformat()
        limit = self.DAILY_LIMITS.get(plan, self.DAILY_LIMITS['free'])

        # Unlimited plan always allows
        if limit == -1:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """INSERT INTO user_usage (user_id, usage_date, usage_count)
                       VALUES (?, ?, 1)
                       ON CONFLICT(user_id, usage_date)
                       DO UPDATE SET usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP""",
                    (user_id, today)
                )
            return True

        with self.get_connection() as conn:
            cursor = conn.cursor()

            cursor.execute(
                "SELECT usage_count FROM user_usage WHERE user_id = ? AND usage_date = ?",
                (user_id, today)
            )
            row = cursor.fetchone()

            if row:
                if row['usage_count'] >= limit:
                    return False

                cursor.execute(
                    """UPDATE user_usage
                       SET usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP
                       WHERE user_id = ? AND usage_date = ?""",
                    (user_id, today)
                )
            else:
                cursor.execute(
                    "INSERT INTO user_usage (user_id, usage_date, usage_count) VALUES (?, ?, 1)",
                    (user_id, today)
                )

            return True

    def check_and_use(self, ip_address: str, user_id: Optional[int] = None, plan: str = 'guest') -> Dict:
        """
        Check usage limit and increment if allowed.
        Returns usage info with 'allowed' boolean.
        """
        if user_id:
            usage = self.get_user_usage(user_id, plan)
            allowed = self.increment_user_usage(user_id, plan)
        else:
            usage = self.get_guest_usage(ip_address)
            allowed = self.increment_guest_usage(ip_address)

        usage['allowed'] = allowed
        usage['plan'] = plan
        return usage

    def get_usage_stats(self, days: int = 7) -> Dict:
        """Get usage statistics for admin dashboard"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            # Today's stats
            today = date.today().isoformat()

            cursor.execute(
                "SELECT COUNT(DISTINCT ip_address) as guests, SUM(usage_count) as total FROM guest_usage WHERE usage_date = ?",
                (today,)
            )
            guest_today = cursor.fetchone()

            cursor.execute(
                "SELECT COUNT(DISTINCT user_id) as users, SUM(usage_count) as total FROM user_usage WHERE usage_date = ?",
                (today,)
            )
            user_today = cursor.fetchone()

            return {
                'today': {
                    'unique_guests': guest_today['guests'] or 0,
                    'guest_requests': guest_today['total'] or 0,
                    'unique_users': user_today['users'] or 0,
                    'user_requests': user_today['total'] or 0,
                },
                'limits': self.DAILY_LIMITS
            }


# Singleton instance
_usage_db: Optional[UsageDB] = None


def get_usage_db() -> UsageDB:
    """Get UsageDB singleton"""
    global _usage_db
    if _usage_db is None:
        _usage_db = UsageDB()
    return _usage_db
