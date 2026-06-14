import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL:           str = os.getenv("DATABASE_URL", "")
    AUTH_SERVICE_SECRET:    str = os.getenv("AUTH_SERVICE_SECRET", "")
    AUTH_SERVICE_ALGORITHM: str = "HS256"
    PRODUCT_SERVICE_URL:    str = "https://higoverse-products.vercel.app"
    SERVICE_NAME:           str = "purchase-service"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
