from sqlalchemy import Column, String, Integer, Numeric, DateTime
from sqlalchemy.sql import func
from app.db.database import Base
import uuid


class Product(Base):
    __tablename__ = "products"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    shop_id = Column(String, index=True, nullable=False)

    name = Column(String, nullable=False)
    description = Column(String, nullable=True)

    cost_price = Column(Numeric(10, 2), nullable=False)

    # IMPORTANT: must be nullable
    selling_price = Column(Numeric(10, 2), nullable=True)

    quantity = Column(Integer, nullable=False)

    barcode = Column(String, nullable=True)

    created_at = Column(DateTime, server_default=func.now())