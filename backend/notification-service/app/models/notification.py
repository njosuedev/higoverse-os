import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Boolean, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from app.db.base import Base


def _utcnow():
    return datetime.now(timezone.utc)


class Notification(Base):
    __tablename__ = "notifications"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id    = Column(String(255), nullable=False, index=True)

    # new_message | offer_received | offer_accepted | offer_rejected | shop_approved | shop_rejected | system
    type       = Column(String(100), nullable=False)
    title      = Column(String(255), nullable=False)
    body       = Column(Text)
    data       = Column(JSONB, default=dict)

    is_read    = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow)
