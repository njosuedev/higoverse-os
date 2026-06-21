import os
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    ADVISOR_DB_URL: str = os.getenv("ADVISOR_DB_URL", "")
    SECRET_KEY:     str = os.getenv("SECRET_KEY") or os.getenv("AUTH_SERVICE_SECRET", "")
    ALGORITHM:      str = "HS256"

    # URLs of existing microservices (called to gather shop context)
    AUTH_API:     str = os.getenv("AUTH_API",     "https://higoverse-auth.vercel.app")
    SALES_API:    str = os.getenv("SALES_API",    "https://higoverse-sales.vercel.app")
    PRODUCTS_API: str = os.getenv("PRODUCTS_API", "https://higoverse-products.vercel.app")
    EXPENSES_API: str = os.getenv("EXPENSES_API", "https://higoverse-exepenses.onrender.com")
    REPORTS_API:  str = os.getenv("REPORTS_API",  "https://higoverse-reports.vercel.app")
    PURCHASES_API:str = os.getenv("PURCHASES_API","https://higoverse-purchases.vercel.app")
    SUPPLIERS_API:str = os.getenv("SUPPLIERS_API","https://higoverse-suppliers.vercel.app")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
