from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from utils.auth import decode_access_token
from models.user import User, TokenData
from database.user_db_sync import UserDatabase

# Security scheme
security = HTTPBearer()


def get_user_db():
    """Dependency to get UserDatabase instance"""
    return UserDatabase()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    user_db: UserDatabase = Depends(get_user_db)
) -> User:
    """
    Dependency to get the current authenticated user.

    Validates the JWT token and returns the user from the database.
    """
    token = credentials.credentials

    # Decode the token
    payload = decode_access_token(token)

    # Extract user data from token
    user_id: str = payload.get("id")
    email: str = payload.get("email")

    if user_id is None or email is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Get user from database
    user = user_db.get_user_by_id(user_id)

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )

    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    Dependency to get the current active user.

    Ensures the user is both authenticated and active.
    """
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )
    return current_user


def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(HTTPBearer(auto_error=False)),
) -> Optional[str]:
    """
    Optional authentication - returns user_id if authenticated, None otherwise.

    Use this for endpoints that work both with and without authentication.
    """
    if credentials is None:
        return None

    try:
        payload = decode_access_token(credentials.credentials)
        return payload.get("id")
    except HTTPException:
        return None
