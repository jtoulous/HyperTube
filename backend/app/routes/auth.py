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
    OAuthCodeRequest
)
from app.services.auth_service import AuthService
import httpx
import logging

logger = logging.getLogger(__name__)

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
    Supported providers: 42, github
    """

    # Provider configurations (Omniauth strategy registry)
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

    # Step 1: Exchange authorization code for access token
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

        # Step 2: Fetch user info
        auth_headers = {"Authorization": f"Bearer {access_token}"}
        me_response = await client.get(cfg["user_url"], headers=auth_headers)
        if me_response.status_code != 200:
            logger.error(f"{provider} user info failed: {me_response.text}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to fetch user info from {provider}"
            )
        me_data = me_response.json()

        # Step 2b: GitHub may not expose email in /user — fetch from /user/emails
        if provider == "github" and not me_data.get("email"):
            email_url = cfg.get("email_url")
            if email_url:
                email_response = await client.get(email_url, headers=auth_headers)
                if email_response.status_code == 200:
                    emails = email_response.json()
                    primary = next((e for e in emails if e.get("primary")), None)
                    if primary:
                        me_data["_primary_email"] = primary["email"]

    # Step 3: Extract user fields via provider strategy
    user_info = cfg["extract_user"](me_data)

    # Step 4: Create or login user via the appropriate service method
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

    jwt_token = AuthService.create_access_token(user.id)

    return AuthResponse(
        user=UserResponse.model_validate(user),
        token=Token(access_token=jwt_token)
    )

