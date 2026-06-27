import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Numeric, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.base import Base


def _utcnow():
    return datetime.now(timezone.utc)


class Conversation(Base):
    __tablename__ = "conversations"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Participants
    customer_id     = Column(String(255), nullable=False, index=True)
    customer_name   = Column(String(255))
    shop_id         = Column(String(255), nullable=False, index=True)
    shop_name       = Column(String(255))

    # Product context
    product_id      = Column(String(255), index=True)
    product_name    = Column(String(500))
    product_image   = Column(Text)
    listed_price    = Column(Numeric(12, 2))

    # Negotiation outcome
    # open | accepted | rejected | closed
    status          = Column(String(50), default="open", nullable=False)
    agreed_price    = Column(Numeric(12, 2))

    last_message_at = Column(DateTime(timezone=True), default=_utcnow)
    created_at      = Column(DateTime(timezone=True), default=_utcnow)

    messages        = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")
