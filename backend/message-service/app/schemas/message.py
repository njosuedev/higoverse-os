from pydantic import BaseModel
from typing import Optional
from decimal import Decimal


class MessageCreate(BaseModel):
    content:      str
    # text | offer
    message_type: str = "text"
    offer_price:  Optional[Decimal] = None
    sender_name:  Optional[str] = None


class OfferAction(BaseModel):
    # accept | reject
    action: str


class MessageOut(BaseModel):
    id:              str
    conversation_id: str
    sender_id:       str
    sender_name:     Optional[str]
    sender_type:     str
    content:         str
    message_type:    str
    offer_price:     Optional[float]
    is_read:         bool
    created_at:      str

    class Config:
        from_attributes = True
