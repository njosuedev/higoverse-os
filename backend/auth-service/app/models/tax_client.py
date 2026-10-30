import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base


def _now():
    return datetime.now(timezone.utc)


class TaxClient(Base):
    """Higoverse's own tax customers: companies and people whose tax filing
    we handle. Seen and kept by the platform admin only. A table of its own
    (nothing existing changes)."""
    __tablename__ = "tax_clients"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    delegate = Column(String(255), nullable=True)  # the person we deal with
    phone = Column(String(20), nullable=True)      # international form, +250…
    tin = Column(String(9), nullable=True)         # RRA TIN, 9 digits
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=_now, onupdate=_now)

    # One client per TIN (Postgres lets many rows have no TIN).
    __table_args__ = (Index("ux_tax_clients_tin", "tin", unique=True),)
