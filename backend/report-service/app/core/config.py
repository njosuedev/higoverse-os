import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    SECRET_KEY:             str = os.getenv("SECRET_KEY") or os.getenv("AUTH_SERVICE_SECRET", "")
    AUTH_SERVICE_ALGORITHM: str = "HS256"

    SALE_SERVICE_URL:     str = "http://127.0.0.1:8003"
    PURCHASE_SERVICE_URL: str = "http://127.0.0.1:8004"
    PRODUCT_SERVICE_URL:  str = "http://127.0.0.1:8001"

    SERVICE_NAME: str = "report-service"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
