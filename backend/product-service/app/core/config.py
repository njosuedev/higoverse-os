import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL:           str = os.getenv("DATABASE_URL", "")
    SECRET_KEY:             str = os.getenv("SECRET_KEY") or os.getenv("AUTH_SERVICE_SECRET", "")
    AUTH_SERVICE_ALGORITHM: str = "HS256"
    SERVICE_NAME:           str = "product-service"
    SUPPLIER_SERVICE_URL:   str = os.getenv("SUPPLIER_SERVICE_URL", "https://higoverse-suppliers.vercel.app")
    # Shared secret checked on /internal/* routes — auth-service uses this to
    # push shop is_active changes here so marketplace queries can filter
    # shop_is_active without a cross-database join (products and shops live
    # in separate Postgres instances).
    INTERNAL_SERVICE_SECRET: str = os.getenv("INTERNAL_SERVICE_SECRET", "")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
