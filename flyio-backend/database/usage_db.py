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

# Windows 로컬 개발환경에서는 ./data 사용
import sys
if sys.platform == "win32":
    _default_path = os.path.join(os.path.dirname(__file__), "..", "data", "blog_analyzer.db")
else:
    _default_path = "/data/blog_analyzer.db"
DATABASE_PATH = os.environ.get("DATABASE_PATH", _default_path)


class UsageDB:
    """Usage tracking database client"""

    # Daily limits by plan (P0: 무료 플랜 제한 강화로 유료 전환 유도)
    DAILY_LIMITS = {
        'guest': 3,           # 비회원: 하루 3회 (P0: 5→3)
        'free': 5,            # 무료회원: 하루 5회 (P0: 10→5)
        'basic': 50,          # 기본 구독: 하루 50회
        'pro': 200,           # 프로 구독: 하루 200회
        'business': -1,       # 비즈니스 (-1 = 무제한)
    }

    # 비회원 기능별 한도. 회원은 subscription_db.PLAN_LIMITS 를 쓴다 —
    # 화면(UsageIndicator)이 읽는 장부가 그쪽이라 두 숫자가 어긋나면
    # "3회 중 2회 남음" 이 거짓말이 된다.
    #
    # 각 기능 하루 1회 = 맛보기 한 번. 무료 회원의 분석 한도(1회)보다 크면
    # 가입할 이유가 사라지므로 이 값은 회원 한도를 넘지 않아야 한다.
    GUEST_FEATURE_LIMITS = {
        'blog_analysis': 1,
        'keyword_search': 1,
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
            #
            # feature 칼럼이 있어야 '분석 1회·검색 1회'처럼 기능별로 맛보기를 줄 수 있다.
            # 단일 카운터였을 때는 비회원이 분석을 3번 할 수 있었는데, 무료 회원의
            # 분석 한도는 1회였다 — 가입하면 오히려 줄어드는 구조였다.
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS guest_usage (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ip_address TEXT NOT NULL,
                    usage_date DATE NOT NULL,
                    feature TEXT NOT NULL DEFAULT 'all',
                    usage_count INTEGER DEFAULT 0,
                    last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(ip_address, usage_date, feature)
                )
            """)
            self._migrate_guest_usage_feature(cursor)

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

    def _migrate_guest_usage_feature(self, cursor) -> None:
        """
        guest_usage 에 feature 칼럼을 들인다.

        UNIQUE(ip_address, usage_date) 를 UNIQUE(ip_address, usage_date, feature) 로
        바꿔야 하는데 SQLite 는 제약을 ALTER 로 못 고친다. 이 테이블은 **그날치
        카운터**라 보존 가치가 없고(어제 값은 아무도 안 읽는다), 2026-09-16 프로덕션
        실측으로 0행이었다 — 그래서 옛 스키마면 그냥 다시 만든다.
        """
        cols = {r[1] for r in cursor.execute("PRAGMA table_info(guest_usage)").fetchall()}
        if 'feature' in cols:
            return
        cursor.execute("DROP TABLE IF EXISTS guest_usage")
        cursor.execute("""
            CREATE TABLE guest_usage (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ip_address TEXT NOT NULL,
                usage_date DATE NOT NULL,
                feature TEXT NOT NULL DEFAULT 'all',
                usage_count INTEGER DEFAULT 0,
                last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(ip_address, usage_date, feature)
            )
        """)
        logger.info("[usage] guest_usage 를 feature 칼럼 스키마로 재생성")

    def guest_limit(self, feature: str = 'all') -> int:
        """비회원 한도. 기능별 값이 있으면 그걸, 없으면 옛 단일 카운터 값을 쓴다."""
        return self.GUEST_FEATURE_LIMITS.get(feature, self.DAILY_LIMITS['guest'])

    def get_guest_usage(self, ip_address: str, feature: str = 'all') -> Dict:
        """Get guest usage for today"""
        today = date.today().isoformat()
        limit = self.guest_limit(feature)

        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT usage_count, last_used_at FROM guest_usage "
                "WHERE ip_address = ? AND usage_date = ? AND feature = ?",
                (ip_address, today, feature)
            )
            row = cursor.fetchone()

            if row:
                return {
                    'count': row['usage_count'],
                    'limit': limit,
                    'remaining': max(0, limit - row['usage_count']),
                    'last_used': row['last_used_at']
                }

            return {
                'count': 0,
                'limit': limit,
                'remaining': limit,
                'last_used': None
            }

    def increment_guest_usage(self, ip_address: str, feature: str = 'all') -> bool:
        """Increment guest usage and return True if within limit"""
        today = date.today().isoformat()
        limit = self.guest_limit(feature)

        with self.get_connection() as conn:
            cursor = conn.cursor()

            # Try to get existing record
            cursor.execute(
                "SELECT usage_count FROM guest_usage "
                "WHERE ip_address = ? AND usage_date = ? AND feature = ?",
                (ip_address, today, feature)
            )
            row = cursor.fetchone()

            if row:
                current_count = row['usage_count']
                if current_count >= limit:
                    return False  # Limit exceeded

                cursor.execute(
                    """UPDATE guest_usage
                       SET usage_count = usage_count + 1, last_used_at = CURRENT_TIMESTAMP
                       WHERE ip_address = ? AND usage_date = ? AND feature = ?""",
                    (ip_address, today, feature)
                )
            else:
                cursor.execute(
                    "INSERT INTO guest_usage (ip_address, usage_date, feature, usage_count) "
                    "VALUES (?, ?, ?, 1)",
                    (ip_address, today, feature)
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
