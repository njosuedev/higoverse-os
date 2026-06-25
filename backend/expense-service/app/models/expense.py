import uuid
from sqlalchemy import Column, String, Numeric, DateTime, Text, Enum as SAEnum
from sqlalchemy.sql import func
from app.db.database import Base
import enum


class ExpenseCategory(str, enum.Enum):
    rent        = "rent"
    utilities   = "utilities"
    salaries    = "salaries"
    supplies    = "supplies"
    maintenance = "maintenance"
    marketing   = "marketing"
    transport   = "transport"
    taxes       = "taxes"
    other       = "other"


class Expense(Base):
    __tablename__ = "expenses"

    id           = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    shop_id      = Column(String, index=True, nullable=False)
    created_by   = Column(String, nullable=False)

    title        = Column(String, nullable=False)
    category     = Column(SAEnum(ExpenseCategory), nullable=False, default=ExpenseCategory.other)
    amount       = Column(Numeric(12, 2), nullable=False)
    notes        = Column(Text, nullable=True)

    expense_date     = Column(DateTime(timezone=True), nullable=False)
    created_at       = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    proof_data       = Column(Text, nullable=True)

    payment_method   = Column(String, nullable=True)   # "mtn" | "bank"
    bank_name        = Column(String, nullable=True)   # e.g. "BK Bank"
    bank_account     = Column(String, nullable=True)   # account number / reference
    receiver_phone   = Column(String, nullable=True)   # phone of money recipient
