from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str

    AUTH_SERVICE_SECRET: str
    AUTH_SERVICE_ALGORITHM: str = "HS256"

    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    class Config:
        env_file = ".env"


settings = Settings()
