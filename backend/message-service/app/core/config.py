import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL:    str = os.getenv("DATABASE_URL", "")
    SECRET_KEY:      str = os.getenv("SECRET_KEY", "")
    ALGORITHM:       str = "HS256"

    # URL of the notification service — used to push notifications after a message is sent
    NOTIFICATION_SERVICE_URL: str = os.getenv(
        "NOTIFICATION_SERVICE_URL",
        "https://higoverse-notifications.vercel.app",
    )
    # Shared secret for service-to-service calls to notification-service
    INTERNAL_API_KEY: str = os.getenv("INTERNAL_API_KEY", "")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
