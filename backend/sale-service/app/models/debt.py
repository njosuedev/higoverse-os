import uuid
from sqlalchemy import Column, String, Numeric, DateTime, Text, Boolean
from sqlalchemy.sql import func
from app.db.database import Base


class Debt(Base):
    __tablename__ = "debts"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    shop_id = Column(String, index=True, nullable=False)
    sale_id = Column(String, nullable=True)
    debtor_name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    amount_owed = Column(Numeric(12, 2), nullable=False)
    amount_paid = Column(Numeric(12, 2), default=0, nullable=False)
    notes = Column(Text, nullable=True)
    is_paid = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
