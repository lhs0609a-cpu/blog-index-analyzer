"""
동기 버전의 User Database (SQLite 사용)
"""
import uuid
from datetime import datetime
from typing import Optional
from models.user import User, UserCreate, UserResponse
from utils.auth import get_password_hash
from database.sqlite_db import get_sqlite_client


class UserDatabase:
    """User database operations (sync version with SQLite)"""

    def __init__(self):
        self.db = get_sqlite_client()

    def _get_connection(self):
        """Get database connection"""
        return self.db.get_connection()

    def create_user(self, user_data: UserCreate) -> UserResponse:
        """Create a new user"""
        hashed_password = get_password_hash(user_data.password)

        insert_query = """
            INSERT INTO users (email, name, password_hash, is_active, is_verified)
            VALUES (?, ?, ?, ?, ?)
        """

        select_query = """
            SELECT id, email, name, is_active, is_verified, created_at
            FROM users WHERE id = ?
        """

        try:
            with self._get_connection() as conn:
                cur = conn.cursor()
                cur.execute(
                    insert_query,
                    (user_data.email, user_data.name, hashed_password, True, False)
                )
                user_id = cur.lastrowid

                cur.execute(select_query, (user_id,))
                row = cur.fetchone()

                return UserResponse(
                    id=str(row[0]),
                    email=row[1],
                    name=row[2],
                    is_active=row[3],
                    is_verified=row[4],
                    created_at=row[5]
                )
        except Exception as e:
            if "UNIQUE constraint failed" in str(e):
                raise ValueError("User with this email already exists")
            raise

    def get_user_by_email(self, email: str) -> Optional[User]:
        """Get user by email"""
        query = """
            SELECT id, email, name, password_hash, is_active, is_verified, created_at, updated_at
            FROM users
            WHERE email = ?
        """

        with self._get_connection() as conn:
            cur = conn.cursor()
            cur.execute(query, (email,))
            row = cur.fetchone()

            if row:
                return User(
                    id=str(row[0]),
                    email=row[1],
                    name=row[2],
                    hashed_password=row[3],
                    is_active=row[4],
                    is_verified=row[5],
                    created_at=row[6],
                    updated_at=row[7]
                )

            return None

    def get_user_by_id(self, user_id: str) -> Optional[User]:
        """Get user by ID"""
        query = """
            SELECT id, email, name, password_hash, is_active, is_verified, created_at, updated_at
            FROM users
            WHERE id = ?
        """

        with self._get_connection() as conn:
            cur = conn.cursor()
            cur.execute(query, (int(user_id),))
            row = cur.fetchone()

            if row:
                return User(
                    id=str(row[0]),
                    email=row[1],
                    name=row[2],
                    hashed_password=row[3],
                    is_active=row[4],
                    is_verified=row[5],
                    created_at=row[6],
                    updated_at=row[7]
                )

            return None

    def update_user(self, user_id: str, name: Optional[str] = None, hashed_password: Optional[str] = None) -> Optional[UserResponse]:
        """Update user information"""
        updates = []
        params = []

        if name:
            updates.append("name = ?")
            params.append(name)

        if hashed_password:
            updates.append("password_hash = ?")
            params.append(hashed_password)

        if not updates:
            return None

        updates.append("updated_at = ?")
        params.append(datetime.utcnow())
        params.append(int(user_id))

        update_query = f"""
            UPDATE users
            SET {', '.join(updates)}
            WHERE id = ?
        """

        select_query = """
            SELECT id, email, name, is_active, is_verified, created_at
            FROM users WHERE id = ?
        """

        with self._get_connection() as conn:
            cur = conn.cursor()
            cur.execute(update_query, tuple(params))

            if cur.rowcount > 0:
                cur.execute(select_query, (int(user_id),))
                row = cur.fetchone()

                if row:
                    return UserResponse(
                        id=str(row[0]),
                        email=row[1],
                        name=row[2],
                        is_active=row[3],
                        is_verified=row[4],
                        created_at=row[5]
                    )

            return None

    def delete_user(self, user_id: str) -> bool:
        """Delete user (soft delete - mark as inactive)"""
        query = """
            UPDATE users
            SET is_active = 0, updated_at = ?
            WHERE id = ?
        """

        with self._get_connection() as conn:
            cur = conn.cursor()
            cur.execute(query, (datetime.utcnow(), int(user_id)))
            return cur.rowcount > 0
