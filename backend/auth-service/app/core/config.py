import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL:                str = os.getenv("DATABASE_URL", "")
    SHOP_DB_URL:                 str = os.getenv("SHOP_DB_URL", "")
    SECRET_KEY:                  str = os.getenv("SECRET_KEY", "")
    ALGORITHM:                   str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
