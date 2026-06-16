from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool
from app.core.config import settings

_url = settings.SHOP_DB_URL

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
