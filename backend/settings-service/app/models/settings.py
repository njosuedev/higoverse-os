import uuid
from sqlalchemy import Column, String, Integer, Numeric, DateTime, Text
from sqlalchemy.sql import func
from app.db.database import Base


class ShopSettings(Base):
    __tablename__ = "shop_settings"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    shop_id = Column(String, unique=True, index=True, nullable=False)

    shop_name = Column(String(255), nullable=True)
    phone = Column(String(50), nullable=True)
    address = Column(String(500), nullable=True)

    currency = Column(String(10), default="RWF", nullable=False)
    language = Column(String(10), default="rw", nullable=False)
    low_stock_threshold = Column(Integer, default=10, nullable=False)
    tax_rate = Column(Numeric(5, 2), default=0, nullable=False)

    # JSON list of the shop's own car types (car-company layout), added on
    # top of the built-in ones in apps/web/lib/business-layout.ts.
    car_types = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
