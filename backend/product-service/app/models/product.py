from sqlalchemy import (
    Column,
    String,
    Integer,
    Numeric,
    DateTime,
    Text,
    Boolean,
    Index,
    text,
)
from sqlalchemy.sql import func

from app.db.database import Base

import uuid


class Product(Base):
    __tablename__ = "products"

    # =====================================
    # PRIMARY KEY
    # =====================================

    id = Column(
        String,
        primary_key=True,
        default=lambda: str(uuid.uuid4())
    )

    # =====================================
    # MULTI-TENANT SHOP
    # =====================================

    shop_id = Column(
        String,
        index=True,
        nullable=False
    )

    # =====================================
    # SUPPLIER RELATION
    # =====================================

    supplier_id = Column(
        String,
        index=True,
        nullable=True
    )

    # =====================================
    # PRODUCT DETAILS
    # =====================================

    name = Column(
        String(255),
        nullable=False,
        index=True
    )

    description = Column(
        Text,
        nullable=True
    )

    barcode = Column(
        String(255),
        nullable=True,
        unique=False
    )

    # =====================================
    # PRICING
    # =====================================

    cost_price = Column(
        Numeric(12, 2),
        nullable=False
    )

    selling_price = Column(
        Numeric(12, 2),
        nullable=True
    )

    # =====================================
    # INVENTORY
    # =====================================

    quantity = Column(
        Integer,
        nullable=False,
        default=0
    )

    # =====================================
    # MARKETPLACE
    # =====================================

    category = Column(
        String(100),
        nullable=True
    )

    images = Column(
        Text,
        nullable=True
    )

    listed = Column(
        Boolean,
        nullable=False,
        default=False,
        server_default='false'
    )

    # =====================================
    # AUDIT
    # =====================================

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )

    # =====================================
    # INDEXES
    # =====================================
    # Backs the public marketplace feed's keyset pagination
    # (WHERE listed = true ORDER BY created_at DESC, id DESC).
    # Partial + covers only listed rows, so it stays small even as the
    # overall products table grows into the hundreds of thousands.
    __table_args__ = (
        Index(
            "ix_products_marketplace_feed",
            created_at.desc(),
            id.desc(),
            postgresql_where=text("listed = true"),
        ),
    )