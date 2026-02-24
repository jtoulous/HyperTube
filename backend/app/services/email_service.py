from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType
from typing import List
from app.config import settings
import logging

logger = logging.getLogger(__name__)

# Email configuration
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

        # TODO: Rework style of email to fit Hypertube project

        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{
                    font-family: Arial, sans-serif;
                    line-height: 1.6;
                    color: #333;
                }}
                .container {{
                    max-width: 600px;
                    margin: 0 auto;
                    padding: 20px;
                }}
                .header {{
                    background-color: #282c34;
                    color: white;
                    padding: 20px;
                    text-align: center;
                    border-radius: 5px 5px 0 0;
                }}
                .header h1 {{
                    color: #fff;
                }}
                .content {{
                    background-color: #f9f9f9;
                    padding: 30px;
                    border-radius: 0 0 5px 5px;
                }}
                .content h2 {{
                    color: #282c34;
                }}
                .button {{
                    display: inline-block;
                    padding: 12px 30px;
                    background-color: #282c34;
                    color: white;
                    text-decoration: none;
                    border-radius: 5px;
                    margin: 20px 0;
                }}
                .footer {{
                    text-align: center;
                    margin-top: 20px;
                    font-size: 12px;
                    color: #666;
                }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>HyperTube</h1>
                </div>
                <div class="content">
                    <h2>Password Reset Request</h2>
                    <p>Hi {username},</p>
                    <p>We received a request to reset your password. Click the button below to create a new password:</p>
                    <p style="text-align: center;">
                        <a href="{reset_url}" class="button">Reset Password</a>
                    </p>
                    <p>Or copy and paste this link into your browser:</p>
                    <p style="word-break: break-all; color: #035391;">{reset_url}</p>
                    <p><strong>This link will expire in 1 hour.</strong></p>
                    <p>If you didn't request a password reset, you can safely ignore this email.</p>
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
