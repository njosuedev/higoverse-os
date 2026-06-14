from decimal import Decimal
from pydantic import BaseModel


class SettingsUpdate(BaseModel):
    shop_name: str | None = None
    phone: str | None = None
    address: str | None = None
    currency: str | None = None
    language: str | None = None
    low_stock_threshold: int | None = None
    tax_rate: Decimal | None = None
