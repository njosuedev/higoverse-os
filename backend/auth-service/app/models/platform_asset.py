from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, String, Text

from app.db.base import Base


def _now():
    return datetime.now(timezone.utc)


class PlatformAsset(Base):
    """Higoverse's own files kept by the platform admin, by name — today
    "company_stamp": the stamp with the signature printed on Higoverse's side
    of every tax contract (a data URL). In the database, not the (public)
    code. A table of its own (nothing existing changes)."""
    __tablename__ = "platform_assets"

    key = Column(String(50), primary_key=True)
    data = Column(Text, nullable=False)
    updated_by = Column(String(255), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=_now, onupdate=_now)
