import uuid
from sqlalchemy import Column, String, Integer, Numeric, DateTime, Text
from sqlalchemy.sql import func
from app.db.database import Base


class Purchase(Base):
    __tablename__ = "purchases"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    shop_id = Column(String, index=True, nullable=False)

    # Product reference (nullable: if product was deleted after purchase)
    product_id = Column(String, index=True, nullable=True)
    # Name stored at purchase time for permanent history
    product_name = Column(String(255), nullable=False)

    supplier_id = Column(String, index=True, nullable=True)

    quantity_added = Column(Integer, nullable=False)
    cost_price = Column(Numeric(12, 2), nullable=False)
    selling_price = Column(Numeric(12, 2), nullable=True)
    total_cost = Column(Numeric(12, 2), nullable=False)

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
