from datetime import datetime
from typing import Optional, List
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
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
from app.config import settings
from app.database import get_db

security = HTTPBearer()


class UserService:

    @staticmethod
    def verify_token(credentials: HTTPAuthorizationCredentials) -> UUID:
        """Verify JWT token and return user_id"""
        try:
            token = credentials.credentials
            payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
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
    def get_current_user(
        credentials: HTTPAuthorizationCredentials = Depends(security),
        db: Session = Depends(get_db)
    ) -> User:
        """Get current authenticated user from token"""
        user_id = UserService.verify_token(credentials)
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        return user

    @staticmethod
    def get_user_by_id(db: Session, user_id: UUID) -> Optional[User]:
        """Get user by ID"""
        return db.query(User).filter(User.id == user_id).first()

    @staticmethod
    def get_profile_with_visibility(
        db: Session,
        target_user_id: UUID,
        current_user: User
    ) -> UserProfileResponse:
        """Get user profile with appropriate visibility based on relationship"""

        target_user = UserService.get_user_by_id(db, target_user_id)
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
    def update_profile(
        db: Session,
        current_user: User,
        update_data: UserProfileUpdate
    ) -> User:
        """Update user profile"""

        # Only update fields that are provided
        if update_data.username is not None:
            # Check if username is already taken
            existing = db.query(User).filter(
                User.username == update_data.username,
                User.id != current_user.id
            ).first()
            if existing:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Username already taken"
                )
            current_user.username = update_data.username

        if update_data.profile_picture is not None:
            current_user.profile_picture = update_data.profile_picture

        current_user.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(current_user)

        return current_user

    @staticmethod
    def get_user_by_username(db: Session, username: str) -> Optional[User]:
        """Get user by username"""
        return db.query(User).filter(User.username == username).first()
