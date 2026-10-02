from sqlalchemy import (
    Column,
    String,
    Integer,
    Numeric,
    DateTime,
    Text,
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
    # CATALOG DETAILS
    # =====================================

    category = Column(
        String(100),
        nullable=True
    )

    images = Column(
        Text,
        nullable=True
    )

    # Small JPEG data-URL of the first image, so lists don't load `images`.
    thumbnail = Column(
        Text,
        nullable=True
    )

    # JSON-encoded dict of layout-specific fields (e.g. a car business's
    # make/model/year/VIN) — keeps the table generic across business types.
    attributes = Column(
        Text,
        nullable=True
    )

    # =====================================
    # AUDIT
    # =====================================

    created_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False
    )