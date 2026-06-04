from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field


# =====================================
# CREATE PRODUCT
# =====================================

class ProductCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = None

    cost_price: Decimal = Field(..., gt=0)
    selling_price: Decimal | None = Field(None, gt=0)

    quantity: int = Field(..., ge=0)

    barcode: str | None = Field(None, max_length=255)

    supplier_id: str | None = None


# =====================================
# UPDATE PRODUCT
# =====================================

class ProductUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None

    cost_price: Decimal | None = Field(None, gt=0)
    selling_price: Decimal | None = Field(None, gt=0)

    quantity: int | None = Field(None, ge=0)

    barcode: str | None = Field(None, max_length=255)

    supplier_id: str | None = None


# =====================================
# RESPONSE PRODUCT
# =====================================

class ProductResponse(BaseModel):
    model_config = ConfigDict(
        from_attributes=True
    )

    id: str
    shop_id: str

    supplier_id: str | None = None

    name: str
    description: str | None = None

    cost_price: Decimal
    selling_price: Decimal

    quantity: int

    barcode: str | None = None


# =====================================
# OPTIONAL: PRODUCT LIST ITEM
# =====================================

class ProductListItem(BaseModel):
    id: str
    name: str

    supplier_id: str | None = None

    cost_price: Decimal
    selling_price: Decimal

    quantity: int

    profit_money: float
    profit_percent: float