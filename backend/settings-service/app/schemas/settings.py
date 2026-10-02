from decimal import Decimal
from pydantic import BaseModel, Field, field_validator


class SettingsUpdate(BaseModel):
    shop_name: str | None = None
    phone: str | None = None
    address: str | None = None
    currency: str | None = None
    language: str | None = None
    low_stock_threshold: int | None = Field(None, ge=0)
    tax_rate: Decimal | None = Field(None, ge=0, le=100)
    car_types: list[str] | None = None

    @field_validator("car_types")
    @classmethod
    def clean_car_types(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        # Trim, drop blanks and case-insensitive duplicates, keep order.
        seen, out = set(), []
        for name in v:
            name = name.strip()[:50]
            if name and name.lower() not in seen:
                seen.add(name.lower())
                out.append(name)
        if len(out) > 100:
            raise ValueError("Too many car types (max 100)")
        return out
