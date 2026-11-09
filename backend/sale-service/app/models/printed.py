"""Every list Higoverse prints as a PDF (expenses, income, sales, purchases,
stock, partners…) is noted here once, so its QR code (core/doc_code.py, kind
"D") can be checked: scanning it says the document is genuine, from this
business, and what it held (period, how many records, the total). Rows are
only added.
"""
import uuid

from sqlalchemy import Column, DateTime, Integer, Numeric, String
from sqlalchemy.sql import func

from app.db.database import Base


class PrintedDocument(Base):
    __tablename__ = "printed_documents"

    id = Column(String(32), primary_key=True, default=lambda: uuid.uuid4().hex)
    shop_id = Column(String, index=True, nullable=False)
    kind = Column(String(30), nullable=False)          # expenses, income, sales, purchases, inventory, partners…
    title = Column(String(200), nullable=False)
    period_from = Column(String(10), nullable=True)    # YYYY-MM-DD
    period_to = Column(String(10), nullable=True)
    records = Column(Integer, nullable=True)
    total = Column(Numeric(16, 2), nullable=True)
    currency = Column(String(10), nullable=True)
    printed_by = Column(String, nullable=True)
    printed_by_name = Column(String(150), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
