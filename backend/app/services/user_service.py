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

        # Only update fields that are provided
        if update_data.username is not None:
            # Check if username is already taken
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

        if update_data.profile_picture is not None:
            current_user.profile_picture = update_data.profile_picture

        current_user.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(current_user)

        return current_user

    @staticmethod
    async def get_user_by_username(db: AsyncSession, username: str) -> Optional[User]:
        """Get user by username"""
        result = await db.execute(select(User).where(User.username == username))
        return result.scalar_one_or_none()
