import uuid
from sqlalchemy import Column, String, Boolean, DateTime, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum
from app.database import Base

class AuthProvider(str, enum.Enum):
    EMAIL = "EMAIL"
    FORTYTWO = "FORTYTWO"
    GITHUB = "GITHUB"
    DISCORD = "DISCORD"

class User(Base):
    __tablename__ = "users"

    # Primary key
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Authentication
    email = Column(String(255), unique=True, nullable=False, index=True)
    first_name = Column(String(255), unique=False, nullable=False, index=True)
    last_name= Column(String(255), unique=False, nullable=False, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=True)  # Null for OAuth users
    auth_provider = Column(SQLEnum(AuthProvider, create_type=False, native_enum=False), default=AuthProvider.EMAIL, nullable=False)
    language = Column(String(10), nullable=False, default="en")

    # Password reset
    reset_token = Column(String(255), nullable=True)
    reset_token_expires = Column(DateTime(timezone=True), nullable=True)

    # OAuth linking
    fortytwo_id = Column(String(255), unique=True, nullable=True, index=True)
    github_id = Column(String(255), unique=True, nullable=True, index=True)
    discord_id = Column(String(255), unique=True, nullable=True, index=True)

    # Profile
    profile_picture = Column(String, nullable=True)  # URL to profile picture

    # Timestamps
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
    last_login = Column(DateTime(timezone=True), nullable=True)

    if password_hash is None and fortytwo_id is None and github_id is None and discord_id is None:
        raise ValueError("A user must have at least one authentication method.")

    def __repr__(self):
        return f"<User {self.username} ({self.email})>"
