from datetime import datetime, timedelta, timezone
from typing import Optional
import secrets
from passlib.context import CryptContext
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status
from app.models.user import User, AuthProvider
from app.schemas.auth import UserRegister, UserLogin, Token
from app.config import settings, JWT_ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
from app.services.email_service import EmailService
import logging

logger = logging.getLogger(__name__)

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class AuthService:

    @staticmethod
    def hash_password(password: str) -> str:
        """Hash a password"""
        return pwd_context.hash(password)

    @staticmethod
    def verify_password(plain_password: str, hashed_password: str) -> bool:
        """Verify a password against its hash"""
        return pwd_context.verify(plain_password, hashed_password)

    @staticmethod
    def create_access_token(user_id: str) -> str:
        """Create JWT access token"""
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        to_encode = {
            "sub": str(user_id),
            "exp": expire
        }
        encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=JWT_ALGORITHM)
        return encoded_jwt

    @staticmethod
    def generate_verification_token() -> str:
        """Generate email verification token"""
        return secrets.token_urlsafe(32)

    @staticmethod
    async def register_user(db: AsyncSession, user_data: UserRegister) -> User:
        """Register a new user with email/password"""

        # Check if email already exists
        result = await db.execute(select(User).where(User.email == user_data.email))
        existing_user = result.scalar_one_or_none()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )

        # Check if username already exists
        result = await db.execute(select(User).where(User.username == user_data.username))
        existing_username = result.scalar_one_or_none()
        if existing_username:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already taken"
            )

        # Create new user
        hashed_password = AuthService.hash_password(user_data.password)

        new_user = User(
            email=user_data.email,
            first_name=user_data.first_name,
            last_name=user_data.last_name,
            username=user_data.username,
            password_hash=hashed_password,
            auth_provider=AuthProvider.EMAIL,
        )

        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)

        return new_user

    @staticmethod
    async def login_user(db: AsyncSession, login_data: UserLogin) -> User:
        """Login user with email/password"""

        # Find user
        result = await db.execute(select(User).where(User.email == login_data.email))
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        # Check if user registered with email/password
        if user.auth_provider != AuthProvider.EMAIL or not user.password_hash:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This account uses OAuth. Please login with OAuth."
            )

        # Verify password
        if not AuthService.verify_password(login_data.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid email or password"
            )

        # Update last login
        user.last_login = datetime.now(timezone.utc)
        await db.commit()

        return user

    @staticmethod
    async def forgot_password(db: AsyncSession, email: str):
        """Send password reset email"""
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Email not found"
            )

        # Generate reset token
        reset_token = AuthService.generate_verification_token()
        user.reset_token = reset_token
        user.reset_token_expires = datetime.now(timezone.utc) + timedelta(hours=1)
        await db.commit()

        # Send reset email
        try:
            await EmailService.send_password_reset_email(
                email=user.email,
                username=user.username,
                token=reset_token
            )
        except Exception as e:
            logger.error(f"Failed to send password reset email: {str(e)}")
            raise

    @staticmethod
    async def reset_password(db: AsyncSession, token: str, new_password: str):
        """Reset user password with token"""

        result = await db.execute(select(User).where(User.reset_token == token))
        user = result.scalar_one_or_none()

        if not user or not user.reset_token_expires or user.reset_token_expires.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired reset token"
            )

        # Update password
        user.password_hash = AuthService.hash_password(new_password)
        user.reset_token = None
        user.reset_token_expires = None
        await db.commit()

    @staticmethod
    def verify_token(token: str) -> Optional[str]:
        """Verify JWT token and return user ID"""
        try:
            payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[JWT_ALGORITHM])
            user_id: str = payload.get("sub")
            if user_id is None:
                return None
            return user_id
        except JWTError:
            return None

    @staticmethod
    async def get_current_user(db: AsyncSession, token: str) -> User:
        """Get current user from JWT token"""
        user_id = AuthService.verify_token(token)
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials"
            )

        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )

        return user

    @staticmethod
    async def _get_unique_username(db: AsyncSession, username: str) -> str:
        """Ensure username is unique by appending a suffix if needed."""
        result = await db.execute(select(User).where(User.username == username))
        if not result.scalar_one_or_none():
            return username
        counter = 1
        while True:
            candidate = f"{username}_{counter}"
            result = await db.execute(select(User).where(User.username == candidate))
            if not result.scalar_one_or_none():
                return candidate
            counter += 1

    @staticmethod
    async def oauth_fortytwo(db: AsyncSession, fortytwo_id: str, email: str, username: str, first_name: str, last_name: str, profile_picture: str) -> User:
        """Authenticate or register user via 42 OAuth"""

        # Check if user exists by fortytwo_id first, then by email
        result = await db.execute(select(User).where(User.fortytwo_id == fortytwo_id))
        user = result.scalar_one_or_none()

        if not user:
            result = await db.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()

        if user:
            # Update last login
            user.last_login = datetime.now(timezone.utc)
            user.profile_picture = profile_picture
            if not user.fortytwo_id:
                user.fortytwo_id = fortytwo_id
            await db.commit()
            return user

        # Create new user with unique username
        unique_username = await AuthService._get_unique_username(db, username)
        new_user = User(
            email=email,
            username=unique_username,
            first_name=first_name,
            last_name=last_name,
            profile_picture=profile_picture,
            auth_provider=AuthProvider.FORTYTWO,
            fortytwo_id=fortytwo_id
        )

        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)

        return new_user

    @staticmethod
    async def oauth_github(db: AsyncSession, github_id: str, email: str, username: str, first_name: str, last_name: str, profile_picture: str = "") -> User:
        """Authenticate or register user via GitHub OAuth"""

        # Check if user exists by github_id first, then by email
        result = await db.execute(select(User).where(User.github_id == github_id))
        user = result.scalar_one_or_none()

        if not user:
            result = await db.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()

        if user:
            # Update last login
            user.last_login = datetime.now(timezone.utc)
            if profile_picture:
                user.profile_picture = profile_picture
            if not user.github_id:
                user.github_id = github_id
            await db.commit()
            return user

        # Create new user with unique username
        unique_username = await AuthService._get_unique_username(db, username)
        new_user = User(
            email=email,
            username=unique_username,
            first_name=first_name,
            last_name=last_name,
            profile_picture=profile_picture,
            auth_provider=AuthProvider.GITHUB,
            github_id=github_id
        )

        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)

        return new_user

    @staticmethod
    async def oauth_discord(db: AsyncSession, discord_id: str, email: str, username: str, first_name: str, last_name: str, profile_picture: str = "") -> User:
        """Authenticate or register user via Discord OAuth"""

        # Check if user exists by discord_id first, then by email
        result = await db.execute(select(User).where(User.discord_id == discord_id))
        user = result.scalar_one_or_none()

        if not user:
            result = await db.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()

        if user:
            # Update last login
            user.last_login = datetime.now(timezone.utc)
            if profile_picture:
                user.profile_picture = profile_picture
            if not user.discord_id:
                user.discord_id = discord_id
            await db.commit()
            return user

        # Create new user with unique username
        unique_username = await AuthService._get_unique_username(db, username)
        new_user = User(
            email=email,
            username=unique_username,
            first_name=first_name,
            last_name=last_name,
            profile_picture=profile_picture,
            auth_provider=AuthProvider.DISCORD,
            discord_id=discord_id
        )

        db.add(new_user)
        await db.commit()
        await db.refresh(new_user)

        return new_user
