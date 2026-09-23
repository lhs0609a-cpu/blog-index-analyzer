"""
Usage tracking database for rate limiting
- Guest users: IP-based tracking
- Registered users: User ID-based tracking
"""
import sqlite3
from contextlib import contextmanager
from typing import Optional, Dict, List
from datetime import datetime, date, timedelta
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

    def count_guest_limit_days(self, ip_address: str, feature: str = 'all', days: int = 7) -> int:
        """
        최근 N일 중 이 비회원이 **한도를 다 쓴 날이 며칠인지**.

        visitor_hash 는 날짜별 소금이라 날이 바뀌면 같은 사람을 못 알아본다. 하지만
        guest_usage 는 IP 로 적히고 IP 는 날짜를 넘어 유지된다 — 재방문을 알 수 있는
        유일한 통로인데 지금까지 오늘치(usage_date = ?)만 읽고 있었다.
        """
        limit = self.guest_limit(feature)
        if limit is None or limit < 0:
            return 0

        cutoff = (date.today() - timedelta(days=days - 1)).isoformat()
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    "SELECT COUNT(*) c FROM guest_usage "
                    "WHERE ip_address = ? AND feature = ? AND usage_date >= ? AND usage_count >= ?",
                    (ip_address, feature, cutoff, limit),
                )
                row = cursor.fetchone()
                return int(row['c'] if row else 0)
        except Exception as e:
            logger.warning(f"[usage] 비회원 반복 차단일 집계 실패: {e}")
            return 0

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

    def get_users_usage_bulk(self, users: List[Dict]) -> Dict[int, Dict]:
        """
        여러 사용자의 오늘치 사용량을 **쿼리 한 번**으로 읽는다.

        관리자 목록은 사용자당 get_user_usage() 를 불렀다 — 50명이면 SQLite 커넥션을
        50번 열고 닫는다(실측 ~1ms/명). 오늘은 85명이라 80ms 지만 이건 사용자 수에
        정비례해서 자란다: 1,000명이면 목록 한 번에 1초가 붙는다. 한도는 plan 에서
        나오는 상수라 DB 가 실제로 갖고 있는 건 usage_count 뿐 → IN 한 방이면 끝난다.

        users: id 와 plan 을 가진 dict 목록. 반환: {user_id: get_user_usage() 와 동일한 dict}
        """
        result: Dict[int, Dict] = {}
        if not users:
            return result

        plan_by_id = {u['id']: (u.get('plan') or 'free') for u in users if u.get('id') is not None}
        if not plan_by_id:
            return result

        today = date.today().isoformat()
        counts: Dict[int, Dict] = {}
        ids = list(plan_by_id.keys())

        with self.get_connection() as conn:
            cursor = conn.cursor()
            # SQLITE_MAX_VARIABLE_NUMBER (기본 999) 를 넘지 않도록 끊어서 조회.
            CHUNK = 500
            for i in range(0, len(ids), CHUNK):
                chunk = ids[i:i + CHUNK]
                placeholders = ",".join("?" for _ in chunk)
                cursor.execute(
                    f"SELECT user_id, usage_count, last_used_at FROM user_usage "
                    f"WHERE usage_date = ? AND user_id IN ({placeholders})",
                    (today, *chunk)
                )
                for row in cursor.fetchall():
                    counts[row['user_id']] = {
                        'count': row['usage_count'],
                        'last_used': row['last_used_at'],
                    }

        for user_id, plan in plan_by_id.items():
            limit = self.DAILY_LIMITS.get(plan, self.DAILY_LIMITS['free'])
            hit = counts.get(user_id)
            count = hit['count'] if hit else 0
            result[user_id] = {
                'count': count,
                'limit': limit,
                'remaining': -1 if limit == -1 else max(0, limit - count),
                'last_used': hit['last_used'] if hit else None,
            }

        return result

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
