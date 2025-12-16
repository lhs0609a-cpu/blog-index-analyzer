"""
Authentication router with JWT token support
"""
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
import logging

from database.user_db import get_user_db
from config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter()

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# OAuth2 scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


# Request/Response models
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None


class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: dict


class UserResponse(BaseModel):
    id: int
    email: str
    name: Optional[str]
    blog_id: Optional[str]
    plan: str
    is_active: bool
    is_verified: bool
    created_at: str


class UpdateUserRequest(BaseModel):
    name: Optional[str] = None
    blog_id: Optional[str] = None


# Helper functions
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token"""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


async def get_current_user_optional(token: Optional[str] = Depends(oauth2_scheme)) -> Optional[dict]:
    """Get current user from token (optional - returns None if no valid token)"""
    if not token:
        return None

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            return None
    except JWTError:
        return None

    user_db = get_user_db()
    user = user_db.get_user_by_id(int(user_id))
    if user is None or not user.get("is_active"):
        return None

    return user


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """Get current user from token (required - raises exception if no valid token)"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not token:
        raise credentials_exception

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: int = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user_db = get_user_db()
    user = user_db.get_user_by_id(int(user_id))
    if user is None:
        raise credentials_exception

    if not user.get("is_active"):
        raise HTTPException(status_code=400, detail="Inactive user")

    return user


def user_to_response(user: dict) -> dict:
    """Convert user dict to response format (exclude password)"""
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user.get("name"),
        "blog_id": user.get("blog_id"),
        "plan": user.get("plan", "free"),
        "is_active": bool(user.get("is_active", True)),
        "is_verified": bool(user.get("is_verified", False)),
        "created_at": str(user.get("created_at", ""))
    }


# Endpoints
@router.post("/register", response_model=TokenResponse)
async def register(request: RegisterRequest):
    """User registration endpoint"""
    user_db = get_user_db()

    # Check if user already exists
    existing_user = user_db.get_user_by_email(request.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Validate password
    if len(request.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters"
        )

    # Create user
    hashed_password = get_password_hash(request.password)
    try:
        user_id = user_db.create_user(
            email=request.email,
            hashed_password=hashed_password,
            name=request.name
        )
    except Exception as e:
        logger.error(f"Failed to create user: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create user"
        )

    # Get created user
    user = user_db.get_user_by_id(user_id)

    # Create access token
    access_token = create_access_token(data={"sub": user_id})

    logger.info(f"User registered: {request.email}")

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=user_to_response(user)
    )


@router.post("/login", response_model=TokenResponse)
async def login(request: LoginRequest):
    """User login endpoint"""
    user_db = get_user_db()

    # Get user
    user = user_db.get_user_by_email(request.email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify password
    if not verify_password(request.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if user is active
    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )

    # Create access token
    access_token = create_access_token(data={"sub": user["id"]})

    logger.info(f"User logged in: {request.email}")

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        user=user_to_response(user)
    )


@router.post("/login/form", response_model=TokenResponse)
async def login_form(form_data: OAuth2PasswordRequestForm = Depends()):
    """OAuth2 compatible login endpoint for form data"""
    return await login(LoginRequest(email=form_data.username, password=form_data.password))


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    """Get current user info"""
    return user_to_response(current_user)


@router.put("/me", response_model=UserResponse)
async def update_me(request: UpdateUserRequest, current_user: dict = Depends(get_current_user)):
    """Update current user info"""
    user_db = get_user_db()

    update_data = {}
    if request.name is not None:
        update_data["name"] = request.name
    if request.blog_id is not None:
        update_data["blog_id"] = request.blog_id

    if update_data:
        user_db.update_user(current_user["id"], **update_data)

    # Return updated user
    updated_user = user_db.get_user_by_id(current_user["id"])
    return user_to_response(updated_user)


@router.post("/logout")
async def logout():
    """Logout endpoint (client should discard token)"""
    return {"message": "Successfully logged out"}


@router.get("/verify-token")
async def verify_token(current_user: dict = Depends(get_current_user)):
    """Verify if the current token is valid"""
    return {
        "valid": True,
        "user": user_to_response(current_user)
    }
