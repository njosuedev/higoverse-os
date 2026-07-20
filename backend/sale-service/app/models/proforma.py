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

    customer = Column(String, nullable=True)
    customer_phone = Column(String, nullable=True)
    customer_address = Column(String, nullable=True)
    notes = Column(Text, nullable=True)

    lines = Column(JSON, nullable=False, default=list)

    subtotal = Column(Numeric(12, 2), nullable=False, default=0)
    tax_rate = Column(Numeric(5, 2), nullable=False, default=0)
    tax_amount = Column(Numeric(12, 2), nullable=False, default=0)
    grand_total = Column(Numeric(12, 2), nullable=False, default=0)
    currency = Column(String(10), nullable=False, default="RWF")
    status = Column(String(20), nullable=False, default="draft")

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=True)
