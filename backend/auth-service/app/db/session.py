import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from app.core.config import settings

_url = settings.DATABASE_URL or os.getenv("DATABASE_URL", "")

# NullPool: Neon already pools connections, and each Vercel serverless
# invocation is its own isolated process — a persistent SQLAlchemy pool on
# top of that double-pools and multiplies connections across concurrent
# invocations until Neon's connection limit is exhausted.
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
