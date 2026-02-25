from datetime import datetime, timezone
from typing import Optional, List
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt

from app.models.user import User
from app.schemas.user import (
    UserProfileUpdate,
    UserPublicProfile,
    UserPrivateProfile,
    UserProfileResponse,
    ProfileVisibility
)
from app.config import settings, JWT_ALGORITHM
from app.database import get_db

security = HTTPBearer()


class UserService:

    @staticmethod
    def verify_token(credentials: HTTPAuthorizationCredentials) -> UUID:
        """Verify JWT token and return user_id"""
        try:
            token = credentials.credentials
            payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[JWT_ALGORITHM])
            user_id = payload.get("sub")
            if user_id is None:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid token: no user ID"
                )
            return UUID(user_id)
        except JWTError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Invalid token: {str(e)}"
            )

    @staticmethod
    async def get_current_user(
        credentials: HTTPAuthorizationCredentials = Depends(security),
        db: AsyncSession = Depends(get_db)
    ) -> User:
        """Get current authenticated user from token"""
        user_id = UserService.verify_token(credentials)
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        return user

    @staticmethod
    async def get_user_by_id(db: AsyncSession, user_id: UUID) -> Optional[User]:
        """Get user by ID"""
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def get_profile_with_visibility(
        db: AsyncSession,
        target_user_id: UUID,
        current_user: User
    ) -> UserProfileResponse:
        """Get user profile with appropriate visibility based on relationship"""

        target_user = await UserService.get_user_by_id(db, target_user_id)
        if not target_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        is_self = current_user.id == target_user_id

        # Determine visibility level and return appropriate profile
        if is_self:
            # User viewing their own profile - full access
            profile = UserPrivateProfile.model_validate(target_user)
            visibility = ProfileVisibility.PRIVATE
        else:
            # Random user - public access only
            profile = UserPublicProfile.model_validate(target_user)
            visibility = ProfileVisibility.PUBLIC

        return UserProfileResponse(
            profile=profile.model_dump(),
            visibility=visibility,
            is_self=is_self
        )

    @staticmethod
    async def update_profile(
        db: AsyncSession,
        current_user: User,
        update_data: UserProfileUpdate
    ) -> User:
        """Update user profile"""

        from app.models.user import AuthProvider

        # Only update fields that are provided
        if update_data.email is not None:
            if current_user.auth_provider != AuthProvider.EMAIL:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email can only be changed for email-authenticated accounts"
                )
            result = await db.execute(
                select(User).where(
                    User.email == update_data.email,
                    User.id != current_user.id
                )
            )
            existing = result.scalar_one_or_none()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already in use"
                )
            current_user.email = update_data.email

        if update_data.username is not None:
            result = await db.execute(
                select(User).where(
                    User.username == update_data.username,
                    User.id != current_user.id
                )
            )
            existing = result.scalar_one_or_none()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Username already taken"
                )
            current_user.username = update_data.username

        if update_data.first_name is not None:
            current_user.first_name = update_data.first_name

        if update_data.last_name is not None:
            current_user.last_name = update_data.last_name

        if update_data.language is not None:
            current_user.language = update_data.language

        if update_data.profile_picture is not None:
            current_user.profile_picture = update_data.profile_picture

        current_user.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(current_user)

        return current_user

    @staticmethod
    async def change_password(
        db: AsyncSession,
        current_user: User,
        current_password: str,
        new_password: str
    ) -> User:
        """Change user password (email auth only)"""
        from app.models.user import AuthProvider
        from app.services.auth_service import AuthService

        if current_user.auth_provider != AuthProvider.EMAIL:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Password can only be changed for email-authenticated accounts"
            )

        if not current_user.password_hash or not AuthService.verify_password(current_password, current_user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is incorrect"
            )

        current_user.password_hash = AuthService.hash_password(new_password)
        current_user.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(current_user)

        return current_user

    @staticmethod
    async def get_user_by_username(db: AsyncSession, username: str) -> Optional[User]:
        """Get user by username"""
        result = await db.execute(select(User).where(User.username == username))
        return result.scalar_one_or_none()
