from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from fastapi import HTTPException

from app.core.config import settings

def _clean_url(url: str) -> str:
    """Remove parameters unsupported by SQLAlchemy (e.g. channel_binding)."""
    if not url:
        return url
    if "?" not in url:
        return url
    base, qs = url.split("?", 1)
    kept = [p for p in qs.split("&") if not p.startswith("channel_binding")]
    return base + ("?" + "&".join(kept) if kept else "")

_url = _clean_url(settings.ADVISOR_DB_URL)

try:
    engine       = create_engine(_url, poolclass=NullPool) if _url else None
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine) if engine else None
except Exception as e:
    print(f"[advisor] DB engine init failed: {e}")
    engine       = None
    SessionLocal = None


def get_db():
    if SessionLocal is None:
        raise HTTPException(status_code=503, detail="Database not available.")
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
