from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str

    AUTH_SERVICE_SECRET: str
    AUTH_SERVICE_ALGORITHM: str = "HS256"

    SERVICE_NAME: str = "product-service"

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )


settings = Settings()
