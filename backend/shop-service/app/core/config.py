import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL:           str = os.getenv("DATABASE_URL", "")
    AUTH_SERVICE_SECRET:    str = os.getenv("AUTH_SERVICE_SECRET", "")
    AUTH_SERVICE_ALGORITHM: str = "HS256"
    SERVICE_NAME:           str = "shop-service"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
