from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.config import settings
from app.schemas.auth import (
    UserRegister,
    UserLogin,
    AuthResponse,
    Token,
    UserResponse,
    PasswordResetRequest,
    PasswordReset
)
from app.services.auth_service import AuthService

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(
    request: Request,
    user_data: UserRegister,
    db: AsyncSession = Depends(get_db)
):
    """
    Register a new user with email and password.

    - **email**: Valid email address
    - **username**: Unique username (3-50 characters)
    - **password**: Strong password (minimum 8 characters)

    Returns user info and JWT token.
    """
    # Create user and send verification email
    user = await AuthService.register_user(db, user_data)

    # Generate token
    access_token = AuthService.create_access_token(user.id)

    return AuthResponse(
        user=UserResponse.model_validate(user),
        token=Token(access_token=access_token)
    )

@router.post("/login", response_model=AuthResponse)
async def login(
    request: Request,
    login_data: UserLogin,
    db: AsyncSession = Depends(get_db)
):
    """
    Login with email and password.

    - **email**: Registered email address
    - **password**: Account password

    Returns user info and JWT token.
    """
    # Authenticate user
    user = await AuthService.login_user(db, login_data)

    # Generate token
    access_token = AuthService.create_access_token(user.id)

    return AuthResponse(
        user=UserResponse.model_validate(user),
        token=Token(access_token=access_token)
    )

@router.post("/forgot-password")
async def forgot_password(
    request: Request,
    pass_request: PasswordResetRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Request password reset email.

    - **email**: User's email address
    """
    await AuthService.forgot_password(db, pass_request.email)

    return {
        "message": "If the email exists, a password reset link has been sent."
    }

@router.post("/reset-password")
async def reset_password(
    request: Request,
    pass_reset: PasswordReset,
    db: AsyncSession = Depends(get_db)
):
    """
    Reset password with token.

    - **token**: Password reset token
    - **new_password**: New password (minimum 8 characters)
    """
    await AuthService.reset_password(db, pass_reset.token, pass_reset.new_password)

    return {
        "message": "Password has been reset successfully."
    }
