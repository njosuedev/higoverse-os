import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Boolean, Numeric, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.base import Base


def _utcnow():
    return datetime.now(timezone.utc)


class Message(Base):
    __tablename__ = "messages"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id = Column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)

    sender_id       = Column(String(255), nullable=False)
    sender_name     = Column(String(255))
    # customer | shop
    sender_type     = Column(String(50), nullable=False)

    content         = Column(Text, nullable=False)
    # text | offer | offer_accepted | offer_rejected | system
    message_type    = Column(String(50), default="text", nullable=False)
    offer_price     = Column(Numeric(12, 2))

    is_read         = Column(Boolean, default=False, nullable=False)
    is_deleted      = Column(Boolean, default=False, nullable=False)
    edited_at       = Column(DateTime(timezone=True), nullable=True)
    created_at      = Column(DateTime(timezone=True), default=_utcnow)

    conversation    = relationship("Conversation", back_populates="messages")
