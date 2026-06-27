import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from app.core.config import settings

_url = settings.DATABASE_URL or os.getenv("DATABASE_URL", "")
# Render.com provides postgres:// but SQLAlchemy 2.0 requires postgresql://
if _url.startswith("postgres://"):
    _url = "postgresql://" + _url[len("postgres://"):]

engine       = create_engine(_url, poolclass=NullPool) if _url else None
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine) if engine else None


def get_db():
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not configured")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
