from sqlalchemy import Column, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from app.db.base import Base
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(String, nullable=False)

    is_active = Column(Boolean, default=True)

    shop_id = Column(UUID(as_uuid=True), ForeignKey("shops.id"), nullable=True)

    # ----------------------------
    # ROLE SYSTEM (KEEP BOTH)
    # ----------------------------

    role_id = Column(UUID(as_uuid=True), ForeignKey("roles.id"), nullable=True)

    # SIMPLE FALLBACK ROLE (used in JWT + fast checks)
    role = Column(String(50), default="owner")

    created_at = Column(DateTime, default=datetime.utcnow)

    # relationships
    shop = relationship("Shop")
    role_rel = relationship("Role", foreign_keys=[role_id])