import traceback
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.routes.app_updates import router as app_updates_router
from app.api.routes.settings import router as settings_router
from app.db.database import Base, engine

app = FastAPI(title="Settings Service", version="1.0.0")

_ALLOWED_ORIGINS = {
    "http://localhost:3000",
    "https://higoverse.vercel.app",
}


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # CORSMiddleware never gets to add headers to a response built by an
    # exception handler, so an unhandled 500 needs them added here too —
    # otherwise the browser reports it as a CORS error, hiding the real 500.
    origin = request.headers.get("origin", "")
    extra = {"Access-Control-Allow-Origin": origin} if origin in _ALLOWED_ORIGINS else {}
    # Full traceback goes to the function logs; the client gets a generic
    # message because the raw text can contain DB hosts, SQL or credentials.
    traceback.print_exception(exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"}, headers=extra)


app.add_middleware(
    CORSMiddleware,
    allow_origins=list(_ALLOWED_ORIGINS),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(settings_router)
# Public: latest Android / Windows releases for the apps' self-update.
app.include_router(app_updates_router)


@app.on_event("startup")
def on_startup():
    # Guarded: a missing/unreachable DATABASE_URL must not crash the ASGI
    # lifespan, which would otherwise take down every route instead of just
    # the DB-dependent endpoints.
    if not engine:
        return
    try:
        Base.metadata.create_all(bind=engine)
        # create_all doesn't add columns to an existing table.
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS car_types TEXT"))
            conn.execute(text("ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS car_names TEXT"))
            for col, kind in (("bank_name", "VARCHAR(100)"), ("bank_account", "VARCHAR(50)"), ("bank_holder", "VARCHAR(150)"), ("bank_accounts", "TEXT")):
                conn.execute(text(f"ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS {col} {kind}"))
    except Exception:
        pass


@app.get("/")
def root():
    return {"service": "settings-service", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}
