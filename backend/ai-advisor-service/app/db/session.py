from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from fastapi import HTTPException

from app.core.config import settings

_url = settings.ADVISOR_DB_URL

try:
    engine = create_engine(_url, poolclass=NullPool, connect_args={"sslmode": "require"}) if _url else None
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine) if engine else None
except Exception:
    engine = None
    SessionLocal = None


def get_db():
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not configured. Set ADVISOR_DB_URL.")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
