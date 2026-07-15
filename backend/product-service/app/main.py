import hashlib
import os
import re

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.routes.products import router as product_router
from app.core.config import settings
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
    r"|^https://aandtconsultants(-[\w-]+)?\.vercel\.app$",
)
_origin_matcher = re.compile(CORS_ORIGIN_REGEX)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # CORSMiddleware never gets to add headers to a response built by an
    # exception handler, so an unhandled 500 needs them added here too —
    # otherwise the browser reports it as a CORS error, hiding the real 500.
    origin = request.headers.get("origin", "")
    extra = {"Access-Control-Allow-Origin": origin} if origin and _origin_matcher.match(origin) else {}
    return JSONResponse(status_code=500, content={"detail": str(exc)}, headers=extra)


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


# -----------------------------
# STARTUP EVENT
# -----------------------------
@app.on_event("startup")
def on_startup():
    # Guarded end-to-end: a missing/unreachable DATABASE_URL or any DDL
    # failure here must not crash the ASGI lifespan, which would otherwise
    # take down every route in the service (including /health) instead of
    # just the DB-dependent endpoints.
    if not engine:
        return
    try:
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
                # Trigram index backs ILIKE '%term%' search on product name at scale.
                "CREATE EXTENSION IF NOT EXISTS pg_trgm",
                "CREATE INDEX IF NOT EXISTS ix_products_name_trgm ON products USING gin (name gin_trgm_ops)",
            ]:
                try:
                    conn.execute(text(sql))
                    conn.commit()
                except Exception:
                    conn.rollback()
    except Exception:
        pass


# -----------------------------
# HEALTH CHECK
# -----------------------------
@app.get("/")
def root():
    return {"service": "product-service", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}


# TEMPORARY — remove after debugging the 401 on /products/.
# Returns a fingerprint only, never the actual secret.
@app.get("/debug/secret-fingerprint")
def secret_fingerprint():
    return {
        "fingerprint": hashlib.sha256(settings.SECRET_KEY.encode()).hexdigest()[:12],
        "length": len(settings.SECRET_KEY),
    }