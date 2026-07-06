import os

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
# CORS CONFIG
# -----------------------------
# Matches localhost/127.0.0.1 on any port (local dev), the production domain,
# and Vercel preview deployment URLs — instead of a fixed origin list that
# breaks the moment the frontend runs on a different port or preview URL.
# Override via CORS_ALLOWED_ORIGIN_REGEX if the frontend ever moves domains.
# allow_credentials=False because auth here is a Bearer token in the
# Authorization header, not cookies — so a browser never needs to send
# credentials cross-origin, and we're free to match origins broadly.
CORS_ORIGIN_REGEX = os.getenv(
    "CORS_ALLOWED_ORIGIN_REGEX",
    r"^https?://localhost(:\d+)?$"
    r"|^https?://127\.0\.0\.1(:\d+)?$"
    r"|^https://higoverse-os(-[\w.]+)?\.vercel\.app$",
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_credentials=False,
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