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
    PasswordReset,
    OAuthCodeRequest,
    RefreshRequest,
    TokenRequest,
)
from app.services.auth_service import AuthService
from fastapi.security import OAuth2PasswordRequestForm
import httpx
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/token")
async def token(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """
    Unified auth token endpoint.

    **Swagger Authorize dialog**: use `username` + `password` fields.

    **JSON** (curl / "Try it out"): send `{"client_id": "email_or_username", "client_secret": "password"}`

    Returns `{"access_token": "...", "token_type": "bearer"}`.
    """
    from sqlalchemy import or_
    from app.models.user import User as UserModel, AuthProvider
    from sqlalchemy import select as sa_select
    from datetime import datetime, timezone

    content_type = request.headers.get("content-type", "")
    identifier = ""
    password = ""

    if "application/x-www-form-urlencoded" in content_type or "multipart/form-data" in content_type:
        form = await request.form()
        identifier = form.get("username", "") or form.get("client_id", "")
        password = form.get("password", "") or form.get("client_secret", "")
    else:
        try:
            raw_body = await request.body()
            if raw_body:
                import json
                raw = json.loads(raw_body)
                identifier = raw.get("client_id", "") or raw.get("username", "")
                password = raw.get("client_secret", "") or raw.get("password", "")
        except Exception:
            pass

    if not identifier or not password:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="client_id/username and client_secret/password are required",
        )

    result = await db.execute(
        sa_select(UserModel).where(
            or_(
                UserModel.email == identifier,
                UserModel.username == identifier,
            )
        )
    )
    user = result.scalar_one_or_none()

    if not user or user.auth_provider != AuthProvider.EMAIL or not user.password_hash:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    if not AuthService.verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
        )

    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    access_token, expires_at = AuthService.create_access_token(user.id)
    return {"access_token": access_token, "token_type": "bearer", "expires_at": expires_at}


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(
    request: Request,
    user_data: UserRegister,
    db: AsyncSession = Depends(get_db)
):
    """
    Register a new user with email and password.

    Args:
        - email: Valid email address (must be unique)
        - username: Unique username (3-50 characters)
        - password: Password (minimum 8 characters)

    Returns:
        - user info and JWT token.
    """
    # Create user and send verification email
    user = await AuthService.register_user(db, user_data)

    # Generate token
    access_token, expires_at = AuthService.create_access_token(user.id)

    return AuthResponse(
        user=UserResponse.model_validate(user),
        token=Token(access_token=access_token, expires_at=expires_at)
    )

@router.post("/login", response_model=AuthResponse)
async def login(
    request: Request,
    login_data: UserLogin,
    db: AsyncSession = Depends(get_db)
):
    """
    Login with email and password.

    Args:
        - email: Registered email address
        - password: Account password

    Returns:
        - user info and JWT token.
    """
    # Authenticate user
    user = await AuthService.login_user(db, login_data)

    # Generate token
    access_token, expires_at = AuthService.create_access_token(user.id)

    return AuthResponse(
        user=UserResponse.model_validate(user),
        token=Token(access_token=access_token, expires_at=expires_at)
    )

@router.post("/forgot-password")
async def forgot_password(
    request: Request,
    pass_request: PasswordResetRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Request password reset email.

    Args:
        - email: User's email address
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

    Args:
        - token: Password reset token
        - new_password: New password (minimum 8 characters)
    """
    await AuthService.reset_password(db, pass_reset.token, pass_reset.new_password)

    return {
        "message": "Password has been reset successfully."
    }

@router.post("/oauth-callback/{provider}", response_model=AuthResponse)
async def oauth_callback(
    provider: str,
    request: Request,
    body: OAuthCodeRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Unified Omniauth callback.
    Exchanges the authorization code for an access token, fetches user info,
    and creates or logs in the user.
    """

    # Omniauth strategies for each provider.
    OAUTH_PROVIDERS = {
        "42": {
            "token_url": "https://api.intra.42.fr/oauth/token",
            "user_url": "https://api.intra.42.fr/v2/me",
            "client_id": settings.FORTYTWO_UID,
            "client_secret": settings.FORTYTWO_SECRET,
            "token_field": "access_token",
            "extract_user": lambda data: {
                "provider_id": str(data["id"]),
                "email": data.get("email", ""),
                "username": data.get("login", ""),
                "first_name": data.get("first_name", ""),
                "last_name": data.get("last_name", ""),
                "profile_picture": data.get("image", {}).get("link", ""),
            },
        },
        "github": {
            "token_url": "https://github.com/login/oauth/access_token",
            "user_url": "https://api.github.com/user",
            "email_url": "https://api.github.com/user/emails",
            "client_id": settings.GITHUB_UID,
            "client_secret": settings.GITHUB_SECRET,
            "token_field": "access_token",
            "extract_user": lambda data: {
                "provider_id": str(data["id"]),
                "email": data.get("_primary_email", data.get("email", "")),
                "username": data.get("login", ""),
                "first_name": (data.get("name") or "").split(" ", 1)[0],
                "last_name": (data.get("name") or "").split(" ", 1)[1] if " " in (data.get("name") or "") else "",
                "profile_picture": data.get("avatar_url", ""),
            },
        },
        "discord": {
            "token_url": "https://discord.com/api/oauth2/token",
            "user_url": "https://discord.com/api/users/@me",
            "client_id": settings.DISCORD_UID,
            "client_secret": settings.DISCORD_SECRET,
            "token_field": "access_token",
            "token_encoding": "form",
            "extract_user": lambda data: {
                "provider_id": str(data["id"]),
                "email": data.get("email", ""),
                "username": data.get("global_name") or data.get("username", ""),
                "first_name": data.get("global_name") or data.get("username", ""),
                "last_name": "",
                "profile_picture": f"https://cdn.discordapp.com/avatars/{data['id']}/{data['avatar']}.png" if data.get("avatar") else "",
            },
        },
    }

    if provider not in OAUTH_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported OAuth provider: {provider}"
        )

    cfg = OAUTH_PROVIDERS[provider]

    # Exchange authorization code for access token
    token_data = {
        "grant_type": "authorization_code",
        "client_id": cfg["client_id"],
        "client_secret": cfg["client_secret"],
        "code": body.code,
        "redirect_uri": body.redirect_uri,
    }

    async with httpx.AsyncClient() as client:
        # GitHub requires Accept: application/json to get JSON back
        headers = {"Accept": "application/json"}
        # Discord requires form-encoded data; others accept JSON
        if cfg.get("token_encoding") == "form":
            token_response = await client.post(cfg["token_url"], data=token_data, headers=headers)
        else:
            token_response = await client.post(cfg["token_url"], json=token_data, headers=headers)
        if token_response.status_code != 200:
            logger.error(f"{provider} token exchange failed: {token_response.text}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to exchange authorization code with {provider}"
            )
        token_json = token_response.json()

        if "error" in token_json:
            logger.error(f"{provider} token error: {token_json}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=token_json.get("error_description", f"OAuth error from {provider}")
            )

        access_token = token_json[cfg["token_field"]]

        # Fetch user info
        auth_headers = {"Authorization": f"Bearer {access_token}"}
        me_response = await client.get(cfg["user_url"], headers=auth_headers)
        if me_response.status_code != 200:
            logger.error(f"{provider} user info failed: {me_response.text}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to fetch user info from {provider}"
            )
        me_data = me_response.json()

        # GitHub may not expose email in /user so trying to fetch from /user/emails
        if provider == "github" and not me_data.get("email"):
            email_url = cfg.get("email_url")
            if email_url:
                email_response = await client.get(email_url, headers=auth_headers)
                if email_response.status_code == 200:
                    emails = email_response.json()
                    primary = next((e for e in emails if e.get("primary")), None)
                    if primary:
                        me_data["_primary_email"] = primary["email"]

    user_info = cfg["extract_user"](me_data)

    # Create or login user via the appropriate service method
    if provider == "42":
        user = await AuthService.oauth_fortytwo(
            db,
            fortytwo_id=user_info["provider_id"],
            email=user_info["email"],
            username=user_info["username"],
            first_name=user_info["first_name"],
            last_name=user_info["last_name"],
            profile_picture=user_info.get("profile_picture", "")
        )
    elif provider == "github":
        user = await AuthService.oauth_github(
            db,
            github_id=user_info["provider_id"],
            email=user_info["email"],
            username=user_info["username"],
            first_name=user_info["first_name"],
            last_name=user_info["last_name"],
            profile_picture=user_info.get("profile_picture", "")
        )
    elif provider == "discord":
        user = await AuthService.oauth_discord(
            db,
            discord_id=user_info["provider_id"],
            email=user_info["email"],
            username=user_info["username"],
            first_name=user_info["first_name"],
            last_name=user_info["last_name"],
            profile_picture=user_info.get("profile_picture", "")
        )

    jwt_token, expires_at = AuthService.create_access_token(user.id)

    return AuthResponse(
        user=UserResponse.model_validate(user),
        token=Token(access_token=jwt_token, expires_at=expires_at)
    )


@router.post("/refresh", response_model=Token)
async def refresh_token(
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Exchange a valid (or recently expired) JWT for a fresh one.
    """
    from jose import JWTError, jwt as jose_jwt
    from app.config import JWT_ALGORITHM
    from app.models.user import User
    from sqlalchemy import select
    import uuid

    try:
        payload = jose_jwt.decode(
            body.token,
            settings.JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            options={"verify_exp": False},
        )
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    import time
    exp = payload.get("exp", 0)
    if time.time() - exp > 7 * 24 * 3600: # 7 days
        raise HTTPException(status_code=401, detail="Token too old to refresh")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    new_token, new_expires_at = AuthService.create_access_token(user.id)
    return Token(access_token=new_token, expires_at=new_expires_at)
