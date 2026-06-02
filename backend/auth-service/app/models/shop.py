from sqlalchemy import Column, String, Boolean, DateTime
from app.db.base import Base
from sqlalchemy.dialects.postgresql import UUID
import uuid
from datetime import datetime

class Shop(Base):
    __tablename__ = "shops"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    name = Column(String(255), nullable=False)
    email = Column(String(255), unique=True)
    phone = Column(String(50))

    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)