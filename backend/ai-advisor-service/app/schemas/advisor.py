from __future__ import annotations
from typing import Optional, List
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str
    conversation_id: Optional[str] = None
    language: str = "en"


class ChatResponse(BaseModel):
    reply: str
    conversation_id: str
    message_id: str
    messages_used: int
    messages_remaining: int
    language: str


class ConversationOut(BaseModel):
    id: str
    title: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    language: str
    created_at: datetime

    class Config:
        from_attributes = True


class SubscriptionOut(BaseModel):
    shop_id: str
    shop_name: Optional[str]
    plan: str
    status: str
    is_active: bool
    messages_used: int
    messages_limit: int
    messages_remaining: int
    trial_ends_at: Optional[datetime]
    period_start: Optional[datetime]
    period_end: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class UpgradeRequest(BaseModel):
    plan: str  # basic | pro | enterprise
