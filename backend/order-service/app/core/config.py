import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL:           str = os.getenv("DATABASE_URL", "")
    SECRET_KEY:             str = os.getenv("SECRET_KEY") or os.getenv("AUTH_SERVICE_SECRET", "")
    AUTH_SERVICE_ALGORITHM: str = "HS256"
    SERVICE_NAME:           str = "order-service"
    PRODUCT_SERVICE_URL:    str = os.getenv("PRODUCT_SERVICE_URL", "https://higoverse-products.vercel.app")
    # Shared secret sent as X-Internal-Secret when calling product-service's
    # /internal/products/{id}/adjust-stock — must match product-service's
    # own INTERNAL_SERVICE_SECRET env value exactly.
    INTERNAL_SERVICE_SECRET: str = os.getenv("INTERNAL_SERVICE_SECRET", "")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
