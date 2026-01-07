"""
Supabase Database Client for Blog Index Analyzer
PostgreSQL 기반의 Supabase 데이터베이스 연결 클라이언트

환경변수:
- SUPABASE_URL: Supabase 프로젝트 URL
- SUPABASE_KEY: Supabase service_role key (백엔드용)
- DATABASE_URL: PostgreSQL 직접 연결 URL (선택)
"""
import os
import logging
from typing import Optional, Dict, List, Any
from datetime import datetime, date
from contextlib import contextmanager

logger = logging.getLogger(__name__)

# Supabase 설정
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")  # service_role key
DATABASE_URL = os.environ.get("DATABASE_URL", "")  # PostgreSQL 직접 연결

# 사용할 데이터베이스 타입 감지
USE_SUPABASE = bool(SUPABASE_URL and SUPABASE_KEY)
USE_POSTGRES = bool(DATABASE_URL)

# 필요한 라이브러리 import
if USE_SUPABASE:
    try:
        from supabase import create_client, Client
        supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
        logger.info("✅ Supabase client initialized")
    except ImportError:
        logger.warning("supabase-py not installed. Run: pip install supabase")
        supabase = None
elif USE_POSTGRES:
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
        logger.info("✅ PostgreSQL direct connection mode")
    except ImportError:
        logger.warning("psycopg2 not installed. Run: pip install psycopg2-binary")
        psycopg2 = None
else:
    logger.warning("⚠️ No database configured. Set SUPABASE_URL/KEY or DATABASE_URL")


class SupabaseClient:
    """Supabase/PostgreSQL 통합 데이터베이스 클라이언트"""

    def __init__(self):
        self.use_supabase = USE_SUPABASE
        self.use_postgres = USE_POSTGRES

    # ============ PostgreSQL 직접 연결 ============

    @contextmanager
    def get_pg_connection(self):
        """PostgreSQL 직접 연결"""
        if not USE_POSTGRES:
            raise Exception("DATABASE_URL not configured")

        conn = psycopg2.connect(DATABASE_URL)
        try:
            yield conn
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.close()

    def execute_pg_query(self, query: str, params: tuple = None) -> List[Dict]:
        """PostgreSQL 쿼리 실행"""
        with self.get_pg_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute(query, params)
                if query.strip().upper().startswith("SELECT"):
                    return [dict(row) for row in cursor.fetchall()]
                return []

    # ============ Supabase 클라이언트 메서드 ============

    def _table(self, table_name: str):
        """Supabase 테이블 접근"""
        if not supabase:
            raise Exception("Supabase client not available")
        return supabase.table(table_name)

    # ============ Users ============

    def get_user_by_email(self, email: str) -> Optional[Dict]:
        """이메일로 사용자 조회"""
        if self.use_supabase:
            response = self._table("users").select("*").eq("email", email).execute()
            return response.data[0] if response.data else None
        elif self.use_postgres:
            result = self.execute_pg_query(
                "SELECT * FROM users WHERE email = %s", (email,)
            )
            return result[0] if result else None
        return None

    def get_user_by_id(self, user_id: int) -> Optional[Dict]:
        """ID로 사용자 조회"""
        if self.use_supabase:
            response = self._table("users").select("*").eq("id", user_id).execute()
            return response.data[0] if response.data else None
        elif self.use_postgres:
            result = self.execute_pg_query(
                "SELECT * FROM users WHERE id = %s", (user_id,)
            )
            return result[0] if result else None
        return None

    def create_user(self, email: str, hashed_password: str, name: str = None) -> int:
        """사용자 생성"""
        if self.use_supabase:
            response = self._table("users").insert({
                "email": email,
                "hashed_password": hashed_password,
                "name": name
            }).execute()
            return response.data[0]["id"] if response.data else None
        elif self.use_postgres:
            with self.get_pg_connection() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                    cursor.execute(
                        """INSERT INTO users (email, hashed_password, name)
                           VALUES (%s, %s, %s) RETURNING id""",
                        (email, hashed_password, name)
                    )
                    return cursor.fetchone()["id"]
        return None

    def update_user(self, user_id: int, **kwargs) -> bool:
        """사용자 정보 업데이트"""
        kwargs['updated_at'] = datetime.now().isoformat()

        if self.use_supabase:
            response = self._table("users").update(kwargs).eq("id", user_id).execute()
            return len(response.data) > 0
        elif self.use_postgres:
            set_clause = ", ".join([f"{k} = %s" for k in kwargs.keys()])
            values = list(kwargs.values()) + [user_id]
            with self.get_pg_connection() as conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        f"UPDATE users SET {set_clause} WHERE id = %s",
                        values
                    )
                    return cursor.rowcount > 0
        return False

    def get_all_users(self, limit: int = 100, offset: int = 0) -> List[Dict]:
        """모든 사용자 조회"""
        if self.use_supabase:
            response = (self._table("users")
                       .select("*")
                       .order("created_at", desc=True)
                       .range(offset, offset + limit - 1)
                       .execute())
            return response.data
        elif self.use_postgres:
            return self.execute_pg_query(
                """SELECT * FROM users ORDER BY created_at DESC LIMIT %s OFFSET %s""",
                (limit, offset)
            )
        return []

    # ============ Subscriptions ============

    def get_user_subscription(self, user_id: int) -> Optional[Dict]:
        """사용자 구독 정보 조회"""
        if self.use_supabase:
            response = self._table("subscriptions").select("*").eq("user_id", user_id).execute()
            return response.data[0] if response.data else None
        elif self.use_postgres:
            result = self.execute_pg_query(
                "SELECT * FROM subscriptions WHERE user_id = %s", (user_id,)
            )
            return result[0] if result else None
        return None

    def create_or_update_subscription(self, user_id: int, plan_type: str = "free",
                                       expires_at: str = None) -> Dict:
        """구독 생성 또는 업데이트"""
        if self.use_supabase:
            # Upsert
            response = self._table("subscriptions").upsert({
                "user_id": user_id,
                "plan_type": plan_type,
                "expires_at": expires_at,
                "updated_at": datetime.now().isoformat()
            }).execute()
            return response.data[0] if response.data else None
        elif self.use_postgres:
            with self.get_pg_connection() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                    cursor.execute(
                        """INSERT INTO subscriptions (user_id, plan_type, expires_at)
                           VALUES (%s, %s, %s)
                           ON CONFLICT (user_id) DO UPDATE SET
                               plan_type = EXCLUDED.plan_type,
                               expires_at = EXCLUDED.expires_at,
                               updated_at = NOW()
                           RETURNING *""",
                        (user_id, plan_type, expires_at)
                    )
                    return dict(cursor.fetchone())
        return None

    # ============ Payments ============

    def create_payment(self, user_id: int, order_id: str, amount: int,
                       payment_key: str = None, status: str = "pending") -> Dict:
        """결제 내역 생성"""
        if self.use_supabase:
            response = self._table("payments").insert({
                "user_id": user_id,
                "order_id": order_id,
                "amount": amount,
                "payment_key": payment_key,
                "status": status
            }).execute()
            return response.data[0] if response.data else None
        elif self.use_postgres:
            with self.get_pg_connection() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                    cursor.execute(
                        """INSERT INTO payments (user_id, order_id, amount, payment_key, status)
                           VALUES (%s, %s, %s, %s, %s) RETURNING *""",
                        (user_id, order_id, amount, payment_key, status)
                    )
                    return dict(cursor.fetchone())
        return None

    def update_payment(self, order_id: str, payment_key: str, status: str,
                       payment_method: str = None, card_company: str = None,
                       card_number: str = None, receipt_url: str = None) -> bool:
        """결제 상태 업데이트"""
        update_data = {
            "payment_key": payment_key,
            "status": status,
            "payment_method": payment_method,
            "card_company": card_company,
            "card_number": card_number,
            "receipt_url": receipt_url,
        }
        if status == "completed":
            update_data["paid_at"] = datetime.now().isoformat()

        if self.use_supabase:
            response = self._table("payments").update(update_data).eq("order_id", order_id).execute()
            return len(response.data) > 0
        elif self.use_postgres:
            set_parts = []
            values = []
            for k, v in update_data.items():
                if v is not None:
                    set_parts.append(f"{k} = %s")
                    values.append(v)
            values.append(order_id)

            with self.get_pg_connection() as conn:
                with conn.cursor() as cursor:
                    cursor.execute(
                        f"UPDATE payments SET {', '.join(set_parts)} WHERE order_id = %s",
                        values
                    )
                    return cursor.rowcount > 0
        return False

    def get_payment_history(self, user_id: int, limit: int = 10) -> List[Dict]:
        """결제 내역 조회"""
        if self.use_supabase:
            response = (self._table("payments")
                       .select("*")
                       .eq("user_id", user_id)
                       .order("created_at", desc=True)
                       .limit(limit)
                       .execute())
            return response.data
        elif self.use_postgres:
            return self.execute_pg_query(
                """SELECT * FROM payments WHERE user_id = %s
                   ORDER BY created_at DESC LIMIT %s""",
                (user_id, limit)
            )
        return []

    # ============ Daily Usage ============

    def get_today_usage(self, user_id: int) -> Dict:
        """오늘 사용량 조회"""
        today = date.today().isoformat()

        if self.use_supabase:
            response = (self._table("daily_usage")
                       .select("*")
                       .eq("user_id", user_id)
                       .eq("date", today)
                       .execute())
            if response.data:
                return response.data[0]
        elif self.use_postgres:
            result = self.execute_pg_query(
                "SELECT * FROM daily_usage WHERE user_id = %s AND date = %s",
                (user_id, today)
            )
            if result:
                return result[0]

        return {
            "user_id": user_id,
            "date": today,
            "keyword_searches": 0,
            "blog_analyses": 0
        }

    def increment_usage(self, user_id: int, usage_type: str) -> Dict:
        """사용량 증가"""
        today = date.today().isoformat()
        column = "keyword_searches" if usage_type == "keyword_search" else "blog_analyses"

        if self.use_supabase:
            # Upsert with increment
            response = supabase.rpc("increment_usage", {
                "p_user_id": user_id,
                "p_date": today,
                "p_column": column
            }).execute()
            return self.get_today_usage(user_id)
        elif self.use_postgres:
            with self.get_pg_connection() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                    cursor.execute(
                        f"""INSERT INTO daily_usage (user_id, date, {column})
                           VALUES (%s, %s, 1)
                           ON CONFLICT (user_id, date) DO UPDATE SET
                               {column} = daily_usage.{column} + 1,
                               updated_at = NOW()
                           RETURNING *""",
                        (user_id, today)
                    )
                    return dict(cursor.fetchone())
        return self.get_today_usage(user_id)

    # ============ Posts (Community) ============

    def create_post(self, user_id: int, title: str, content: str,
                    category: str = "free", tags: list = None) -> int:
        """게시글 작성"""
        if self.use_supabase:
            response = self._table("posts").insert({
                "user_id": user_id,
                "title": title,
                "content": content,
                "category": category,
                "tags": tags
            }).execute()
            return response.data[0]["id"] if response.data else None
        elif self.use_postgres:
            import json
            with self.get_pg_connection() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                    cursor.execute(
                        """INSERT INTO posts (user_id, title, content, category, tags)
                           VALUES (%s, %s, %s, %s, %s) RETURNING id""",
                        (user_id, title, content, category, json.dumps(tags) if tags else None)
                    )
                    return cursor.fetchone()["id"]
        return None

    def get_posts(self, category: str = None, limit: int = 20, offset: int = 0) -> List[Dict]:
        """게시글 목록 조회"""
        if self.use_supabase:
            query = (self._table("posts")
                    .select("*")
                    .eq("is_deleted", False)
                    .order("is_pinned", desc=True)
                    .order("created_at", desc=True))

            if category:
                query = query.eq("category", category)

            response = query.range(offset, offset + limit - 1).execute()
            return response.data
        elif self.use_postgres:
            if category:
                return self.execute_pg_query(
                    """SELECT * FROM posts WHERE is_deleted = FALSE AND category = %s
                       ORDER BY is_pinned DESC, created_at DESC LIMIT %s OFFSET %s""",
                    (category, limit, offset)
                )
            return self.execute_pg_query(
                """SELECT * FROM posts WHERE is_deleted = FALSE
                   ORDER BY is_pinned DESC, created_at DESC LIMIT %s OFFSET %s""",
                (limit, offset)
            )
        return []


# Singleton 인스턴스
_supabase_client: Optional[SupabaseClient] = None


def get_supabase_client() -> SupabaseClient:
    """SupabaseClient 싱글톤 반환"""
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = SupabaseClient()
    return _supabase_client


# ============ Supabase RPC Functions ============
# 아래 함수들은 Supabase에서 생성해야 함

SUPABASE_RPC_FUNCTIONS = """
-- Supabase에서 아래 SQL을 실행하세요:

-- 사용량 증가 함수
CREATE OR REPLACE FUNCTION increment_usage(
    p_user_id INTEGER,
    p_date DATE,
    p_column TEXT
) RETURNS VOID AS $$
BEGIN
    IF p_column = 'keyword_searches' THEN
        INSERT INTO daily_usage (user_id, date, keyword_searches)
        VALUES (p_user_id, p_date, 1)
        ON CONFLICT (user_id, date) DO UPDATE SET
            keyword_searches = daily_usage.keyword_searches + 1,
            updated_at = NOW();
    ELSE
        INSERT INTO daily_usage (user_id, date, blog_analyses)
        VALUES (p_user_id, p_date, 1)
        ON CONFLICT (user_id, date) DO UPDATE SET
            blog_analyses = daily_usage.blog_analyses + 1,
            updated_at = NOW();
    END IF;
END;
$$ LANGUAGE plpgsql;
"""
