import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

_url = settings.DATABASE_URL or os.getenv("DATABASE_URL", "")

# Small persistent pool (not NullPool) — lets a warm serverless instance
# reuse its connection instead of a fresh handshake/wake-up on every request.
engine       = create_engine(
    _url, pool_size=1, max_overflow=2, pool_pre_ping=True, pool_recycle=280,
) if _url else None
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine) if engine else None


def get_db():
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not configured")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
