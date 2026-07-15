from sqlalchemy import Column, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from app.db.base import Base
from sqlalchemy.dialects.postgresql import UUID, JSON
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

    # Plain UUID — no FK constraint. Shop data lives in shop_db, not auth_db.
    shop_id = Column(UUID(as_uuid=True), nullable=True)

    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id"), nullable=True)

    # Staff role: owner | manager | cashier | storekeeper | accountant.
    # "admin" is a platform admin (shop_id is NULL). Legacy "customer" rows from
    # the removed self-registration flow may still exist but can no longer log in.
    role = Column(String(50), default="owner")

    # Fine-grained permission slugs (e.g. ["products", "sales", "reports"]).
    # Defaulted from role at staff-creation time; nullable for legacy rows.
    permissions = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), default=_utcnow)

    # relationships
    role_rel = relationship("Role", foreign_keys=[role_id])