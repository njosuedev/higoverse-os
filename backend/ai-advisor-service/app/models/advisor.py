import uuid
from datetime import datetime, timezone, timedelta

from sqlalchemy import Column, String, Integer, Boolean, Text, DateTime, Numeric, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.db.base import Base


def _utcnow():
    return datetime.now(timezone.utc)


PLAN_LIMITS = {
    "trial":      {"messages": 20,   "price_rwf": 0,      "label": "Free Trial"},
    "basic":      {"messages": 200,  "price_rwf": 15000,  "label": "Basic"},
    "pro":        {"messages": 1000, "price_rwf": 45000,  "label": "Pro"},
    "enterprise": {"messages": -1,   "price_rwf": 120000, "label": "Enterprise"},
}


class AISubscription(Base):
    __tablename__ = "ai_subscriptions"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shop_id     = Column(UUID(as_uuid=True), nullable=False, unique=True, index=True)
    user_id     = Column(UUID(as_uuid=True), nullable=False)
    shop_name   = Column(String(255), nullable=True)

    plan        = Column(String(50),  default="trial")
    status      = Column(String(50),  default="trial")  # trial, active, suspended, cancelled

    trial_ends_at    = Column(DateTime(timezone=True), nullable=True)
    period_start     = Column(DateTime(timezone=True), nullable=True)
    period_end       = Column(DateTime(timezone=True), nullable=True)

    messages_used    = Column(Integer, default=0)
    messages_limit   = Column(Integer, default=20)

    created_at  = Column(DateTime(timezone=True), default=_utcnow)
    updated_at  = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    conversations = relationship("AIConversation", back_populates="subscription",
                                 foreign_keys="AIConversation.shop_id",
                                 primaryjoin="AISubscription.shop_id == AIConversation.shop_id",
                                 viewonly=True)

    @property
    def is_active(self) -> bool:
        now = datetime.now(timezone.utc)
        if self.status == "trial":
            return self.trial_ends_at is not None and self.trial_ends_at > now
        if self.status == "active":
            return self.period_end is None or self.period_end > now
        return False

    @property
    def messages_remaining(self) -> int:
        if self.messages_limit == -1:
            return 999999
        return max(0, self.messages_limit - self.messages_used)


class AIConversation(Base):
    __tablename__ = "ai_conversations"

    id       = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shop_id  = Column(UUID(as_uuid=True), nullable=False, index=True)
    title    = Column(String(255), nullable=True)

    created_at = Column(DateTime(timezone=True), default=_utcnow)
    updated_at = Column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)

    messages = relationship("AIMessage", back_populates="conversation",
                            cascade="all, delete-orphan", order_by="AIMessage.created_at")


class AIMessage(Base):
    __tablename__ = "ai_messages"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("ai_conversations.id", ondelete="CASCADE"))
    shop_id         = Column(UUID(as_uuid=True), nullable=False, index=True)
    role            = Column(String(20), nullable=False)   # user | assistant
    content         = Column(Text, nullable=False)
    language        = Column(String(10), default="en")
    tokens_input    = Column(Integer, default=0)
    tokens_output   = Column(Integer, default=0)
    created_at      = Column(DateTime(timezone=True), default=_utcnow)

    conversation = relationship("AIConversation", back_populates="messages")


class AIUsageLog(Base):
    __tablename__ = "ai_usage_logs"

    id           = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    shop_id      = Column(UUID(as_uuid=True), nullable=False, index=True)
    user_id      = Column(UUID(as_uuid=True), nullable=True)
    query_type   = Column(String(50), default="chat")
    tokens_input = Column(Integer, default=0)
    tokens_output= Column(Integer, default=0)
    cost_usd     = Column(Numeric(10, 6), default=0)
    response_ms  = Column(Integer, default=0)
    created_at   = Column(DateTime(timezone=True), default=_utcnow)
