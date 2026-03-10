from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
from typing import List
from app.config import settings
import logging

logger = logging.getLogger(__name__)

conf = ConnectionConfig(
    MAIL_USERNAME=settings.SMTP_USER,
    MAIL_PASSWORD=settings.SMTP_PASSWORD,
    MAIL_FROM=settings.MAIL_FROM,
    MAIL_PORT=settings.SMTP_PORT,
    MAIL_SERVER=settings.SMTP_HOST,
    MAIL_FROM_NAME=settings.MAIL_FROM_NAME,
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS= False,
    USE_CREDENTIALS=True
)

class EmailService:
    """Service for sending emails"""

    @staticmethod
    async def send_password_reset_email(email: str, username: str, token: str):
        """Send password reset link"""

        reset_url = f"{settings.FRONT_URL}/reset-password?token={token}"

        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
            <style>
                body {{
                    margin: 0;
                    padding: 0;
                    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
                    line-height: 1.6;
                    background-color: #010409;
                    color: #e6edf3;
                }}
                .wrapper {{
                    max-width: 520px;
                    margin: 40px auto;
                    padding: 0 16px;
                }}
                .card {{
                    background-color: #0d1117;
                    border: 1px solid #21262d;
                    border-radius: 10px;
                    overflow: hidden;
                }}
                .header {{
                    padding: 28px 32px 20px;
                    text-align: center;
                    border-bottom: 1px solid #21262d;
                }}
                .header h1 {{
                    margin: 0;
                    font-size: 22px;
                    font-weight: 700;
                    color: #e6edf3;
                    letter-spacing: -0.3px;
                }}
                .body {{
                    padding: 32px;
                }}
                .body h2 {{
                    margin: 0 0 8px;
                    font-size: 17px;
                    font-weight: 600;
                    color: #e6edf3;
                }}
                .body p {{
                    margin: 0 0 16px;
                    font-size: 14px;
                    color: #8b949e;
                }}
                .cta {{
                    text-align: center;
                    margin: 28px 0;
                }}
                .cta a {{
                    display: inline-block;
                    padding: 11px 32px;
                    background-color: #007BFF;
                    color: #ffffff;
                    font-size: 14px;
                    font-weight: 600;
                    text-decoration: none;
                    border-radius: 6px;
                }}
                .url {{
                    word-break: break-all;
                    font-size: 13px;
                    color: #58a6ff;
                }}
                .note {{
                    font-size: 13px;
                    color: #8b949e;
                    margin-top: 24px;
                    padding-top: 16px;
                    border-top: 1px solid #21262d;
                }}
                .footer {{
                    text-align: center;
                    padding: 16px 32px;
                    font-size: 12px;
                    color: #484f58;
                }}
            </style>
        </head>
        <body>
            <div class="wrapper">
                <div class="card">
                    <div class="header">
                        <h1>HyperTube</h1>
                    </div>
                    <div class="body">
                        <h2>Reset your password</h2>
                        <p>Hey {username}, we received a request to reset your password. Use the button below to set a new one.</p>
                        <div class="cta">
                            <a href="{reset_url}">Reset Password</a>
                        </div>
                        <p>Or paste this link into your browser:</p>
                        <p class="url">{reset_url}</p>
                        <p class="note">This link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password won't change.</p>
                    </div>
                </div>
                <div class="footer">
                    <p>&copy; 2026 HyperTube. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """

        message = MessageSchema(
            subject="Reset Your HyperTube Password",
            recipients=[email],
            body=html_body,
            subtype=MessageType.html
        )

        try:
            fm = FastMail(conf)
            await fm.send_message(message)
            logger.info(f"Password reset email sent to {email}")
        except Exception as e:
            logger.error(f"Failed to send password reset email to {email}: {str(e)}")
            raise
