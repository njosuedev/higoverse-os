import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL:           str = os.getenv("DATABASE_URL", "")
    SECRET_KEY:             str = os.getenv("SECRET_KEY") or os.getenv("AUTH_SERVICE_SECRET", "")
    AUTH_SERVICE_ALGORITHM: str = "HS256"
    PRODUCT_SERVICE_URL:    str = "https://products-esys.vercel.app"
    SERVICE_NAME:           str = "sale-service"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
