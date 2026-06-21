from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings

_url = settings.ADVISOR_DB_URL

engine = create_engine(_url, poolclass=NullPool) if _url else None
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine) if engine else None


def get_db():
    if SessionLocal is None:
        raise RuntimeError("ADVISOR_DB_URL is not configured")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
