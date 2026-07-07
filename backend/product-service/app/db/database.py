import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import NullPool

DATABASE_URL = os.getenv("DATABASE_URL", "")

# NullPool: Neon already pools connections (via its own pooler endpoint), and
# each Vercel serverless invocation is its own isolated process — a
# persistent SQLAlchemy pool on top of that double-pools and multiplies
# connections across concurrent invocations until Neon's connection limit is
# exhausted, which crashes the on_startup connect (and every request with it).
engine       = create_engine(DATABASE_URL, poolclass=NullPool) if DATABASE_URL else None
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine) if engine else None
Base         = declarative_base()


def get_db():
    if SessionLocal is None:
        raise RuntimeError("DATABASE_URL is not configured")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
