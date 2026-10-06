import logging
import os
import re

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("auth-service")

from app.api.v1 import auth
from app.api.v1 import shop
from app.api.v1 import admin
from app.api.v1 import team
from app.db.session import engine as auth_engine
from app.db.shop_session import shop_engine
from app.models.shop import Shop
from app.models.password_reset import PasswordReset  # noqa: F401 — registers table
from app.models.role import Role
from app.models.user import User
from app.models.refresh_token import RefreshToken

# Matches localhost/127.0.0.1 on any port (local dev), the production domain,
# and Vercel preview deployment URLs — instead of a fixed origin list that
# breaks the moment the frontend runs on a different port or preview URL.
# Override via CORS_ALLOWED_ORIGIN_REGEX if the frontend ever moves domains.
CORS_ORIGIN_REGEX = os.getenv(
    "CORS_ALLOWED_ORIGIN_REGEX",
    r"^https?://localhost(:\d+)?$"
    r"|^https?://127\.0\.0\.1(:\d+)?$"
    r"|^https://higoverse(-[\w-]+)?\.vercel\.app$",
)
_origin_matcher = re.compile(CORS_ORIGIN_REGEX)

app = FastAPI(title="Higoverse Auth Service", redirect_slashes=False)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # CORSMiddleware never gets to add headers to a response built by an
    # exception handler, so an unhandled 500 needs them added here too —
    # otherwise the browser reports it as a CORS error, hiding the real 500.
    # logger.exception (not just logging the message) captures the full
    # traceback in Vercel's function logs, which str(exc) alone would drop.
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    origin = request.headers.get("origin", "")
    extra = {"Access-Control-Allow-Origin": origin} if origin and _origin_matcher.match(origin) else {}

    # A missing SHOP_DB_URL/DATABASE_URL surfaces here as a bare RuntimeError
    # from get_db()/get_shop_db() — that's a config problem, not a server
    # bug, so report it as 503 with an actionable message instead of a 500.
    if isinstance(exc, RuntimeError) and "not configured" in str(exc):
        return JSONResponse(status_code=503, content={"detail": str(exc)}, headers=extra)

    # Details stay in the logs above — the raw message can contain DB hosts or SQL.
    return JSONResponse(status_code=500, content={"detail": "Internal server error"}, headers=extra)

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

app.include_router(
    team.router,
    prefix="/api/v1",
    tags=["Team"]
)


_MIGRATIONS = [
    "ALTER TABLE shops ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP",
    "ALTER TABLE shops ADD COLUMN IF NOT EXISTS logo_url TEXT",
    "ALTER TABLE shops ADD COLUMN IF NOT EXISTS layout VARCHAR(32) NOT NULL DEFAULT 'retail'",
    "ALTER TABLE shops ADD COLUMN IF NOT EXISTS tin VARCHAR(9)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255)",
    "CREATE INDEX IF NOT EXISTS ix_shops_active_created ON shops (is_active, created_at DESC)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSON",
    "ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE",
    "ALTER TABLE refresh_tokens ADD COLUMN IF NOT EXISTS replaced_by UUID",
]

@app.on_event("startup")
def on_startup():
    for engine in [auth_engine, shop_engine]:
        if not engine:
            continue
        try:
            Shop.__table__.create(bind=engine, checkfirst=True)
            PasswordReset.__table__.create(bind=engine, checkfirst=True)
            # roles before users (users.role_id FK -> roles.id), users before refresh_tokens
            Role.__table__.create(bind=engine, checkfirst=True)
            User.__table__.create(bind=engine, checkfirst=True)
            RefreshToken.__table__.create(bind=engine, checkfirst=True)
            with engine.connect() as conn:
                for sql in _MIGRATIONS:
                    conn.execute(text(sql))
                conn.commit()
        except Exception:
            pass


@app.get("/")
def root():
    return {"status": "auth-service running"}


def _db_report(engine):
    # Reports which DB host/name this deployment actually resolved a URL to
    # (credentials stripped) — lets us confirm a Vercel env var change took
    # effect, and that the expected tables actually exist, without exposing
    # the password.
    if engine is None:
        return {"target": "unset", "tables": None}
    url = engine.url
    target = f"{url.host}/{url.database}"
    try:
        with engine.connect() as conn:
            rows = conn.execute(text(
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema='public' ORDER BY table_name"
            ))
            return {"target": target, "tables": [r[0] for r in rows]}
    except Exception as e:
        return {"target": target, "tables": f"query failed: {e}"}


@app.get("/health")
def health():
    auth_db = _db_report(auth_engine)
    shop_db = _db_report(shop_engine)
    return {
        "status": "ok",
        "db_target": auth_db["target"],
        "tables": auth_db["tables"],
        "shop_db_target": shop_db["target"],
        "shop_db_tables": shop_db["tables"],
    }
