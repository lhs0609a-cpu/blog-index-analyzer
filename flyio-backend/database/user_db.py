"""
User database module for authentication
"""
import sqlite3
from contextlib import contextmanager
from typing import Optional, Dict, List
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
                    is_admin BOOLEAN DEFAULT 0,
                    is_premium_granted BOOLEAN DEFAULT 0,
                    plan TEXT DEFAULT 'free',
                    subscription_expires_at TIMESTAMP,
                    granted_by INTEGER,
                    granted_at TIMESTAMP,
                    memo TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)")
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_plan ON users(plan)")

            # Add columns if they don't exist (for existing databases)
            try:
                cursor.execute("ALTER TABLE users ADD COLUMN is_admin BOOLEAN DEFAULT 0")
            except:
                pass
            try:
                cursor.execute("ALTER TABLE users ADD COLUMN is_premium_granted BOOLEAN DEFAULT 0")
            except:
                pass
            try:
                cursor.execute("ALTER TABLE users ADD COLUMN subscription_expires_at TIMESTAMP")
            except:
                pass
            try:
                cursor.execute("ALTER TABLE users ADD COLUMN granted_by INTEGER")
            except:
                pass
            try:
                cursor.execute("ALTER TABLE users ADD COLUMN granted_at TIMESTAMP")
            except:
                pass
            try:
                cursor.execute("ALTER TABLE users ADD COLUMN memo TEXT")
            except:
                pass

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

    # ============ Admin Methods ============

    def get_all_users(self, limit: int = 100, offset: int = 0) -> List[Dict]:
        """Get all users for admin dashboard"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """SELECT id, email, name, blog_id, is_active, is_verified, is_admin,
                          is_premium_granted, plan, subscription_expires_at,
                          granted_by, granted_at, memo, created_at, updated_at
                   FROM users
                   ORDER BY created_at DESC
                   LIMIT ? OFFSET ?""",
                (limit, offset)
            )
            return [dict(row) for row in cursor.fetchall()]

    def get_users_count(self) -> int:
        """Get total users count"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) as count FROM users")
            return cursor.fetchone()['count']

    def get_premium_users(self) -> List[Dict]:
        """Get all premium users (paid or granted)"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """SELECT id, email, name, plan, is_premium_granted,
                          subscription_expires_at, granted_by, granted_at, memo, created_at
                   FROM users
                   WHERE plan IN ('basic', 'pro', 'unlimited') OR is_premium_granted = 1
                   ORDER BY created_at DESC"""
            )
            return [dict(row) for row in cursor.fetchall()]

    def grant_premium(self, user_id: int, admin_id: int, plan: str = 'unlimited', memo: str = None) -> bool:
        """Grant premium access to a user"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """UPDATE users
                   SET is_premium_granted = 1,
                       plan = ?,
                       granted_by = ?,
                       granted_at = CURRENT_TIMESTAMP,
                       memo = ?,
                       updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?""",
                (plan, admin_id, memo, user_id)
            )
            return cursor.rowcount > 0

    def revoke_premium(self, user_id: int) -> bool:
        """Revoke premium access from a user"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """UPDATE users
                   SET is_premium_granted = 0,
                       plan = 'free',
                       granted_by = NULL,
                       granted_at = NULL,
                       memo = NULL,
                       updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?""",
                (user_id,)
            )
            return cursor.rowcount > 0

    def extend_subscription(self, user_id: int, days: int, admin_id: int, memo: str = None) -> Dict:
        """
        Extend subscription expiration date

        Args:
            user_id: Target user ID
            days: Number of days to extend
            admin_id: Admin who is extending
            memo: Optional memo

        Returns:
            Dict with old_expiry, new_expiry, success
        """
        from datetime import timedelta

        with self.get_connection() as conn:
            cursor = conn.cursor()

            # Get current user
            cursor.execute("SELECT subscription_expires_at, email FROM users WHERE id = ?", (user_id,))
            row = cursor.fetchone()
            if not row:
                return {"success": False, "error": "User not found"}

            old_expiry = row['subscription_expires_at']

            # Calculate new expiry date
            # If no current expiry or expired, start from today
            if old_expiry:
                try:
                    current_expiry = datetime.fromisoformat(old_expiry.replace('Z', '+00:00').replace('+00:00', ''))
                except:
                    current_expiry = datetime.now()
            else:
                current_expiry = datetime.now()

            # Use the later of current_expiry or today
            base_date = max(current_expiry, datetime.now())
            new_expiry = base_date + timedelta(days=days)

            # Update user
            update_memo = memo if memo else f"구독 {days}일 연장"
            cursor.execute(
                """UPDATE users
                   SET subscription_expires_at = ?,
                       memo = ?,
                       updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?""",
                (new_expiry.isoformat(), update_memo, user_id)
            )

            return {
                "success": True,
                "user_id": user_id,
                "old_expiry": old_expiry,
                "new_expiry": new_expiry.isoformat(),
                "days_extended": days
            }

    def set_admin(self, user_id: int, is_admin: bool) -> bool:
        """Set admin status for a user"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE users SET is_admin = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (1 if is_admin else 0, user_id)
            )
            return cursor.rowcount > 0

    def search_users(self, query: str) -> List[Dict]:
        """Search users by email or name"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            search_term = f"%{query}%"
            cursor.execute(
                """SELECT id, email, name, plan, is_premium_granted, is_admin, created_at
                   FROM users
                   WHERE email LIKE ? OR name LIKE ?
                   ORDER BY created_at DESC
                   LIMIT 50""",
                (search_term, search_term)
            )
            return [dict(row) for row in cursor.fetchall()]

    def get_user_effective_plan(self, user_id: int) -> str:
        """Get user's effective plan (considering admin and granted premium)"""
        user = self.get_user_by_id(user_id)
        if not user:
            return 'guest'

        # Admin users always have unlimited access
        if user.get('is_admin'):
            return 'unlimited'

        # Users with granted premium access
        if user.get('is_premium_granted'):
            return user.get('plan', 'unlimited')

        # Check subscription expiry
        expires_at = user.get('subscription_expires_at')
        if expires_at:
            from datetime import datetime
            try:
                expiry = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
                if expiry < datetime.now():
                    return 'free'
            except:
                pass

        return user.get('plan', 'free')

    def get_expiring_users(self, days: int = 7) -> List[Dict]:
        """Get users whose subscription expires within N days"""
        from datetime import timedelta

        now = datetime.now()
        future = now + timedelta(days=days)

        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """SELECT id, email, name, plan, is_premium_granted,
                          subscription_expires_at, granted_by, memo, created_at
                   FROM users
                   WHERE subscription_expires_at IS NOT NULL
                     AND subscription_expires_at >= ?
                     AND subscription_expires_at <= ?
                     AND (plan != 'free' OR is_premium_granted = 1)
                   ORDER BY subscription_expires_at ASC""",
                (now.isoformat(), future.isoformat())
            )
            return [dict(row) for row in cursor.fetchall()]

    def get_subscription_stats(self) -> Dict:
        """Get subscription statistics for admin dashboard"""
        from datetime import timedelta

        now = datetime.now()
        today = now.date()
        week_ago = (now - timedelta(days=7)).date()

        with self.get_connection() as conn:
            cursor = conn.cursor()

            # Plan distribution
            cursor.execute("""
                SELECT plan, COUNT(*) as count
                FROM users
                GROUP BY plan
            """)
            plan_distribution = {row['plan']: row['count'] for row in cursor.fetchall()}

            # Daily signups (last 7 days)
            cursor.execute("""
                SELECT DATE(created_at) as signup_date, COUNT(*) as count
                FROM users
                WHERE DATE(created_at) >= ?
                GROUP BY DATE(created_at)
                ORDER BY signup_date ASC
            """, (week_ago.isoformat(),))
            daily_signups = [{"date": row['signup_date'], "count": row['count']} for row in cursor.fetchall()]

            # Today's signups
            cursor.execute("""
                SELECT COUNT(*) as count FROM users WHERE DATE(created_at) = ?
            """, (today.isoformat(),))
            today_signups = cursor.fetchone()['count']

            # Expiring soon (7 days)
            future = now + timedelta(days=7)
            cursor.execute("""
                SELECT COUNT(*) as count FROM users
                WHERE subscription_expires_at IS NOT NULL
                  AND subscription_expires_at >= ?
                  AND subscription_expires_at <= ?
            """, (now.isoformat(), future.isoformat()))
            expiring_soon = cursor.fetchone()['count']

            # Expired count
            cursor.execute("""
                SELECT COUNT(*) as count FROM users
                WHERE subscription_expires_at IS NOT NULL
                  AND subscription_expires_at < ?
                  AND plan != 'free'
            """, (now.isoformat(),))
            expired = cursor.fetchone()['count']

            return {
                "plan_distribution": plan_distribution,
                "daily_signups": daily_signups,
                "today_signups": today_signups,
                "expiring_soon": expiring_soon,
                "expired": expired
            }

    def get_all_users_with_usage(self, limit: int = 100, offset: int = 0) -> List[Dict]:
        """Get all users with remaining days calculation"""
        users = self.get_all_users(limit=limit, offset=offset)

        now = datetime.now()

        for user in users:
            # Calculate remaining days
            expires_at = user.get('subscription_expires_at')
            if expires_at and user.get('plan') != 'free':
                try:
                    expiry = datetime.fromisoformat(expires_at.replace('Z', '+00:00').replace('+00:00', ''))
                    remaining = (expiry - now).days
                    user['remaining_days'] = max(0, remaining)
                except:
                    user['remaining_days'] = None
            else:
                user['remaining_days'] = None

        return users


# Singleton instance
_user_db: Optional[UserDB] = None


def get_user_db() -> UserDB:
    """Get UserDB singleton"""
    global _user_db
    if _user_db is None:
        _user_db = UserDB()
    return _user_db
