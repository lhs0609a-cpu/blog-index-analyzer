"""
구독 관리 데이터베이스
- 구독 플랜 정의
- 사용자 구독 상태 관리
- 사용량 추적
"""
import sqlite3
import os
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
from enum import Enum
import logging

logger = logging.getLogger(__name__)

# 데이터베이스 경로
DB_PATH = os.path.join(os.path.dirname(__file__), "subscription.db")


class PlanType(str, Enum):
    FREE = "free"
    BASIC = "basic"
    PRO = "pro"
    BUSINESS = "business"


# 플랜별 제한 설정
PLAN_LIMITS = {
    PlanType.FREE: {
        "name": "무료",
        "price_monthly": 0,
        "price_yearly": 0,
        "keyword_search_daily": 3,
        "blog_analysis_daily": 1,
        "search_results_count": 5,
        "history_days": 0,
        "competitor_compare": 0,
        "rank_alert": False,
        "excel_export": False,
        "api_access": False,
        "team_members": 1,
    },
    PlanType.BASIC: {
        "name": "베이직",
        "price_monthly": 4900,
        "price_yearly": 47000,
        "keyword_search_daily": 30,
        "blog_analysis_daily": 10,
        "search_results_count": 10,
        "history_days": 30,
        "competitor_compare": 3,
        "rank_alert": False,
        "excel_export": False,
        "api_access": False,
        "team_members": 1,
    },
    PlanType.PRO: {
        "name": "프로",
        "price_monthly": 9900,
        "price_yearly": 95000,
        "keyword_search_daily": 100,
        "blog_analysis_daily": 50,
        "search_results_count": 20,
        "history_days": 90,
        "competitor_compare": 10,
        "rank_alert": True,
        "excel_export": True,
        "api_access": False,
        "team_members": 3,
    },
    PlanType.BUSINESS: {
        "name": "비즈니스",
        "price_monthly": 29900,
        "price_yearly": 287000,
        "keyword_search_daily": -1,  # 무제한
        "blog_analysis_daily": -1,   # 무제한
        "search_results_count": 50,
        "history_days": -1,          # 무제한
        "competitor_compare": -1,    # 무제한
        "rank_alert": True,
        "excel_export": True,
        "api_access": True,
        "team_members": 10,
    },
}


def get_connection():
    """SQLite 연결"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


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

    conn.commit()
    conn.close()
    logger.info("✅ Subscription tables initialized")


# ============ 구독 관리 함수 ============

def get_user_subscription(user_id: int) -> Optional[Dict]:
    """사용자 구독 정보 조회"""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("""
        SELECT * FROM subscriptions WHERE user_id = ?
    """, (user_id,))

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
    cursor = conn.cursor()

    # 만료일 계산 (무료는 무제한, 유료는 30일)
    expires_at = None
    if plan_type != "free":
        expires_at = (datetime.now() + timedelta(days=30)).isoformat()

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


def upgrade_subscription(
    user_id: int,
    plan_type: str,
    billing_cycle: str = "monthly",
    payment_key: str = None,
    customer_key: str = None
) -> Dict:
    """구독 업그레이드"""
    conn = get_connection()
    cursor = conn.cursor()

    # 만료일 계산
    if billing_cycle == "yearly":
        expires_at = datetime.now() + timedelta(days=365)
    else:
        expires_at = datetime.now() + timedelta(days=30)

    cursor.execute("""
        UPDATE subscriptions
        SET plan_type = ?,
            billing_cycle = ?,
            status = 'active',
            expires_at = ?,
            payment_key = ?,
            customer_key = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ?
    """, (plan_type, billing_cycle, expires_at.isoformat(), payment_key, customer_key, user_id))

    if cursor.rowcount == 0:
        # 구독이 없으면 생성
        cursor.execute("""
            INSERT INTO subscriptions (user_id, plan_type, billing_cycle, expires_at, payment_key, customer_key)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (user_id, plan_type, billing_cycle, expires_at.isoformat(), payment_key, customer_key))

    conn.commit()
    conn.close()

    return get_user_subscription(user_id)


def cancel_subscription(user_id: int) -> bool:
    """구독 취소 (만료일까지 유지)"""
    conn = get_connection()
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
    cursor = conn.cursor()

    today = datetime.now().strftime("%Y-%m-%d")

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
    cursor = conn.cursor()

    today = datetime.now().strftime("%Y-%m-%d")

    # UPSERT
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
    subscription = get_user_subscription(user_id)
    if not subscription:
        # 구독이 없으면 무료 플랜으로 생성
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


# 초기화
if __name__ == "__main__":
    init_subscription_tables()
    print("Subscription tables created successfully!")
