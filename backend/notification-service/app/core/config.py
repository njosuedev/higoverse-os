import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL:     str = os.getenv("DATABASE_URL", "")
    SECRET_KEY:       str = os.getenv("SECRET_KEY", "")
    ALGORITHM:        str = "HS256"
    # Key checked on service-to-service POST /notifications requests
    INTERNAL_API_KEY: str = os.getenv("INTERNAL_API_KEY", "")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
