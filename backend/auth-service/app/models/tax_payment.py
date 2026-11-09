import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, Date, DateTime, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID

from app.db.base import Base


def _now():
    return datetime.now(timezone.utc)


class TaxPayment(Base):
    """A tax client paying Higoverse its monthly fee (the real income, next to
    the expected income of the agreed fees). Platform admin only; a table of
    its own (nothing existing changes)."""
    __tablename__ = "tax_payments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id = Column(UUID(as_uuid=True), nullable=False, index=True)   # tax_clients.id
    period = Column(String(7), nullable=False, index=True)                # the month paid for, YYYY-MM
    amount = Column(Numeric(14, 2), nullable=False)
    paid_on = Column(Date, nullable=False)
    method = Column(String(10), nullable=True)                            # cash | mtn | bank
    reference = Column(String(100), nullable=True)
    notes = Column(Text, nullable=True)
    created_by = Column(String(255), nullable=True)                       # admin email
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)
