import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Column, DateTime, Index, String
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base


class AdminAudit(Base):
    """What the platform admin did, and to whom: created, edited, turned off
    or deleted a company or a user. A table of its own (nothing existing
    changes); rows are only ever added."""
    __tablename__ = "admin_audit"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    admin_id = Column(UUID(as_uuid=True), nullable=True)
    admin_email = Column(String(255), nullable=True)
    action = Column(String(40), nullable=False)       # e.g. shop.create, user.role
    target_type = Column(String(10), nullable=False)  # shop | user
    target_id = Column(String(64), nullable=True)
    target_label = Column(String(255), nullable=True)  # name/email at the time
    detail = Column(JSON, nullable=True)

    __table_args__ = (Index("ix_admin_audit_at", "at"),)
