import uuid
from datetime import datetime
from typing import Optional
import asyncpg
from models.user import User, UserCreate, UserResponse
from utils.auth import get_password_hash
from database.postgres import PostgresClient


class UserDatabase:
    """User database operations"""

    def __init__(self, db_client: PostgresClient):
        self.db = db_client

    async def create_user(self, user_data: UserCreate) -> UserResponse:
        """Create a new user"""
        hashed_password = get_password_hash(user_data.password)

        query = """
            INSERT INTO users (email, name, password_hash, is_active, is_verified)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, email, name, is_active, is_verified, created_at
        """

        try:
            async with self.db.pool.acquire() as conn:
                row = await conn.fetchrow(
                    query,
                    user_data.email,
                    user_data.name,
                    hashed_password,
                    True,  # is_active
                    False,  # is_verified
                )

                return UserResponse(
                    id=str(row['id']),
                    email=row['email'],
                    name=row['name'],
                    is_active=row['is_active'],
                    is_verified=row['is_verified'],
                    created_at=row['created_at']
                )
        except asyncpg.UniqueViolationError:
            raise ValueError("User with this email already exists")

    async def get_user_by_email(self, email: str) -> Optional[User]:
        """Get user by email"""
        query = """
            SELECT id, email, name, password_hash as hashed_password, is_active, is_verified, created_at, updated_at
            FROM users
            WHERE email = $1
        """

        async with self.db.pool.acquire() as conn:
            row = await conn.fetchrow(query, email)

            if row:
                return User(
                    id=str(row['id']),
                    email=row['email'],
                    name=row['name'],
                    hashed_password=row['hashed_password'],
                    is_active=row['is_active'],
                    is_verified=row['is_verified'],
                    created_at=row['created_at'],
                    updated_at=row['updated_at']
                )

            return None

    async def get_user_by_id(self, user_id: str) -> Optional[User]:
        """Get user by ID"""
        query = """
            SELECT id, email, name, password_hash as hashed_password, is_active, is_verified, created_at, updated_at
            FROM users
            WHERE id = $1
        """

        async with self.db.pool.acquire() as conn:
            row = await conn.fetchrow(query, int(user_id))

            if row:
                return User(
                    id=str(row['id']),
                    email=row['email'],
                    name=row['name'],
                    hashed_password=row['hashed_password'],
                    is_active=row['is_active'],
                    is_verified=row['is_verified'],
                    created_at=row['created_at'],
                    updated_at=row['updated_at']
                )

            return None

    async def update_user(self, user_id: str, name: Optional[str] = None, hashed_password: Optional[str] = None) -> Optional[UserResponse]:
        """Update user information"""
        updates = []
        params = []
        param_count = 1

        if name:
            updates.append(f"name = ${param_count}")
            params.append(name)
            param_count += 1

        if hashed_password:
            updates.append(f"password_hash = ${param_count}")
            params.append(hashed_password)
            param_count += 1

        if not updates:
            return None

        updates.append(f"updated_at = ${param_count}")
        params.append(datetime.utcnow())
        param_count += 1

        params.append(int(user_id))

        query = f"""
            UPDATE users
            SET {', '.join(updates)}
            WHERE id = ${param_count}
            RETURNING id, email, name, is_active, is_verified, created_at
        """

        async with self.db.pool.acquire() as conn:
            row = await conn.fetchrow(query, *params)

            if row:
                return UserResponse(
                    id=str(row['id']),
                    email=row['email'],
                    name=row['name'],
                    is_active=row['is_active'],
                    is_verified=row['is_verified'],
                    created_at=row['created_at']
                )

            return None

    async def delete_user(self, user_id: str) -> bool:
        """Delete user (soft delete - mark as inactive)"""
        query = """
            UPDATE users
            SET is_active = FALSE, updated_at = $1
            WHERE id = $2
            RETURNING id
        """

        async with self.db.pool.acquire() as conn:
            row = await conn.fetchrow(query, datetime.utcnow(), int(user_id))
            return row is not None
