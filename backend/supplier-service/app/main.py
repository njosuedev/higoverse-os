import traceback
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.db.database import Base, engine
from app.api.routes.suppliers import router as supplier_router

app = FastAPI(
    title="Supplier Service",
    version="1.0.0"
)

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


# -----------------------------
# CORS (CRITICAL FIX)
# -----------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(_ALLOWED_ORIGINS),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# ROUTES
# -----------------------------
app.include_router(supplier_router)

# -----------------------------
# STARTUP (CREATE TABLES)
# -----------------------------
@app.on_event("startup")
def on_startup():
    """
    Auto-create DB tables (DEV ONLY).
    Use Alembic in production.
    """
    # Guarded: a missing/unreachable DATABASE_URL must not crash the ASGI
    # lifespan, which would otherwise take down every route (including
    # CORS preflight handling) instead of just the DB-dependent endpoints.
    if not engine:
        return
    try:
        Base.metadata.create_all(bind=engine)
    except Exception:
        pass


# -----------------------------
# HEALTH CHECK
# -----------------------------
@app.get("/")
def root():
    return {"service": "supplier-service", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}