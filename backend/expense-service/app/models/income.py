"""Money the business earns outside its sales: rentals, services,
commissions, interest… (the Income page, next to Expenses). Rents recorded
in Sales → Rentals (sale-service) are added by the apps, not stored here.
"""
import uuid

from sqlalchemy import Column, DateTime, Numeric, String, Text
from sqlalchemy.sql import func

from app.db.database import Base

INCOME_SOURCES = ("rental", "services", "commission", "transport", "interest", "other")


class Income(Base):
    __tablename__ = "incomes"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    shop_id = Column(String, index=True, nullable=False)
    created_by = Column(String, nullable=False)

    title = Column(String(200), nullable=False)
    source = Column(String(20), nullable=False, default="other")   # INCOME_SOURCES
    amount = Column(Numeric(14, 2), nullable=False)
    income_date = Column(DateTime(timezone=True), nullable=False)
    payment_method = Column(String(10), nullable=True)               # cash | mtn | bank
    payer = Column(String(150), nullable=True)                       # who paid
    reference = Column(String(100), nullable=True)                   # receipt / transaction id
    notes = Column(Text, nullable=True)
    # "abroad" or "rwanda" (empty on older rows = Rwanda); see Expense.scope.
    scope = Column(String(10), nullable=True)
    # Receipts kept when an expense recorded by mistake moves here (same
    # JSON as Expense.proof_data: [{name, type, data}]).
    proof_data = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
