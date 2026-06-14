import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func

from app.db.database import Base


class Shop(Base):
    """
    Maps to the existing `shops` table in auth_db.
    shop-service is the canonical owner of shop profile CRUD.
    auth-service creates the row on registration; everything else goes here.
    """
    __tablename__ = "shops"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name        = Column(String(255), nullable=False)
    email       = Column(String(255), unique=True)
    phone       = Column(String(50))
    address     = Column(String(500))
    description = Column(Text)
    is_active   = Column(Boolean, default=True)
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, onupdate=func.now())
