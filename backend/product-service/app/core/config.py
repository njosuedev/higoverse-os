from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str

    AUTH_SERVICE_SECRET: str
    AUTH_SERVICE_ALGORITHM: str = "HS256"

    SERVICE_NAME: str = "product-service"

    class Config:
        env_file = ".env"


settings = Settings()
