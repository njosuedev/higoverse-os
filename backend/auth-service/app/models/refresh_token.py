from sqlalchemy import Column, String, DateTime, ForeignKey
from app.db.base import Base
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime, timezone


def _utcnow():
    return datetime.now(timezone.utc)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))

    # SHA-256 hex digest of the opaque refresh token — never store it in plaintext.
    token = Column(String, unique=True, nullable=False)

    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=_utcnow)

    # Set once this token has been exchanged at /auth/refresh: the id of the
    # token that replaced it. The old token stays usable until that successor
    # is used, so a refresh whose reply never reached the device (slow or
    # dropped connection, app closed mid-request) doesn't sign the user out.
    replaced_by = Column(UUID(as_uuid=True), nullable=True)