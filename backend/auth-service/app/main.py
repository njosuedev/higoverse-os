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

app = FastAPI(title="Higoverse Auth Service", redirect_slashes=False)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": str(exc)})

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://higoverse-os.vercel.app",
        "http://localhost:3000",
    ],
    allow_credentials=True,
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