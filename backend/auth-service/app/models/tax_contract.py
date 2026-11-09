import uuid
from datetime import datetime, timezone

from sqlalchemy import Column, Date, DateTime, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSON, UUID

from app.db.base import Base


def _now():
    return datetime.now(timezone.utc)


class TaxContract(Base):
    """A tax advisory contract between Higoverse and one of its tax clients
    (AMASEZERANO YO KUNGANIRA MU IBARURA MARI N'IMISORO), printed from the
    admin panel (apps/web lib/tax-contract-print.ts). Platform admin only; a
    table of its own (nothing existing changes).

    The client's details are copied in when the contract is made, so it
    prints as signed even if the client's row changes later. `company` holds
    Higoverse's side as printed (representative, phones, MoMo code, bank
    account…): it lives in the database, never in the (public) code.
    """
    __tablename__ = "tax_contracts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    client_id = Column(UUID(as_uuid=True), nullable=True, index=True)   # tax_clients.id

    contract_date = Column(Date, nullable=False)       # the day it is made
    start_date = Column(Date, nullable=False)          # from when it applies
    client_name = Column(String(255), nullable=False)
    client_tin = Column(String(9), nullable=True)
    client_phone = Column(String(20), nullable=True)
    client_representative = Column(String(255), nullable=True)
    monthly_fee = Column(Numeric(14, 2), nullable=False)
    payment_day = Column(Integer, nullable=False, default=28)   # paid by this day of each month
    notes = Column(Text, nullable=True)
    company = Column(JSON, nullable=False, default=dict)

    created_by = Column(String(255), nullable=True)    # admin email
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=_now, onupdate=_now)
