from datetime import datetime, timezone

from sqlalchemy import JSON, BigInteger, Boolean, Column, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base


class AdminMfa(Base):
    """The platform admin's authenticator-app second step. A table of its
    own, so turning it on never changes the users table."""
    __tablename__ = "admin_mfa"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    # Base32 secret shared with the authenticator app.
    secret = Column(String(64), nullable=False)
    # False while being set up (code not confirmed yet).
    enabled = Column(Boolean, nullable=False, default=False)
    # SHA-256 of each unused recovery code.
    recovery = Column(JSON, nullable=False, default=list)
    # The time step of the last accepted code (no code works twice).
    last_counter = Column(BigInteger, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    enabled_at = Column(DateTime(timezone=True), nullable=True)
