from fastapi import APIRouter, Depends, HTTPException, status
from models.user import UserCreate, UserLogin, Token, UserResponse, UserUpdate, User
from database.user_db_sync import UserDatabase
from utils.auth import verify_password, create_access_token, get_password_hash
from middleware.auth import get_current_user, get_current_active_user

router = APIRouter(tags=["Authentication"])


def get_user_db():
    """Dependency to get UserDatabase instance"""
    return UserDatabase()


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(
    user_data: UserCreate,
    user_db: UserDatabase = Depends(get_user_db)
):
    """
    Register a new user.

    Creates a new user account and returns an access token.
    """

    # Check if user already exists
    existing_user = user_db.get_user_by_email(user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Create user
    try:
        new_user = user_db.create_user(user_data)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

    # Create access token
    access_token = create_access_token(
        data={"id": new_user.id, "email": new_user.email}
    )

    return Token(
        access_token=access_token,
        token_type="bearer",
        user=new_user
    )


@router.post("/login", response_model=Token)
def login(
    credentials: UserLogin,
    user_db: UserDatabase = Depends(get_user_db)
):
    """
    Login with email and password.

    Returns an access token if credentials are valid.
    """
    # Get user by email
    user = user_db.get_user_by_email(credentials.email)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify password
    if not verify_password(credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if user is active
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )

    # Create access token
    access_token = create_access_token(
        data={"id": user.id, "email": user.email}
    )

    return Token(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            is_active=user.is_active,
            is_verified=user.is_verified,
            created_at=user.created_at
        )
    )


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_active_user)):
    """
    Get current user information.

    Requires authentication.
    """
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        is_active=current_user.is_active,
        is_verified=current_user.is_verified,
        created_at=current_user.created_at
    )


@router.put("/me", response_model=UserResponse)
def update_me(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_active_user),
    user_db: UserDatabase = Depends(get_user_db)
):
    """
    Update current user information.

    Requires authentication.
    """
    # Prepare update data
    hashed_password = None
    if user_update.password:
        hashed_password = get_password_hash(user_update.password)

    # Update user
    updated_user = user_db.update_user(
        user_id=current_user.id,
        name=user_update.name,
        hashed_password=hashed_password
    )

    if not updated_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return updated_user


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(
    current_user: User = Depends(get_current_active_user),
    user_db: UserDatabase = Depends(get_user_db)
):
    """
    Delete current user account (soft delete).

    Requires authentication.
    """
    success = user_db.delete_user(current_user.id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return None
