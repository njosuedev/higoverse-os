from sqlalchemy import Boolean, Column, DateTime, String, UniqueConstraint
from sqlalchemy.sql import func

from app.db.database import Base


class CatalogueLink(Base):
    """A short catalogue link (higoverse.com/c/<code>): which shop, whether
    prices show, in which currency and language. One code per combination,
    so sharing again gives the same link."""

    __tablename__ = "catalogue_links"
    __table_args__ = (UniqueConstraint("shop_id", "prices", "currency", "lang", name="uq_catalogue_link"),)

    code = Column(String(12), primary_key=True)
    shop_id = Column(String, nullable=False, index=True)
    prices = Column(Boolean, nullable=False, default=True)
    currency = Column(String(3), nullable=False, default="RWF")
    lang = Column(String(5), nullable=False, default="en")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
