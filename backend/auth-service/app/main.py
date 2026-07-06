import os
import re

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.v1 import auth
from app.api.v1 import shop
from app.api.v1 import admin
from app.db.session import engine as auth_engine
from app.db.shop_session import shop_engine
from app.models.shop import Shop
from app.models.password_reset import PasswordReset  # noqa: F401 — registers table
from app.models import user, role, refresh_token  # noqa: F401 — keeps all mapper classes in registry

# Matches localhost/127.0.0.1 on any port (local dev), the production domain,
# and Vercel preview deployment URLs — instead of a fixed origin list that
# breaks the moment the frontend runs on a different port or preview URL.
# Override via CORS_ALLOWED_ORIGIN_REGEX if the frontend ever moves domains.
CORS_ORIGIN_REGEX = os.getenv(
    "CORS_ALLOWED_ORIGIN_REGEX",
    r"^https?://localhost(:\d+)?$"
    r"|^https?://127\.0\.0\.1(:\d+)?$"
    r"|^https://higoverse-os(-[\w-]+)?\.vercel\.app$",
)
_origin_matcher = re.compile(CORS_ORIGIN_REGEX)

app = FastAPI(title="Higoverse Auth Service", redirect_slashes=False)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # CORSMiddleware never gets to add headers to a response built by an
    # exception handler, so an unhandled 500 needs them added here too —
    # otherwise the browser reports it as a CORS error, hiding the real 500.
    origin = request.headers.get("origin", "")
    extra = {"Access-Control-Allow-Origin": origin} if origin and _origin_matcher.match(origin) else {}
    return JSONResponse(status_code=500, content={"detail": str(exc)}, headers=extra)

# allow_credentials=False because auth here is a Bearer token in the
# Authorization header, not cookies — so a browser never needs to send
# credentials cross-origin, and we're free to match origins broadly.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(
    auth.router,
    prefix="/api/v1/auth",
    tags=["Authentication"]
)

app.include_router(
    shop.router,
    prefix="/api/v1",
    tags=["Shops"]
)

app.include_router(
    admin.router,
    prefix="/api/v1/admin",
    tags=["Admin"]
)


_MIGRATIONS = [
    "ALTER TABLE shops ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP",
    "ALTER TABLE shops ADD COLUMN IF NOT EXISTS logo_url TEXT",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255)",
    "CREATE INDEX IF NOT EXISTS ix_shops_active_created ON shops (is_active, created_at DESC)",
]

@app.on_event("startup")
def on_startup():
    for engine in [auth_engine, shop_engine]:
        if not engine:
            continue
        try:
            Shop.__table__.create(bind=engine, checkfirst=True)
            PasswordReset.__table__.create(bind=engine, checkfirst=True)
            with engine.connect() as conn:
                for sql in _MIGRATIONS:
                    conn.execute(text(sql))
                conn.commit()
        except Exception:
            pass


@app.get("/")
def root():
    return {"status": "auth-service running"}


@app.get("/health")
def health():
    return {"status": "ok"}