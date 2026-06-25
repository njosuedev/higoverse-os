from sqlalchemy import Column, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from app.db.base import Base
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime, timezone


def _utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    name  = Column(String(255), nullable=True)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String, nullable=False)

    is_active = Column(Boolean, default=True)

    shop_id = Column(UUID(as_uuid=True), ForeignKey("shops.id"), nullable=True)

    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id"), nullable=True)

    # "customer" → browsing only | "owner" → shop approved | "admin" → platform admin
    role = Column(String(50), default="customer")

    created_at = Column(DateTime(timezone=True), default=_utcnow)

    # relationships
    shop     = relationship("Shop")
    role_rel = relationship("Role", foreign_keys=[role_id])