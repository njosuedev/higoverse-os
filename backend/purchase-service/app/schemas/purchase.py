from decimal import Decimal
from pydantic import BaseModel, Field


class PurchaseCreate(BaseModel):
    # Provide product_id to restock an existing item,
    # OR provide product_name (+ selling_price) to add a brand-new item.
    product_id: str | None = None
    product_name: str | None = None
    description: str | None = None

    supplier_id: str | None = None
    cost_price: Decimal = Field(..., gt=0)
    selling_price: Decimal | None = Field(None, gt=0)
    quantity_added: int = Field(..., gt=0)
    notes: str | None = None
