import uuid
from sqlalchemy import Column, String, Integer, Numeric, DateTime, Text
from sqlalchemy.sql import func
from app.db.database import Base


class Sale(Base):
    __tablename__ = "sales"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    shop_id = Column(String, index=True, nullable=False)
    product_id = Column(String, index=True, nullable=False)
    customer_id = Column(String, index=True, nullable=True)

    product_name = Column(String, nullable=True)

    quantity = Column(Integer, nullable=False)
    unit_price = Column(Numeric(12, 2), nullable=False)
    cost_at_sale = Column(Numeric(12, 2), nullable=True)
    total_amount = Column(Numeric(12, 2), nullable=False)
    profit = Column(Numeric(12, 2), nullable=True)

    notes = Column(Text, nullable=True)
    payment_method = Column(String(20), nullable=True)
    amount_paid = Column(Numeric(12, 2), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
