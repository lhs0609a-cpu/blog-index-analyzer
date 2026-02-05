"""
Authentication router with JWT token support
"""
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, Field
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
    password: str = Field(..., min_length=8, max_length=128, description="비밀번호 (8-128자)")
    name: Optional[str] = Field(None, max_length=50, description="이름 (최대 50자)")


class LoginRequest(BaseModel):
    email: str = Field(..., max_length=254, description="이메일")
    password: str = Field(..., min_length=1, max_length=128, description="비밀번호")


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
    is_admin: bool
    created_at: str


class UpdateUserRequest(BaseModel):
    name: Optional[str] = Field(None, max_length=50, description="이름 (최대 50자)")
    blog_id: Optional[str] = Field(None, max_length=50, description="블로그 ID (최대 50자)")


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
        logger.warning("No token provided")
        raise credentials_exception

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id: int = payload.get("sub")
        logger.info(f"Token decoded successfully, user_id: {user_id}")
        if user_id is None:
            logger.warning("No user_id in token payload")
            raise credentials_exception
    except JWTError as e:
        logger.warning(f"JWT decode error: {e}, token prefix: {token[:20] if len(token) > 20 else token}...")
        raise credentials_exception

    user_db = get_user_db()
    user = user_db.get_user_by_id(int(user_id))
    if user is None:
        logger.warning(f"User not found for id: {user_id}")
        raise credentials_exception

    if not user.get("is_active"):
        raise HTTPException(status_code=400, detail="Inactive user")

    logger.info(f"User authenticated: {user.get('email')}, is_admin: {user.get('is_admin')}")
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
        "is_admin": bool(user.get("is_admin", False)),
        "is_premium_granted": bool(user.get("is_premium_granted", False)),
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
            detail="이미 가입된 이메일입니다. 로그인을 진행해주세요."
        )

    # Validate password
    if len(request.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="비밀번호는 최소 6자 이상이어야 합니다."
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
            detail="회원가입 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요."
        )

    # Get created user
    user = user_db.get_user_by_id(user_id)

    # Create access token
    access_token = create_access_token(data={"sub": str(user_id)})

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
            detail="등록되지 않은 이메일입니다. 회원가입을 먼저 진행해주세요.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify password
    if not verify_password(request.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="비밀번호가 올바르지 않습니다. 다시 확인해주세요.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if user is active
    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="비활성화된 계정입니다. 관리자에게 문의해주세요."
        )

    # Create access token
    access_token = create_access_token(data={"sub": str(user["id"])})

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


@router.post("/make-first-admin")
async def make_first_admin(email: str):
    """
    첫 번째 관리자 설정 (관리자가 없을 때만 작동)
    보안: 기존 관리자가 있으면 실패
    """
    user_db = get_user_db()

    # 기존 관리자 확인
    with user_db.get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM users WHERE is_admin = 1")
        admin_count = cursor.fetchone()[0]

        if admin_count > 0:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="관리자가 이미 존재합니다. 이 엔드포인트는 사용할 수 없습니다."
            )

    # 사용자 찾기
    user = user_db.get_user_by_email(email)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"사용자를 찾을 수 없습니다: {email}"
        )

    # 관리자로 설정
    success = user_db.set_admin(user['id'], True)
    if success:
        logger.info(f"First admin setup: {email} is now admin")
        return {
            "message": f"{email} 계정이 관리자로 설정되었습니다",
            "user_id": user['id']
        }

    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="관리자 설정에 실패했습니다"
    )
