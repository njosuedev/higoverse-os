import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, String, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.db.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class Notification(Base):
    __tablename__ = "notifications"

    id         = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id    = Column(String(255), nullable=False, index=True)
    type       = Column(String(50),  nullable=False, default="system")
    title      = Column(String(500), nullable=False)
    body       = Column(Text, nullable=True)
    data       = Column(JSONB, nullable=True, default=dict)
    is_read    = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow)
