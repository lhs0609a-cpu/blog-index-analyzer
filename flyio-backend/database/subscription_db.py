"""
구독 관리 데이터베이스
- 구독 플랜 정의
- 사용자 구독 상태 관리
- 사용량 추적

환경변수:
- DATABASE_URL: PostgreSQL 연결 URL (Supabase 등)
- 설정 안되면 SQLite 사용 (로컬 개발용)
"""
import sqlite3
import uuid
import os
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
from enum import Enum
import logging
import sys

logger = logging.getLogger(__name__)

# ============ 데이터베이스 설정 ============
DATABASE_URL = os.environ.get("DATABASE_URL", "")
USE_POSTGRES = bool(DATABASE_URL)

if USE_POSTGRES:
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
        logger.info("✅ PostgreSQL mode enabled (Supabase)")
    except ImportError:
        logger.error("❌ psycopg2 not installed. Run: pip install psycopg2-binary")
        USE_POSTGRES = False

# SQLite fallback 경로
if sys.platform == "win32":
    DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))
else:
    DATA_DIR = os.environ.get("DATA_DIR", "/data")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "subscription.db")


class PlanType(str, Enum):
    FREE = "free"
    BASIC = "basic"
    PRO = "pro"
    BUSINESS = "business"


# 플랜별 제한 설정
# P1-1: 무료 플랜 제한 강화 (결제 전환율 향상)
PLAN_LIMITS = {
    PlanType.FREE: {
        "name": "무료",
        "price_monthly": 0,
        "price_yearly": 0,
        "keyword_search_daily": 3,      # 8 → 3 (맛보기만)
        "blog_analysis_daily": 1,       # 2 → 1 (한 번만)
        "search_results_count": 5,      # 10 → 5 (제한된 결과)
        "history_days": 0,
        "competitor_compare": 0,
        "rank_alert": False,
        "excel_export": False,
        "api_access": False,
        "team_members": 1,
        # 순위 추적 기능 - 무료는 비활성화 (유료 전용)
        "rank_tracking_blogs": 0,       # 1 → 0 (유료 전용)
        "rank_check_daily": 0,          # 1 → 0 (유료 전용)
        "rank_history_days": 0,         # 7 → 0 (유료 전용)
        # 블루오션 기능 - 무료는 비활성화
        "blue_ocean_daily": 0,          # 유료 전용
    },
    PlanType.BASIC: {
        "name": "베이직",
        "price_monthly": 9900,
        "price_yearly": 95000,
        "keyword_search_daily": 30,
        "blog_analysis_daily": 10,
        "search_results_count": 10,
        "history_days": 30,
        "competitor_compare": 3,
        "rank_alert": False,
        "excel_export": False,
        "api_access": False,
        "team_members": 1,
        # 순위 추적 기능
        "rank_tracking_blogs": 3,
        "rank_check_daily": 5,
        "rank_history_days": 30,
        # 블루오션 기능
        "blue_ocean_daily": 5,          # 일 5회
    },
    PlanType.PRO: {
        "name": "프로",
        "price_monthly": 19900,
        "price_yearly": 191000,
        "keyword_search_daily": 100,
        "blog_analysis_daily": 50,
        "search_results_count": 20,
        "history_days": 90,
        "competitor_compare": 10,
        "rank_alert": True,
        "excel_export": True,
        "api_access": False,
        "team_members": 3,
        # 순위 추적 기능
        "rank_tracking_blogs": 10,
        "rank_check_daily": 20,
        "rank_history_days": 90,
        # 블루오션 기능
        "blue_ocean_daily": 30,         # 일 30회
    },
    PlanType.BUSINESS: {
        "name": "비즈니스",
        "price_monthly": 49900,
        "price_yearly": 479000,
        "keyword_search_daily": -1,  # 무제한
        "blog_analysis_daily": -1,   # 무제한
        "search_results_count": 50,
        "history_days": -1,          # 무제한
        "competitor_compare": -1,    # 무제한
        "rank_alert": True,
        "excel_export": True,
        "api_access": True,
        "team_members": 10,
        # 순위 추적 기능
        "rank_tracking_blogs": -1,   # 무제한
        "rank_check_daily": -1,      # 무제한
        "rank_history_days": -1,     # 무제한
        # 블루오션 기능
        "blue_ocean_daily": -1,      # 무제한
    },
}


def _verify_subscription_ownership(user_id: int, subscription: Dict) -> Optional[Dict]:
    """
    구독이 실제 사용자에게 속하는지 확인 (고아 구독 검증)

    문제: users 테이블(blog_analyzer.db)과 subscriptions 테이블(subscription.db)이
    별도 DB 파일을 사용하므로, 삭제된 사용자의 구독이 새 사용자에게 할당될 수 있음
    """
    if not subscription:
        return None

    try:
        # 순환 참조 방지를 위한 지연 임포트
        from database.user_db import get_user_db
        user_db = get_user_db()
        user = user_db.get_user_by_id(user_id)

        if not user:
            logger.warning(f"Orphaned subscription: user_id={user_id} does not exist")
            return None

        # 구독 생성 시간과 사용자 생성 시간 비교
        sub_created = subscription.get("created_at") or subscription.get("started_at")
        user_created = user.get("created_at")

        if sub_created and user_created:
            # 문자열을 datetime으로 변환
            if isinstance(sub_created, str):
                sub_dt = datetime.fromisoformat(sub_created.replace('Z', '+00:00').replace('+00:00', ''))
            else:
                sub_dt = sub_created

            if isinstance(user_created, str):
                user_dt = datetime.fromisoformat(user_created.replace('Z', '+00:00').replace('+00:00', ''))
            else:
                user_dt = user_created

            # 구독이 사용자보다 1일 이상 먼저 생성되었고 free가 아니면 고아 구독
            if (user_dt - sub_dt).days > 1 and subscription.get("plan_type") != "free":
                logger.warning(
                    f"Orphaned subscription detected: user_id={user_id}, "
                    f"sub_created={sub_created}, user_created={user_created}"
                )
                return None

    except Exception as e:
        logger.debug(f"Subscription ownership verification failed: {e}")
        # 검증 실패 시 기존 구독 반환 (안전한 폴백)

    return subscription


def get_connection():
    """데이터베이스 연결 (PostgreSQL 우선, SQLite fallback)"""
    if USE_POSTGRES:
        conn = psycopg2.connect(DATABASE_URL)
        return conn
    else:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn


def execute_query(query: str, params: tuple = None, fetch: str = "all"):
    """
    통합 쿼리 실행 함수
    - PostgreSQL: %s placeholder
    - SQLite: ? placeholder
    """
    conn = get_connection()

    if USE_POSTGRES:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        # SQLite ? -> PostgreSQL %s 변환
        pg_query = query.replace("?", "%s")
        # CURRENT_TIMESTAMP -> NOW() 변환
        pg_query = pg_query.replace("CURRENT_TIMESTAMP", "NOW()")
        cursor.execute(pg_query, params)
    else:
        cursor = conn.cursor()
        cursor.execute(query, params)

    result = None
    if fetch == "one":
        row = cursor.fetchone()
        result = dict(row) if row else None
    elif fetch == "all":
        rows = cursor.fetchall()
        if USE_POSTGRES:
            result = [dict(row) for row in rows]
        else:
            result = [dict(row) for row in rows]
    elif fetch == "lastrowid":
        if USE_POSTGRES:
            # PostgreSQL은 RETURNING 사용 필요
            result = cursor.fetchone()
            result = result['id'] if result else None
        else:
            result = cursor.lastrowid
    elif fetch == "rowcount":
        result = cursor.rowcount

    conn.commit()
    conn.close()
    return result


def init_subscription_tables():
    """구독 관련 테이블 초기화"""
    conn = get_connection()
    cursor = conn.cursor()

    # 구독 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            plan_type TEXT NOT NULL DEFAULT 'free',
            billing_cycle TEXT DEFAULT 'monthly',
            status TEXT DEFAULT 'active',
            started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP,
            cancelled_at TIMESTAMP,
            payment_key TEXT,
            customer_key TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # 일일 사용량 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS daily_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            keyword_searches INTEGER DEFAULT 0,
            blog_analyses INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, date)
        )
    """)

    # 결제 내역 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            subscription_id INTEGER,
            payment_key TEXT UNIQUE,
            order_id TEXT UNIQUE,
            amount INTEGER NOT NULL,
            currency TEXT DEFAULT 'KRW',
            status TEXT DEFAULT 'pending',
            payment_method TEXT,
            card_company TEXT,
            card_number TEXT,
            receipt_url TEXT,
            paid_at TIMESTAMP,
            cancelled_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
        )
    """)

    # 추가 크레딧 테이블
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS extra_credits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            credit_type TEXT NOT NULL,
            amount INTEGER NOT NULL,
            remaining INTEGER NOT NULL,
            expires_at TIMESTAMP,
            payment_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (payment_id) REFERENCES payments(id)
        )
    """)

    _migrate_subscription_columns(cursor)

    conn.commit()
    conn.close()
    logger.info("✅ Subscription tables initialized")


# 이미 존재하는 DB 에 들여야 하는 칼럼. CREATE TABLE IF NOT EXISTS 는
# 기존 테이블을 그대로 두므로, 프로덕션 볼륨의 테이블은 여기서만 바뀜다.
_SUBSCRIPTION_ADDED_COLUMNS = {
    # 정기결제의 유일한 근거. 이게 없으면 다음 달에 결제할 수단이 없다.
    "billing_key": "TEXT",
    # 카드 재등록 없이 갱신하려면 customer_key 가 사람마다 고정돼야 한다.
    "billing_registered_at": "TIMESTAMP",
    # 갱신 실패를 몇 번 연속으로 맞았는가 — 카드 만료를 사람에게 알릴 근거.
    "renewal_failures": "INTEGER DEFAULT 0",
    "last_renewal_attempt_at": "TIMESTAMP",
}


def _migrate_subscription_columns(cursor) -> None:
    """subscriptions 에 빠진 칼럼을 채운다. 이미 있으면 조용히 넘어간다."""
    try:
        if USE_POSTGRES:
            cursor.execute(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'subscriptions'"
            )
            existing = {r[0] if not isinstance(r, dict) else r['column_name'] for r in cursor.fetchall()}
        else:
            cursor.execute("PRAGMA table_info(subscriptions)")
            existing = {r[1] for r in cursor.fetchall()}
    except Exception as e:
        logger.warning(f"subscriptions 칼럼 점검 실패: {e}")
        return

    for column, ddl in _SUBSCRIPTION_ADDED_COLUMNS.items():
        if column in existing:
            continue
        try:
            cursor.execute(f"ALTER TABLE subscriptions ADD COLUMN {column} {ddl}")
            logger.info(f"subscriptions.{column} 칼럼을 추가했다")
        except Exception as e:
            logger.warning(f"subscriptions.{column} 추가 실패: {e}")


# ============ 구독 관리 함수 ============

def get_user_subscription(user_id: int) -> Optional[Dict]:
    """사용자 구독 정보 조회"""
    conn = get_connection()

    if USE_POSTGRES:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT * FROM subscriptions WHERE user_id = %s", (user_id,))
    else:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM subscriptions WHERE user_id = ?", (user_id,))

    row = cursor.fetchone()
    conn.close()

    if row:
        subscription = dict(row)
        subscription['plan_limits'] = PLAN_LIMITS.get(
            PlanType(subscription['plan_type']),
            PLAN_LIMITS[PlanType.FREE]
        )
        return subscription
    return None


def create_subscription(user_id: int, plan_type: str = "free") -> Dict:
    """구독 생성"""
    conn = get_connection()

    # 만료일 계산 (무료는 무제한, 유료는 30일)
    expires_at = None
    if plan_type != "free":
        expires_at = (datetime.now() + timedelta(days=30)).isoformat()

    if USE_POSTGRES:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO subscriptions (user_id, plan_type, expires_at)
            VALUES (%s, %s, %s)
            ON CONFLICT(user_id) DO UPDATE SET
                plan_type = EXCLUDED.plan_type,
                expires_at = EXCLUDED.expires_at,
                updated_at = NOW()
        """, (user_id, plan_type, expires_at))
    else:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO subscriptions (user_id, plan_type, expires_at)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                plan_type = excluded.plan_type,
                expires_at = excluded.expires_at,
                updated_at = CURRENT_TIMESTAMP
        """, (user_id, plan_type, expires_at))

    conn.commit()
    conn.close()

    return get_user_subscription(user_id)


# 연속 이 횟수를 넘기면 더 긁지 않는다. 카드 만료는 재시도로 낫지 않고,
# 실패한 승인 요청이 쌓이면 결제사 쪽에서 가맹점 평판이 깎인다.
MAX_RENEWAL_FAILURES = 3


def get_or_create_customer_key(user_id: int) -> str:
    """
    사람마다 **고정된** 토스 customerKey.

    왜 고정이어야 하나: 빌링키는 customerKey 에 묶여 발급된다. 프런트가 결제
    때마다 `customer_{id}_{randomUUID()}` 를 새로 만들어 보내던 동안은, 첫 결제가
    성공해도 그 키로 다시 결제할 방법이 없었다 — 매달 카드를 다시 등록해야
    하는데 화면은 "다음 달 같은 날짜에 자동 결제됩니다" 라고 말하고 있었다.

    값은 추측할 수 없어야 한다(토스 권고). BLANK_USER_3 같은 순번 키는 쓰지 않는다.
    """
    sub = get_user_subscription(user_id)
    existing = (sub or {}).get("customer_key")
    if existing:
        return existing

    if not sub:
        create_subscription(user_id, "free")

    customer_key = "blspi_" + uuid.uuid4().hex
    conn = get_connection()
    cursor = conn.cursor()
    ph = "%s" if USE_POSTGRES else "?"
    cursor.execute(
        "UPDATE subscriptions SET customer_key = {} WHERE user_id = {}".format(ph, ph),
        (customer_key, user_id),
    )
    conn.commit()
    conn.close()
    return customer_key


def get_billing_credentials(user_id: int) -> Optional[Dict]:
    """저장된 빌링키/커스터머키. 정기결제는 **이 값으로만** 실행한다."""
    sub = get_user_subscription(user_id)
    if not sub or not sub.get("billing_key"):
        return None
    return {
        "billing_key": sub["billing_key"],
        "customer_key": sub.get("customer_key"),
        "plan_type": sub.get("plan_type"),
        "billing_cycle": sub.get("billing_cycle") or "monthly",
        "expires_at": sub.get("expires_at"),
    }


def clear_billing_key(user_id: int) -> None:
    """해지·카드 폐기 시 빌링키를 지운다. 남겨두면 해지한 사람에게 청구된다."""
    conn = get_connection()
    cursor = conn.cursor()
    ph = "%s" if USE_POSTGRES else "?"
    cursor.execute(
        "UPDATE subscriptions SET billing_key = NULL, renewal_failures = 0 "
        "WHERE user_id = {}".format(ph),
        (user_id,),
    )
    conn.commit()
    conn.close()


def record_renewal_attempt(user_id: int, success: bool) -> int:
    """
    갱신 시도 결과를 남기고 연속 실패 횟수를 돌려준다.

    연속 실패를 세는 이유: 카드 만료·한도 초과는 재시도로 낫지 않는다.
    몇 번째인지 알아야 "언제 사람에게 알리고 언제 포기하는가"를 정할 수 있다.
    """
    conn = get_connection()
    cursor = conn.cursor()
    ph = "%s" if USE_POSTGRES else "?"
    now = "NOW()" if USE_POSTGRES else "CURRENT_TIMESTAMP"
    if success:
        cursor.execute(
            "UPDATE subscriptions SET renewal_failures = 0, last_renewal_attempt_at = {} "
            "WHERE user_id = {}".format(now, ph),
            (user_id,),
        )
        failures = 0
    else:
        cursor.execute(
            "UPDATE subscriptions SET renewal_failures = COALESCE(renewal_failures, 0) + 1, "
            "last_renewal_attempt_at = {} WHERE user_id = {}".format(now, ph),
            (user_id,),
        )
        cursor.execute(
            "SELECT renewal_failures FROM subscriptions WHERE user_id = {}".format(ph),
            (user_id,),
        )
        row = cursor.fetchone()
        if row is None:
            failures = 0
        elif isinstance(row, dict):
            failures = row.get("renewal_failures") or 0
        else:
            failures = row[0] or 0
    conn.commit()
    conn.close()
    return int(failures)


def get_subscriptions_due_for_renewal(limit: int = 100) -> List[Dict]:
    """
    만료일이 지난 유료 구독 중 빌링키가 살아 있는 것.

    만료 '전날'이 아니라 만료 시점을 기준으로 긁는다. 미리 당겨 받으면 남은
    기간만큼 두 번 받는 셈이 되고, 그건 환불 요청이 되어 돌아온다.
    """
    conn = get_connection()
    sql = (
        "SELECT user_id, plan_type, billing_cycle, billing_key, customer_key, expires_at, "
        "COALESCE(renewal_failures, 0) AS renewal_failures "
        "FROM subscriptions "
        "WHERE status = 'active' AND plan_type != 'free' AND billing_key IS NOT NULL "
        "AND expires_at IS NOT NULL AND expires_at <= {now} "
        "AND COALESCE(renewal_failures, 0) < {ph} "
        "ORDER BY expires_at ASC LIMIT {ph}"
    )
    if USE_POSTGRES:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute(sql.format(now="NOW()", ph="%s"), (MAX_RENEWAL_FAILURES, limit))
    else:
        cursor = conn.cursor()
        cursor.execute(sql.format(now="CURRENT_TIMESTAMP", ph="?"), (MAX_RENEWAL_FAILURES, limit))
    rows = cursor.fetchall()
    conn.close()
    return [dict(r) for r in rows]


def upgrade_subscription(
    user_id: int,
    plan_type: str,
    billing_cycle: str = "monthly",
    payment_key: str = None,
    customer_key: str = None,
    billing_key: str = None,
) -> Dict:
    """구독 업그레이드"""
    conn = get_connection()

    # 만료일 계산
    if billing_cycle == "yearly":
        expires_at = datetime.now() + timedelta(days=365)
    else:
        expires_at = datetime.now() + timedelta(days=30)

    if USE_POSTGRES:
        cursor = conn.cursor()
        # billing_key / customer_key 는 **넘어온 값이 있을 때만** 덮는다.
        # 갱신 결제는 빌링키를 새로 발급하지 않으므로, 무조건 대입하면 두 번째
        # 달에 NULL 로 지워지고 그 순간 정기결제가 영구히 끊긴다.
        cursor.execute("""
            UPDATE subscriptions
            SET plan_type = %s,
                billing_cycle = %s,
                status = 'active',
                expires_at = %s,
                payment_key = %s,
                customer_key = COALESCE(%s, customer_key),
                billing_key = COALESCE(%s, billing_key),
                billing_registered_at = CASE WHEN %s IS NULL THEN billing_registered_at ELSE NOW() END,
                renewal_failures = 0,
                updated_at = NOW()
            WHERE user_id = %s
        """, (plan_type, billing_cycle, expires_at.isoformat(), payment_key,
              customer_key, billing_key, billing_key, user_id))

        if cursor.rowcount == 0:
            cursor.execute("""
                INSERT INTO subscriptions (user_id, plan_type, billing_cycle, expires_at, payment_key, customer_key, billing_key)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (user_id, plan_type, billing_cycle, expires_at.isoformat(), payment_key, customer_key, billing_key))
    else:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE subscriptions
            SET plan_type = ?,
                billing_cycle = ?,
                status = 'active',
                expires_at = ?,
                payment_key = ?,
                customer_key = COALESCE(?, customer_key),
                billing_key = COALESCE(?, billing_key),
                billing_registered_at = CASE WHEN ? IS NULL THEN billing_registered_at ELSE CURRENT_TIMESTAMP END,
                renewal_failures = 0,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
        """, (plan_type, billing_cycle, expires_at.isoformat(), payment_key,
              customer_key, billing_key, billing_key, user_id))

        if cursor.rowcount == 0:
            cursor.execute("""
                INSERT INTO subscriptions (user_id, plan_type, billing_cycle, expires_at, payment_key, customer_key, billing_key)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (user_id, plan_type, billing_cycle, expires_at.isoformat(), payment_key, customer_key, billing_key))

    conn.commit()
    conn.close()

    return get_user_subscription(user_id)


def cancel_subscription(user_id: int) -> bool:
    """구독 취소 (만료일까지 유지)"""
    conn = get_connection()

    if USE_POSTGRES:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE subscriptions
            SET status = 'cancelled',
                cancelled_at = NOW(),
                updated_at = NOW()
            WHERE user_id = %s
        """, (user_id,))
    else:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE subscriptions
            SET status = 'cancelled',
                cancelled_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
        """, (user_id,))

    success = cursor.rowcount > 0
    conn.commit()
    conn.close()

    return success


# ============ 사용량 추적 함수 ============

def get_today_usage(user_id: int) -> Dict:
    """오늘 사용량 조회"""
    conn = get_connection()
    today = datetime.now().strftime("%Y-%m-%d")

    if USE_POSTGRES:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT * FROM daily_usage WHERE user_id = %s AND date = %s
        """, (user_id, today))
    else:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM daily_usage WHERE user_id = ? AND date = ?
        """, (user_id, today))

    row = cursor.fetchone()
    conn.close()

    if row:
        return dict(row)
    return {
        "user_id": user_id,
        "date": today,
        "keyword_searches": 0,
        "blog_analyses": 0
    }


def increment_usage(user_id: int, usage_type: str) -> Dict:
    """사용량 증가"""
    conn = get_connection()
    today = datetime.now().strftime("%Y-%m-%d")

    if USE_POSTGRES:
        cursor = conn.cursor()
        if usage_type == "keyword_search":
            cursor.execute("""
                INSERT INTO daily_usage (user_id, date, keyword_searches)
                VALUES (%s, %s, 1)
                ON CONFLICT(user_id, date) DO UPDATE SET
                    keyword_searches = daily_usage.keyword_searches + 1,
                    updated_at = NOW()
            """, (user_id, today))
        elif usage_type == "blog_analysis":
            cursor.execute("""
                INSERT INTO daily_usage (user_id, date, blog_analyses)
                VALUES (%s, %s, 1)
                ON CONFLICT(user_id, date) DO UPDATE SET
                    blog_analyses = daily_usage.blog_analyses + 1,
                    updated_at = NOW()
            """, (user_id, today))
    else:
        cursor = conn.cursor()
        if usage_type == "keyword_search":
            cursor.execute("""
                INSERT INTO daily_usage (user_id, date, keyword_searches)
                VALUES (?, ?, 1)
                ON CONFLICT(user_id, date) DO UPDATE SET
                    keyword_searches = keyword_searches + 1,
                    updated_at = CURRENT_TIMESTAMP
            """, (user_id, today))
        elif usage_type == "blog_analysis":
            cursor.execute("""
                INSERT INTO daily_usage (user_id, date, blog_analyses)
                VALUES (?, ?, 1)
                ON CONFLICT(user_id, date) DO UPDATE SET
                    blog_analyses = blog_analyses + 1,
                    updated_at = CURRENT_TIMESTAMP
            """, (user_id, today))

    conn.commit()
    conn.close()

    return get_today_usage(user_id)


def check_usage_limit(user_id: int, usage_type: str) -> Dict:
    """사용량 제한 확인"""
    # 관리자 체크 - 무제한 허용
    try:
        from database.user_db import get_user_db
        user_db = get_user_db()
        user = user_db.get_user_by_id(user_id)
        if user and user.get('is_admin'):
            return {
                "allowed": True,
                "used": 0,
                "limit": -1,
                "remaining": -1,
                "plan": "business"
            }
    except Exception:
        pass

    subscription = get_user_subscription(user_id)

    # 고아 구독 검증 (users와 subscriptions가 별도 DB인 경우 발생 가능)
    if subscription:
        subscription = _verify_subscription_ownership(user_id, subscription)

    if not subscription:
        # 구독이 없거나 고아 구독이면 무료 플랜으로 생성
        subscription = create_subscription(user_id, "free")

    usage = get_today_usage(user_id)
    limits = subscription['plan_limits']

    if usage_type == "keyword_search":
        limit = limits['keyword_search_daily']
        used = usage['keyword_searches']
    elif usage_type == "blog_analysis":
        limit = limits['blog_analysis_daily']
        used = usage['blog_analyses']
    else:
        return {"allowed": True, "remaining": -1}

    # -1은 무제한
    if limit == -1:
        return {
            "allowed": True,
            "used": used,
            "limit": -1,
            "remaining": -1,
            "plan": subscription['plan_type']
        }

    remaining = limit - used
    allowed = remaining > 0

    return {
        "allowed": allowed,
        "used": used,
        "limit": limit,
        "remaining": max(0, remaining),
        "plan": subscription['plan_type']
    }


async def check_feature_access(user_id: int, feature: str) -> Dict:
    """
    특정 기능에 대한 접근 권한 확인

    Args:
        user_id: 사용자 ID
        feature: 기능명 (winner_keywords, blue_ocean, etc.)

    Returns:
        dict with 'allowed' (bool) and 'plan' (str)
    """
    # 관리자 체크 - 모든 기능 접근 허용
    try:
        from database.user_db import get_user_db
        user_db = get_user_db()
        user = user_db.get_user_by_id(user_id)
        if user and user.get('is_admin'):
            return {
                "allowed": True,
                "plan": "business",
                "feature": feature,
                "required_plans": ["business"]
            }
    except Exception:
        pass

    # 기능별 최소 플랜 요구사항
    feature_requirements = {
        "winner_keywords": ["pro", "business"],  # Pro 이상
        "blue_ocean": ["basic", "pro", "business"],  # Basic 이상
        "profitable_keywords": ["pro", "business"],  # Pro 이상
        "marketplace": ["pro", "business"],  # Pro 이상
        "ad_optimization": ["business"],  # Business만
        "bulk_analysis": ["pro", "business"],  # Pro 이상
    }

    subscription = get_user_subscription(user_id)

    # 고아 구독 검증
    if subscription:
        subscription = _verify_subscription_ownership(user_id, subscription)

    if not subscription:
        subscription = create_subscription(user_id, "free")

    user_plan = subscription.get('plan_type', 'free')

    # 해당 기능의 요구 플랜 목록
    required_plans = feature_requirements.get(feature, ["free", "basic", "pro", "business"])

    # 사용자 플랜이 요구 플랜에 포함되는지 확인
    allowed = user_plan in required_plans

    return {
        "allowed": allowed,
        "plan": user_plan,
        "feature": feature,
        "required_plans": required_plans
    }


# ============ 결제 내역 함수 ============

def create_payment(
    user_id: int,
    order_id: str,
    amount: int,
    payment_key: str = None,
    status: str = "pending"
) -> Dict:
    """결제 내역 생성"""
    conn = get_connection()

    if USE_POSTGRES:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            INSERT INTO payments (user_id, order_id, amount, payment_key, status)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id
        """, (user_id, order_id, amount, payment_key, status))
        result = cursor.fetchone()
        payment_id = result['id'] if result else None
    else:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO payments (user_id, order_id, amount, payment_key, status)
            VALUES (?, ?, ?, ?, ?)
        """, (user_id, order_id, amount, payment_key, status))
        payment_id = cursor.lastrowid

    conn.commit()
    conn.close()

    return {"id": payment_id, "order_id": order_id, "status": status}


def update_payment(
    order_id: str,
    payment_key: str,
    status: str,
    payment_method: str = None,
    card_company: str = None,
    card_number: str = None,
    receipt_url: str = None
) -> bool:
    """결제 내역 업데이트"""
    conn = get_connection()

    if USE_POSTGRES:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE payments
            SET payment_key = %s,
                status = %s,
                payment_method = %s,
                card_company = %s,
                card_number = %s,
                receipt_url = %s,
                paid_at = CASE WHEN %s = 'completed' THEN NOW() ELSE paid_at END
            WHERE order_id = %s
        """, (payment_key, status, payment_method, card_company, card_number, receipt_url, status, order_id))
    else:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE payments
            SET payment_key = ?,
                status = ?,
                payment_method = ?,
                card_company = ?,
                card_number = ?,
                receipt_url = ?,
                paid_at = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE paid_at END
            WHERE order_id = ?
        """, (payment_key, status, payment_method, card_company, card_number, receipt_url, status, order_id))

    success = cursor.rowcount > 0
    conn.commit()
    conn.close()

    return success


def get_payment_history(user_id: int, limit: int = 10) -> List[Dict]:
    """결제 내역 조회"""
    conn = get_connection()

    if USE_POSTGRES:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("""
            SELECT * FROM payments
            WHERE user_id = %s
            ORDER BY created_at DESC
            LIMIT %s
        """, (user_id, limit))
    else:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT * FROM payments
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
        """, (user_id, limit))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


# ============ 추가 크레딧 함수 ============

def add_extra_credits(
    user_id: int,
    credit_type: str,
    amount: int,
    payment_id: int = None,
    expires_days: int = 30
) -> Dict:
    """추가 크레딧 구매"""
    conn = get_connection()
    cursor = conn.cursor()

    expires_at = (datetime.now() + timedelta(days=expires_days)).isoformat()

    cursor.execute("""
        INSERT INTO extra_credits (user_id, credit_type, amount, remaining, expires_at, payment_id)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (user_id, credit_type, amount, amount, expires_at, payment_id))

    credit_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return {"id": credit_id, "amount": amount, "remaining": amount}


def use_extra_credit(user_id: int, credit_type: str) -> bool:
    """추가 크레딧 사용"""
    conn = get_connection()
    cursor = conn.cursor()

    # 만료되지 않고 잔여가 있는 크레딧 찾기
    cursor.execute("""
        UPDATE extra_credits
        SET remaining = remaining - 1
        WHERE id = (
            SELECT id FROM extra_credits
            WHERE user_id = ?
              AND credit_type = ?
              AND remaining > 0
              AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
            ORDER BY expires_at ASC
            LIMIT 1
        )
    """, (user_id, credit_type))

    success = cursor.rowcount > 0
    conn.commit()
    conn.close()

    return success


def get_extra_credits(user_id: int) -> List[Dict]:
    """추가 크레딧 잔여량 조회"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT credit_type, SUM(remaining) as total_remaining
        FROM extra_credits
        WHERE user_id = ?
          AND remaining > 0
          AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
        GROUP BY credit_type
    """, (user_id,))

    rows = cursor.fetchall()
    conn.close()

    return [dict(row) for row in rows]


# ============ 관리자용 결제 내역 함수 ============

def get_all_payments_admin(
    limit: int = 50,
    offset: int = 0,
    status: str = None,
    start_date: str = None,
    end_date: str = None
) -> Dict:
    """모든 결제 내역 조회 (관리자용)"""
    conn = get_connection()
    cursor = conn.cursor()

    # 기본 쿼리
    query = """
        SELECT p.*, u.email as user_email, u.name as user_name
        FROM payments p
        LEFT JOIN (
            SELECT id, email, name FROM sqlite_master WHERE type='table' AND name='users'
        ) u ON 1=0
        ORDER BY p.created_at DESC
    """

    # 실제로 users 테이블이 다른 DB에 있을 수 있으므로 단순 조회
    query = "SELECT * FROM payments WHERE 1=1"
    params = []

    if status:
        query += " AND status = ?"
        params.append(status)

    if start_date:
        query += " AND created_at >= ?"
        params.append(start_date)

    if end_date:
        query += " AND created_at <= ?"
        params.append(end_date + " 23:59:59")

    # 전체 건수
    count_query = query.replace("SELECT *", "SELECT COUNT(*)")
    cursor.execute(count_query, params)
    total = cursor.fetchone()[0]

    # 페이징
    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    return {
        "payments": [dict(row) for row in rows],
        "total": total,
        "limit": limit,
        "offset": offset
    }


def get_revenue_stats(period: str = "30d") -> Dict:
    """매출 통계 조회"""
    conn = get_connection()
    cursor = conn.cursor()

    # 기간 계산
    if period == "7d":
        days = 7
    elif period == "30d":
        days = 30
    elif period == "90d":
        days = 90
    elif period == "1y":
        days = 365
    else:
        days = 30

    start_date = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    today = datetime.now().strftime("%Y-%m-%d")
    this_month_start = datetime.now().strftime("%Y-%m-01")

    # 전체 매출 (완료된 결제만)
    cursor.execute("""
        SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
        FROM payments
        WHERE status = 'completed'
    """)
    total_row = cursor.fetchone()
    total_revenue = total_row[0] if total_row else 0
    total_count = total_row[1] if total_row else 0

    # 오늘 매출
    cursor.execute("""
        SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
        FROM payments
        WHERE status = 'completed'
          AND date(paid_at) = date('now')
    """)
    today_row = cursor.fetchone()
    today_revenue = today_row[0] if today_row else 0
    today_count = today_row[1] if today_row else 0

    # 이번 달 매출
    cursor.execute("""
        SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
        FROM payments
        WHERE status = 'completed'
          AND paid_at >= ?
    """, (this_month_start,))
    month_row = cursor.fetchone()
    month_revenue = month_row[0] if month_row else 0
    month_count = month_row[1] if month_row else 0

    # 기간 내 매출
    cursor.execute("""
        SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as count
        FROM payments
        WHERE status = 'completed'
          AND paid_at >= ?
    """, (start_date,))
    period_row = cursor.fetchone()
    period_revenue = period_row[0] if period_row else 0
    period_count = period_row[1] if period_row else 0

    # 일별 매출 (최근 N일)
    cursor.execute("""
        SELECT date(paid_at) as date, COALESCE(SUM(amount), 0) as revenue, COUNT(*) as count
        FROM payments
        WHERE status = 'completed'
          AND paid_at >= ?
        GROUP BY date(paid_at)
        ORDER BY date(paid_at) ASC
    """, (start_date,))
    daily_rows = cursor.fetchall()
    daily_revenue = [{"date": row[0], "revenue": row[1], "count": row[2]} for row in daily_rows]

    # 결제 상태별 통계
    cursor.execute("""
        SELECT status, COUNT(*) as count, COALESCE(SUM(amount), 0) as total
        FROM payments
        GROUP BY status
    """)
    status_rows = cursor.fetchall()
    status_stats = {row[0]: {"count": row[1], "total": row[2]} for row in status_rows}

    # 결제 수단별 통계
    cursor.execute("""
        SELECT payment_method, COUNT(*) as count, COALESCE(SUM(amount), 0) as total
        FROM payments
        WHERE status = 'completed' AND payment_method IS NOT NULL
        GROUP BY payment_method
    """)
    method_rows = cursor.fetchall()
    method_stats = {row[0]: {"count": row[1], "total": row[2]} for row in method_rows}

    conn.close()

    return {
        "total_revenue": total_revenue,
        "total_transactions": total_count,
        "today_revenue": today_revenue,
        "today_count": today_count,
        "month_revenue": month_revenue,
        "month_count": month_count,
        "period_revenue": period_revenue,
        "period_count": period_count,
        "period": period,
        "daily_revenue": daily_revenue,
        "status_stats": status_stats,
        "payment_method_stats": method_stats
    }


def get_payment_by_id(payment_id: int) -> Optional[Dict]:
    """결제 ID로 조회"""
    conn = get_connection()

    if USE_POSTGRES:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT * FROM payments WHERE id = %s", (payment_id,))
    else:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM payments WHERE id = ?", (payment_id,))

    row = cursor.fetchone()
    conn.close()

    return dict(row) if row else None


def get_payment_by_order_id(order_id: str) -> Optional[Dict]:
    """주문 ID로 결제 조회"""
    conn = get_connection()

    if USE_POSTGRES:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT * FROM payments WHERE order_id = %s", (order_id,))
    else:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM payments WHERE order_id = ?", (order_id,))

    row = cursor.fetchone()
    conn.close()

    return dict(row) if row else None


def get_payment_by_payment_key(payment_key: str):
    """결제 키로 결제 조회. 취소·조회 전에 소유자를 확인하는 데 쓴다."""
    conn = get_connection()

    if USE_POSTGRES:
        cursor = conn.cursor(cursor_factory=RealDictCursor)
        cursor.execute("SELECT * FROM payments WHERE payment_key = %s", (payment_key,))
    else:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM payments WHERE payment_key = ?", (payment_key,))

    row = cursor.fetchone()
    conn.close()

    return dict(row) if row else None


def cancel_payment_record(payment_id: int, cancel_reason: str = None) -> bool:
    """결제 취소 처리 (DB 레코드)"""
    conn = get_connection()

    if USE_POSTGRES:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE payments
            SET status = 'cancelled',
                cancelled_at = NOW()
            WHERE id = %s
        """, (payment_id,))
    else:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE payments
            SET status = 'cancelled',
                cancelled_at = CURRENT_TIMESTAMP
            WHERE id = ?
        """, (payment_id,))

    success = cursor.rowcount > 0
    conn.commit()
    conn.close()

    return success


def get_payments_count() -> int:
    """전체 결제 건수"""
    conn = get_connection()
    cursor = conn.cursor()

    if USE_POSTGRES:
        cursor.execute("SELECT COUNT(*) as count FROM payments")
    else:
        cursor.execute("SELECT COUNT(*) FROM payments")

    result = cursor.fetchone()
    conn.close()

    if USE_POSTGRES:
        return result[0] if result else 0
    return result[0] if result else 0


# 초기화
if __name__ == "__main__":
    init_subscription_tables()
    print("Subscription tables created successfully!")
