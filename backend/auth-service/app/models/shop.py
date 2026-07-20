from sqlalchemy import Column, String, Boolean, DateTime, Text, Index
from sqlalchemy.sql import func
from app.db.base import Base
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime, timezone


def _utcnow():
    return datetime.now(timezone.utc)


class Shop(Base):
    __tablename__ = "shops"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    name        = Column(String(255), nullable=False)
    email       = Column(String(255), unique=True)
    phone       = Column(String(50))
    address     = Column(String(500))
    description = Column(Text)

    logo_url     = Column(Text, nullable=True)
    is_active    = Column(Boolean, default=True)
    email_verified = Column(Boolean, default=False, nullable=False, server_default="false")

    created_at   = Column(DateTime(timezone=True), default=_utcnow)
    updated_at   = Column(DateTime(timezone=True), onupdate=func.now())
    last_seen_at = Column(DateTime(timezone=True), nullable=True)

    # Backs the public shop directory's `WHERE is_active ORDER BY created_at DESC`.
    __table_args__ = (
        Index("ix_shops_active_created", is_active, created_at.desc()),
    )