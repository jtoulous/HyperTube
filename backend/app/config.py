import os
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = os.environ.get("DATABASE_URL", "postgresql://postgres:password@postgres:5432/hypertube")
    POSTGRES_USER: str = os.environ.get("POSTGRES_USER", "postgres")
    POSTGRES_PASSWORD: str = os.environ.get("POSTGRES_PASSWORD", "password")
    POSTGRES_DB: str = os.environ.get("POSTGRES_DB", "hypertube")
    JWT_SECRET: str = os.environ.get("JWT_SECRET", "dev_secret_key")

    SMTP_HOST: str = os.environ.get("SMTP_HOST")
    SMTP_PORT: int = int(os.environ.get("SMTP_PORT", 587))
    SMTP_USER: str = os.environ.get("SMTP_USER")
    SMTP_PASSWORD: str = os.environ.get("SMTP_PASSWORD")
    MAIL_FROM: str = os.environ.get("MAIL_FROM")
    MAIL_FROM_NAME: str = os.environ.get("MAIL_FROM_NAME", "Hypertube")

    HOST_IP: str = os.environ.get("HOST_IP")

    class Config:
        env_file = ".env"

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

settings = Settings()
