"""
Revenue database operations for storing user income data
"""
import logging
from datetime import datetime
from typing import Dict, List, Optional
from .sqlite_db import get_sqlite_client

logger = logging.getLogger(__name__)


def init_revenue_tables():
    """Initialize revenue tables"""
    client = get_sqlite_client()

    queries = [
        # 월별 수익 데이터 테이블
        """
        CREATE TABLE IF NOT EXISTS revenue_monthly (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            year INTEGER NOT NULL,
            month INTEGER NOT NULL,
            adpost_revenue INTEGER DEFAULT 0,
            adpost_clicks INTEGER DEFAULT 0,
            sponsorship_revenue INTEGER DEFAULT 0,
            sponsorship_count INTEGER DEFAULT 0,
            affiliate_revenue INTEGER DEFAULT 0,
            affiliate_clicks INTEGER DEFAULT 0,
            affiliate_conversions INTEGER DEFAULT 0,
            memo TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, year, month)
        )
        """,
        # 개별 수익 항목 테이블 (상세 기록용)
        """
        CREATE TABLE IF NOT EXISTS revenue_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            revenue_type TEXT NOT NULL,
            title TEXT NOT NULL,
            amount INTEGER NOT NULL,
            date TEXT NOT NULL,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """,
        "CREATE INDEX IF NOT EXISTS idx_revenue_monthly_user ON revenue_monthly(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_revenue_monthly_date ON revenue_monthly(year, month)",
        "CREATE INDEX IF NOT EXISTS idx_revenue_items_user ON revenue_items(user_id)",
        "CREATE INDEX IF NOT EXISTS idx_revenue_items_date ON revenue_items(date)"
    ]

    for query in queries:
        try:
            client.execute_query(query)
        except Exception as e:
            logger.warning(f"Error creating revenue table: {e}")

    logger.info("Revenue tables initialized")


def save_monthly_revenue(
    user_id: int,
    year: int,
    month: int,
    adpost_revenue: int = 0,
    adpost_clicks: int = 0,
    sponsorship_revenue: int = 0,
    sponsorship_count: int = 0,
    affiliate_revenue: int = 0,
    affiliate_clicks: int = 0,
    affiliate_conversions: int = 0,
    memo: str = ""
) -> bool:
    """Save or update monthly revenue data"""
    client = get_sqlite_client()

    try:
        # Check if record exists
        existing = client.execute_query(
            "SELECT id FROM revenue_monthly WHERE user_id = ? AND year = ? AND month = ?",
            (user_id, year, month)
        )

        if existing:
            # Update existing record
            client.execute_query(
                """
                UPDATE revenue_monthly SET
                    adpost_revenue = ?,
                    adpost_clicks = ?,
                    sponsorship_revenue = ?,
                    sponsorship_count = ?,
                    affiliate_revenue = ?,
                    affiliate_clicks = ?,
                    affiliate_conversions = ?,
                    memo = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND year = ? AND month = ?
                """,
                (adpost_revenue, adpost_clicks, sponsorship_revenue, sponsorship_count,
                 affiliate_revenue, affiliate_clicks, affiliate_conversions, memo,
                 user_id, year, month)
            )
        else:
            # Insert new record
            client.execute_query(
                """
                INSERT INTO revenue_monthly
                (user_id, year, month, adpost_revenue, adpost_clicks, sponsorship_revenue,
                 sponsorship_count, affiliate_revenue, affiliate_clicks, affiliate_conversions, memo)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (user_id, year, month, adpost_revenue, adpost_clicks, sponsorship_revenue,
                 sponsorship_count, affiliate_revenue, affiliate_clicks, affiliate_conversions, memo)
            )

        return True
    except Exception as e:
        logger.error(f"Error saving monthly revenue: {e}")
        return False


def get_monthly_revenue(user_id: int, year: int, month: int) -> Optional[Dict]:
    """Get monthly revenue data for specific month"""
    client = get_sqlite_client()

    try:
        result = client.execute_query(
            """
            SELECT * FROM revenue_monthly
            WHERE user_id = ? AND year = ? AND month = ?
            """,
            (user_id, year, month)
        )
        return result[0] if result else None
    except Exception as e:
        logger.error(f"Error getting monthly revenue: {e}")
        return None


def get_revenue_history(user_id: int, months: int = 12) -> List[Dict]:
    """Get revenue history for last N months"""
    client = get_sqlite_client()

    try:
        result = client.execute_query(
            """
            SELECT * FROM revenue_monthly
            WHERE user_id = ?
            ORDER BY year DESC, month DESC
            LIMIT ?
            """,
            (user_id, months)
        )
        return result
    except Exception as e:
        logger.error(f"Error getting revenue history: {e}")
        return []


def get_revenue_summary(user_id: int, year: int = None) -> Dict:
    """Get revenue summary statistics"""
    client = get_sqlite_client()

    try:
        if year:
            where_clause = "WHERE user_id = ? AND year = ?"
            params = (user_id, year)
        else:
            where_clause = "WHERE user_id = ?"
            params = (user_id,)

        result = client.execute_query(
            f"""
            SELECT
                COALESCE(SUM(adpost_revenue), 0) as total_adpost,
                COALESCE(SUM(sponsorship_revenue), 0) as total_sponsorship,
                COALESCE(SUM(affiliate_revenue), 0) as total_affiliate,
                COALESCE(SUM(adpost_revenue + sponsorship_revenue + affiliate_revenue), 0) as total_revenue,
                COALESCE(SUM(adpost_clicks), 0) as total_adpost_clicks,
                COALESCE(SUM(affiliate_clicks), 0) as total_affiliate_clicks,
                COALESCE(SUM(affiliate_conversions), 0) as total_conversions,
                COUNT(*) as months_recorded
            FROM revenue_monthly
            {where_clause}
            """,
            params
        )

        return result[0] if result else {
            "total_adpost": 0,
            "total_sponsorship": 0,
            "total_affiliate": 0,
            "total_revenue": 0,
            "total_adpost_clicks": 0,
            "total_affiliate_clicks": 0,
            "total_conversions": 0,
            "months_recorded": 0
        }
    except Exception as e:
        logger.error(f"Error getting revenue summary: {e}")
        return {}


def add_revenue_item(
    user_id: int,
    revenue_type: str,
    title: str,
    amount: int,
    date: str,
    description: str = ""
) -> int:
    """Add individual revenue item"""
    client = get_sqlite_client()

    try:
        return client.insert("revenue_items", {
            "user_id": user_id,
            "revenue_type": revenue_type,
            "title": title,
            "amount": amount,
            "date": date,
            "description": description
        })
    except Exception as e:
        logger.error(f"Error adding revenue item: {e}")
        return 0


def get_revenue_items(user_id: int, revenue_type: str = None, limit: int = 50) -> List[Dict]:
    """Get revenue items"""
    client = get_sqlite_client()

    try:
        if revenue_type:
            result = client.execute_query(
                """
                SELECT * FROM revenue_items
                WHERE user_id = ? AND revenue_type = ?
                ORDER BY date DESC
                LIMIT ?
                """,
                (user_id, revenue_type, limit)
            )
        else:
            result = client.execute_query(
                """
                SELECT * FROM revenue_items
                WHERE user_id = ?
                ORDER BY date DESC
                LIMIT ?
                """,
                (user_id, limit)
            )
        return result
    except Exception as e:
        logger.error(f"Error getting revenue items: {e}")
        return []


def delete_revenue_item(item_id: int, user_id: int) -> bool:
    """Delete a revenue item"""
    client = get_sqlite_client()

    try:
        client.execute_query(
            "DELETE FROM revenue_items WHERE id = ? AND user_id = ?",
            (item_id, user_id)
        )
        return True
    except Exception as e:
        logger.error(f"Error deleting revenue item: {e}")
        return False
