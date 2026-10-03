from sqlalchemy import Column, String
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
