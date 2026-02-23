from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from uuid import UUID
from app.database import get_db
from app.schemas.user import (
    UserProfileUpdate,
    UserProfileResponse,
    UserPrivateProfile
)
from app.services.user_service import UserService
from app.models.user import User

router = APIRouter(prefix="/users", tags=["Users"])

@router.get("/me", response_model=UserProfileResponse)
async def get_current_user_info(
    current_user: User = Depends(UserService.get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get current authenticated user's full profile.

    Requires: Valid JWT token in Authorization header

    Returns the user's complete private profile.
    """
    return await UserService.get_profile_with_visibility(db, current_user.id, current_user)


@router.get("/search/{username}", response_model=UserProfileResponse)
async def search_user_by_username(
    username: str,
    current_user: User = Depends(UserService.get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Search for a user by username.

    Requires: Valid JWT token in Authorization header

    Returns the user's profile with appropriate visibility level.
    """
    user = await UserService.get_user_by_username(db, username)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return await UserService.get_profile_with_visibility(db, user.id, current_user)


@router.get("/{user_id}", response_model=UserProfileResponse)
async def get_user_profile(
    user_id: UUID,
    current_user: User = Depends(UserService.get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get a user's profile by ID.

    Requires: Valid JWT token in Authorization header

    Visibility levels:
    - **Private**: Full profile if viewing your own profile
    - **Public**: Basic profile for other users (username, profile picture, created_at)
    """
    return await UserService.get_profile_with_visibility(db, user_id, current_user)


@router.put("/me", response_model=UserPrivateProfile)
async def update_my_profile(
    update_data: UserProfileUpdate,
    current_user: User = Depends(UserService.get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Update current user's profile.

    Requires: Valid JWT token in Authorization header

    - **username**: New username (optional, must be unique)
    - **profile_picture**: New profile picture URL (optional)
    """
    updated_user = await UserService.update_profile(db, current_user, update_data)
    return UserPrivateProfile.model_validate(updated_user)
