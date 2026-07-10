import uuid
from sqlalchemy import Column, String, Integer, Numeric, DateTime, Text, Index
from sqlalchemy.sql import func
from app.db.database import Base


class Order(Base):
    __tablename__ = "orders"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))

    customer_id    = Column(String, index=True, nullable=False)   # JWT user_id of the buyer
    customer_name  = Column(String, nullable=True)
    customer_email = Column(String, nullable=True)
    delivery_phone = Column(String, nullable=False)

    # Fulfilling internal warehouse/branch, copied from product.shop_id at
    # order time — NOT the customer's shop_id (customers don't have one).
    shop_id = Column(String, index=True, nullable=False)

    product_id    = Column(String, index=True, nullable=False)
    product_name  = Column(String, nullable=True)    # snapshot at order time
    product_image = Column(Text, nullable=True)      # snapshot cover image

    quantity     = Column(Integer, nullable=False)
    unit_price   = Column(Numeric(12, 2), nullable=False)   # snapshot of selling_price
    total_amount = Column(Numeric(12, 2), nullable=False)

    delivery_address_text = Column(Text, nullable=False)
    delivery_lat = Column(Numeric(10, 7), nullable=True)
    delivery_lng = Column(Numeric(10, 7), nullable=True)
    delivery_notes = Column(Text, nullable=True)

    payment_method = Column(String(20), nullable=False, default="cash")   # cash | mobile_money
    status = Column(String(20), nullable=False, default="pending")
    # pending -> confirmed -> out_for_delivery -> delivered
    # cancelled reachable from any non-terminal state
    cancel_reason = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_orders_status_feed", status, created_at.desc()),
        Index("ix_orders_customer_feed", customer_id, created_at.desc()),
    )
