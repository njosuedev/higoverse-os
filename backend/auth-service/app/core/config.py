import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL:                str = os.getenv("DATABASE_URL", "")
    SHOP_DB_URL:                 str = os.getenv("SHOP_DB_URL", "")
    SECRET_KEY:                  str = os.getenv("SECRET_KEY") or os.getenv("AUTH_SERVICE_SECRET", "")
    ALGORITHM:                   str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS:   int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30"))

    # SMTP — set these in Vercel env vars to enable password reset emails
    SMTP_HOST: str = os.getenv("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USER: str = os.getenv("SMTP_USER", "")
    SMTP_PASS: str = os.getenv("SMTP_PASS", "")
    SMTP_FROM: str = os.getenv("SMTP_FROM", "A & T Consultants <noreply@higoverse.com>")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
