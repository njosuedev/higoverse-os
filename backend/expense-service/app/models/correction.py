"""The history of type corrections: an expense that was really income, or
income that was really an expense, moved to the right side
(routes/incomes.py). One row per correction, written once and never changed
or deleted: the app has no route to do it, and the database refuses it
(trigger made in main.py). `original` keeps the record exactly as it was
before the move (receipts are noted, not copied: they move with the record).
"""
import uuid

from sqlalchemy import Column, DateTime, Numeric, String, Text
from sqlalchemy.sql import func

from app.db.database import Base


class TransactionCorrection(Base):
    __tablename__ = "transaction_corrections"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    shop_id = Column(String, index=True, nullable=False)

    from_type = Column(String(10), nullable=False)        # "expense" | "income"
    to_type = Column(String(10), nullable=False)
    original_id = Column(String, nullable=False, index=True)
    new_id = Column(String, nullable=False, index=True)
    from_category = Column(String(30), nullable=True)     # expense category or income source
    to_category = Column(String(30), nullable=True)

    title = Column(String(200), nullable=False)
    amount = Column(Numeric(14, 2), nullable=False)
    transaction_date = Column(DateTime(timezone=True), nullable=True)
    original = Column(Text, nullable=False)               # JSON of the record before the move

    reason = Column(Text, nullable=False)
    corrected_by = Column(String, nullable=False)
    corrected_by_name = Column(String(150), nullable=True)
    corrected_by_role = Column(String(30), nullable=True)
    corrected_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
