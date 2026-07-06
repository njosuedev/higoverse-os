from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.routes.products import router as product_router
from app.api.routes.internal import router as internal_router
from app.db.database import Base, engine

app = FastAPI(
    title="Product Service",
    version="1.0.0"
)

# -----------------------------
# CORS CONFIG (FIX FOR FETCH ERROR)
# -----------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://higoverse-os.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# ROUTES
# -----------------------------
app.include_router(product_router)
app.include_router(internal_router)


# -----------------------------
# STARTUP EVENT
# -----------------------------
@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    # Safe migrations — ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
    # are idempotent on PostgreSQL. `create_all` only creates tables/indexes
    # that don't exist yet, so on an already-existing `products` table it
    # silently skips columns/indexes added to the model later — these
    # statements are what actually land them on a live database.
    with engine.connect() as conn:
        for sql in [
            "ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100)",
            "ALTER TABLE products ADD COLUMN IF NOT EXISTS images TEXT",
            "ALTER TABLE products ADD COLUMN IF NOT EXISTS listed BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE products ADD COLUMN IF NOT EXISTS shop_is_active BOOLEAN NOT NULL DEFAULT TRUE",
            "CREATE INDEX IF NOT EXISTS ix_products_marketplace_feed ON products (created_at DESC, id DESC) WHERE listed = true",
            "CREATE INDEX IF NOT EXISTS ix_products_shop_feed ON products (shop_id, created_at DESC, id DESC) WHERE listed = true",
            "CREATE INDEX IF NOT EXISTS ix_products_category_feed ON products (category, created_at DESC, id DESC) WHERE listed = true",
            # Trigram index backs ILIKE '%term%' search on product name at scale.
            "CREATE EXTENSION IF NOT EXISTS pg_trgm",
            "CREATE INDEX IF NOT EXISTS ix_products_name_trgm ON products USING gin (name gin_trgm_ops)",
        ]:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                conn.rollback()


# -----------------------------
# HEALTH CHECK
# -----------------------------
@app.get("/")
def root():
    return {"service": "product-service", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}