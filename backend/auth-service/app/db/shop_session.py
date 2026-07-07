from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from app.core.config import settings

_url = settings.SHOP_DB_URL

# NullPool: Neon already pools connections, and each Vercel serverless
# invocation is its own isolated process — a persistent SQLAlchemy pool on
# top of that double-pools and multiplies connections across concurrent
# invocations until Neon's connection limit is exhausted.
shop_engine       = create_engine(_url, poolclass=NullPool) if _url else None
ShopSessionLocal  = sessionmaker(autocommit=False, autoflush=False, bind=shop_engine) if shop_engine else None


def get_shop_db():
    if ShopSessionLocal is None:
        raise RuntimeError("SHOP_DB_URL is not configured")
    db = ShopSessionLocal()
    try:
        yield db
    finally:
        db.close()
