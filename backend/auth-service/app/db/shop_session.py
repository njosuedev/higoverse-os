from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.config import settings

_url = settings.SHOP_DB_URL

# Small persistent pool (not NullPool) — lets a warm serverless instance
# reuse its connection instead of a fresh handshake/wake-up on every request.
shop_engine       = create_engine(
    _url, pool_size=1, max_overflow=2, pool_pre_ping=True, pool_recycle=280,
) if _url else None
ShopSessionLocal  = sessionmaker(autocommit=False, autoflush=False, bind=shop_engine) if shop_engine else None


def get_shop_db():
    if ShopSessionLocal is None:
        raise RuntimeError("SHOP_DB_URL is not configured")
    db = ShopSessionLocal()
    try:
        yield db
    finally:
        db.close()
