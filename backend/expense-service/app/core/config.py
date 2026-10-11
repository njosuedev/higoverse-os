import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL:           str = os.getenv("DATABASE_URL", "")
    SECRET_KEY:             str = os.getenv("SECRET_KEY") or os.getenv("AUTH_SERVICE_SECRET", "")
    AUTH_SERVICE_ALGORITHM: str = "HS256"
    SERVICE_NAME:           str = "expense-service"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()

# Sign-in tokens are signed with this key; left empty, anyone could sign
# their own and act as any user. Refuse to start instead.
if not settings.SECRET_KEY:
    raise RuntimeError("SECRET_KEY is not set (environment or .env)")
