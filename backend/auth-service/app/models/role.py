from sqlalchemy import Column, String
from app.db.base import Base
from sqlalchemy.dialects.postgresql import UUID
import uuid

class Role(Base):
    __tablename__ = "roles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(50), unique=True, nullable=False)