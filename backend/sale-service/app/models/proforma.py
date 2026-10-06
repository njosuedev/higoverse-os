import uuid
from sqlalchemy import Column, String, Numeric, DateTime, Text
from sqlalchemy.dialects.postgresql import JSON
from sqlalchemy.sql import func
from app.db.database import Base


class Proforma(Base):
    __tablename__ = "proformas"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    shop_id = Column(String, index=True, nullable=False)

    invoice_no = Column(String, nullable=False)
    date = Column(String, nullable=False)
    valid_until = Column(String, nullable=False)
    salesperson = Column(String, nullable=True)

    # Customer details as printed on the proforma. customer_id links a saved
    # customer (car sales always go to one) once there is one.
    customer_id = Column(String, nullable=True)
    customer = Column(String, nullable=True)
    customer_phone = Column(String, nullable=True)
    customer_address = Column(String, nullable=True)
    customer_id_no = Column(String, nullable=True)
    customer_tin = Column(String, nullable=True)
    customer_email = Column(String, nullable=True)
    customer_country = Column(String, nullable=True)
    customer_company = Column(String, nullable=True)
    notes = Column(Text, nullable=True)

    # Vehicles / items quoted (see ProformaLine).
    lines = Column(JSON, nullable=False, default=list)

    subtotal = Column(Numeric(12, 2), nullable=False, default=0)
    tax_rate = Column(Numeric(5, 2), nullable=False, default=0)
    tax_amount = Column(Numeric(12, 2), nullable=False, default=0)
    grand_total = Column(Numeric(12, 2), nullable=False, default=0)
    currency = Column(String(10), nullable=False, default="RWF")

    # Payment & finance terms
    payment_method = Column(String, nullable=True)
    bank_details = Column(Text, nullable=True)
    # Which of the company's bank accounts (Settings) are printed.
    bank_account_ids = Column(JSON, nullable=True)
    # The total of `deposits` (kept for older apps and the print).
    deposit_amount = Column(Numeric(12, 2), nullable=True)
    # Deposits / booking payments received before the sale, as JSON:
    # [{id, amount, method, date, reference, by, at}]. They count as paid
    # when the proforma becomes a sale.
    deposits = Column(JSON, nullable=True)
    terms = Column(Text, nullable=True)

    # draft → approved → sold (or expired). See routes/proforma.py.
    status = Column(String(20), nullable=False, default="draft")
    approved_by = Column(String, nullable=True)
    approved_at = Column(DateTime(timezone=True), nullable=True)
    sold_at = Column(DateTime(timezone=True), nullable=True)
    sale_ids = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
