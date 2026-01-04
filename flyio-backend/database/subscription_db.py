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

# 데이터베이스 경로 - /app/data 볼륨에 저장 (영속적)
# Windows 로컬 개발환경에서는 ./data 사용
import sys
if sys.platform == "win32":
    DATA_DIR = os.environ.get("DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))
else:
    DATA_DIR = os.environ.get("DATA_DIR", "/app/data")
os.makedirs(DATA_DIR, exist_ok=True)
DB_PATH = os.path.join(DATA_DIR, "subscription.db")


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
        # 순위 추적 기능
        "rank_tracking_blogs": 1,      # 추적 가능 블로그 수
        "rank_check_daily": 1,         # 일일 순위 확인 횟수
        "rank_history_days": 7,        # 순위 히스토리 보관 기간
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
        # 순위 추적 기능
        "rank_tracking_blogs": 3,
        "rank_check_daily": 5,
        "rank_history_days": 30,
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
        # 순위 추적 기능
        "rank_tracking_blogs": 10,
        "rank_check_daily": 20,
        "rank_history_days": 90,
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
        # 순위 추적 기능
        "rank_tracking_blogs": -1,   # 무제한
        "rank_check_daily": -1,      # 무제한
        "rank_history_days": -1,     # 무제한
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
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM payments WHERE id = ?", (payment_id,))
    row = cursor.fetchone()
    conn.close()

    return dict(row) if row else None


def cancel_payment_record(payment_id: int, cancel_reason: str = None) -> bool:
    """결제 취소 처리 (DB 레코드)"""
    conn = get_connection()
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
    cursor.execute("SELECT COUNT(*) FROM payments")
    count = cursor.fetchone()[0]
    conn.close()
    return count


# 초기화
if __name__ == "__main__":
    init_subscription_tables()
    print("Subscription tables created successfully!")
