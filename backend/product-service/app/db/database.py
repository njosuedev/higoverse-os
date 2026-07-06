import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv("DATABASE_URL", "")

# A tiny persistent pool (not NullPool) so a warm serverless instance reuses
# its connection across requests instead of paying a fresh TCP+SSL handshake
# (and, if the DB is a scale-to-zero instance, a wake-up) on every single
# request. pool_pre_ping guards against a connection going stale while idle;
# pool_recycle keeps us under typical proxy/idle-connection timeouts.
engine       = create_engine(
    DATABASE_URL, pool_size=1, max_overflow=2, pool_pre_ping=True, pool_recycle=280,
) if DATABASE_URL else None
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
