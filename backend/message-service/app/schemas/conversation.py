from pydantic import BaseModel
from typing import Optional
from decimal import Decimal


class ConversationCreate(BaseModel):
    shop_id:       str
    shop_name:     Optional[str] = None
    customer_name: Optional[str] = None
    product_id:    Optional[str] = None
    product_name:  Optional[str] = None
    product_image: Optional[str] = None
    listed_price:  Optional[Decimal] = None
    # Optional first message sent together with conversation creation
    first_message: Optional[str] = None


class ConversationOut(BaseModel):
    id:              str
    customer_id:     str
    customer_name:   Optional[str]
    shop_id:         str
    shop_name:       Optional[str]
    product_id:      Optional[str]
    product_name:    Optional[str]
    product_image:   Optional[str]
    listed_price:    Optional[float]
    agreed_price:    Optional[float]
    status:          str
    unread_count:    int = 0
    last_message_at: Optional[str]
    created_at:      str

    class Config:
        from_attributes = True
