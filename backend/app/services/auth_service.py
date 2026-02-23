from datetime import datetime, timedelta
from typing import Optional
import secrets
from passlib.context import CryptContext
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from fastapi import HTTPException, status
from app.models.user import User, AuthProvider
from app.schemas.auth import UserRegister, UserLogin, Token
from app.config import settings
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
        expire = datetime.utcnow() + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        to_encode = {
            "sub": str(user_id),
            "exp": expire
        }
        encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
        return encoded_jwt

    @staticmethod
    def generate_verification_token() -> str:
        """Generate email verification token"""
        return secrets.token_urlsafe(32)

    @staticmethod
    async def register_user(db: Session, user_data: UserRegister, server: str) -> User:
        """Register a new user with email/password"""

        # Check if email already exists
        existing_user = db.query(User).filter(User.email == user_data.email).first()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )

        # Check if username already exists
        existing_username = db.query(User).filter(User.username == user_data.username).first()
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
        db.commit()
        db.refresh(new_user)

        return new_user

    @staticmethod
    def login_user(db: Session, login_data: UserLogin) -> User:
        """Login user with email/password"""

        # Find user
        user = db.query(User).filter(User.email == login_data.email).first()

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

        if not user.email_verified:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Email not verified"
            )

        # Update last login
        user.last_login = datetime.utcnow()
        db.commit()

        return user

    @staticmethod
    async def forgot_password(db: Session, email: str, server: str):
        """Send password reset email"""
        user = db.query(User).filter(User.email == email).first()

        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Email not found"
            )

        # Generate reset token
        reset_token = AuthService.generate_verification_token()
        user.reset_token = reset_token
        user.reset_token_expires = datetime.utcnow() + timedelta(hours=1)
        db.commit()

        # Send reset email
        try:
            await EmailService.send_password_reset_email(
                email=user.email,
                username=user.username,
                token=reset_token,
                server=server
            )
        except Exception as e:
            logger.error(f"Failed to send password reset email: {str(e)}")
            raise

    @staticmethod
    async def reset_password(db: Session, token: str, new_password: str):
        """Reset user password with token"""

        user = db.query(User).filter(User.reset_token == token).first()

        if not user or not user.reset_token_expires or user.reset_token_expires < datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid or expired reset token"
            )

        # Update password
        user.password_hash = AuthService.hash_password(new_password)
        user.reset_token = None
        user.reset_token_expires = None
        db.commit()

    @staticmethod
    def verify_token(token: str) -> Optional[str]:
        """Verify JWT token and return user ID"""
        try:
            payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
            user_id: str = payload.get("sub")
            if user_id is None:
                return None
            return user_id
        except JWTError:
            return None

    @staticmethod
    def get_current_user(db: Session, token: str) -> User:
        """Get current user from JWT token"""
        user_id = AuthService.verify_token(token)
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authentication credentials"
            )

        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="User not found"
            )

        return user

    @staticmethod
    def oauth_fortytwo(db: Session, fortytwo_id: str, email: str, username: str, first_name: str, last_name: str) -> User:
        """Authenticate or register user via 42 OAuth"""

        # Check if user exists
        user = db.query(User).filter(User.email == email).first()

        if user:
            # Update last login
            user.last_login = datetime.utcnow()
            db.commit()
            return user

        # Create new user
        new_user = User(
            email=email,
            username=username,
            first_name=first_name,
            last_name=last_name,
            auth_provider=AuthProvider.FORTYTWO,
            fortytwo_id=fortytwo_id
        )

        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        return new_user

    @staticmethod
    def oauth_github(db: Session, github_id: str, email: str, username: str, first_name: str, last_name: str) -> User:
        """Authenticate or register user via GitHub OAuth"""

        # Check if user exists
        user = db.query(User).filter(User.email == email).first()

        if user:
            # Update last login
            user.last_login = datetime.utcnow()
            db.commit()
            return user

        # Create new user
        new_user = User(
            email=email,
            username=username,
            first_name=first_name,
            last_name=last_name,
            auth_provider=AuthProvider.GITHUB,
            github_id=github_id
        )

        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        return new_user
