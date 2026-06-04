from pydantic import BaseModel
from decimal import Decimal


class ProductCreate(BaseModel):
    name: str
    description: str | None = None
    cost_price: Decimal
    selling_price: Decimal | None = None
    quantity: int
    barcode: str | None = None
    supplier_id: str | None = None

class ProductUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    cost_price: Decimal | None = None
    selling_price: Decimal | None = None
    quantity: int | None = None
    barcode: str | None = None
    supplier_id: str | None = None 


class ProductResponse(BaseModel):
    id: str
    shop_id: str
    name: str
    description: str | None = None
    cost_price: Decimal
    selling_price: Decimal
    quantity: int
    barcode: str | None = None
    supplier_id: str | None = None

    class Config:
        from_attributes = True