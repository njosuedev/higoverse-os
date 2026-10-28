from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, String
from uuid import uuid4

from app.db.database import Base


class Supplier(Base):
    __tablename__ = "suppliers"

    id = Column(
        String,
        primary_key=True,
        default=lambda: str(uuid4())
    )

    shop_id = Column(String, nullable=False)

    name = Column(String, nullable=False)

    phone = Column(String)

    email = Column(String)

    address = Column(String)

    # National ID / passport number (car companies require it for buyers).
    id_number = Column(String)

    # Customers: as printed on proformas (a supplier's TIN stays in `address`).
    tin = Column(String(9))
    company = Column(String)
    country = Column(String)

    # When it was added (newest first in pickers). Empty on records made
    # before this column existed.
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))
