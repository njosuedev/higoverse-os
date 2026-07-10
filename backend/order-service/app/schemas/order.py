from decimal import Decimal
from pydantic import BaseModel, Field

VALID_STATUSES = {"pending", "confirmed", "out_for_delivery", "delivered", "cancelled"}


class OrderCreate(BaseModel):
    product_id: str
    quantity: int = Field(..., gt=0)
    customer_name: str | None = None
    delivery_phone: str = Field(..., min_length=3)
    delivery_address_text: str = Field(..., min_length=3)
    delivery_lat: Decimal | None = None
    delivery_lng: Decimal | None = None
    delivery_notes: str | None = None
    payment_method: str | None = "cash"


class OrderStatusUpdate(BaseModel):
    status: str
    cancel_reason: str | None = None
