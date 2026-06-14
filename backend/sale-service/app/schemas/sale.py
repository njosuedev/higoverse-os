from decimal import Decimal
from pydantic import BaseModel, Field


class SaleCreate(BaseModel):
    product_id: str
    customer_id: str | None = None
    quantity: int = Field(..., gt=0)
    unit_price: Decimal = Field(..., ge=0)
    notes: str | None = None


class SaleUpdate(BaseModel):
    product_id: str | None = None
    customer_id: str | None = None
    quantity: int | None = Field(None, gt=0)
    unit_price: Decimal | None = Field(None, ge=0)
    notes: str | None = None
