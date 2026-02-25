from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
import uuid

class ProfileVisibility:
    PUBLIC = "public"      # Anyone can see
    PRIVATE = "private"    # Only the user can see

class UserProfileUpdate(BaseModel):
    email: Optional[str] = Field(None, max_length=255)
    first_name: Optional[str] = Field(None, max_length=255)
    last_name: Optional[str] = Field(None, max_length=255)
    username: Optional[str] = Field(None, min_length=3, max_length=100)
    profile_picture: Optional[str] = None
    language: Optional[str] = Field(None, max_length=10)

class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=100)

class UserPublicProfile(BaseModel):
    id: uuid.UUID
    username: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    profile_picture: Optional[str] = None
    language: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class UserPrivateProfile(UserPublicProfile):
    email: str
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    auth_provider: str
    language: Optional[str] = None
    fortytwo_id: Optional[str] = None
    github_id: Optional[str] = None
    discord_id: Optional[str] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class UserProfileResponse(BaseModel):
    """Response wrapper that includes relationship info"""
    profile: dict  # Will contain appropriate profile based on visibility
    visibility: str  # "public", "friends", or "private"
    is_self: bool = False
