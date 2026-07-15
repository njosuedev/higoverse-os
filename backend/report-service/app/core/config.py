import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    SECRET_KEY:             str = os.getenv("SECRET_KEY") or os.getenv("AUTH_SERVICE_SECRET", "")
    AUTH_SERVICE_ALGORITHM: str = "HS256"

    SALE_SERVICE_URL:     str = "https://sales-esys.vercel.app"
    PURCHASE_SERVICE_URL: str = "https://higoverse-purchases.vercel.app"
    PRODUCT_SERVICE_URL:  str = "https://products-esys.vercel.app"

    SERVICE_NAME: str = "report-service"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
