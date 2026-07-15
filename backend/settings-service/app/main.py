import hashlib

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes.settings import router as settings_router
from app.core.config import settings
from app.db.database import Base, engine

app = FastAPI(title="Settings Service", version="1.0.0")

_ALLOWED_ORIGINS = {
    "http://localhost:3000",
    "https://aandtconsultants.vercel.app",
}


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # CORSMiddleware never gets to add headers to a response built by an
    # exception handler, so an unhandled 500 needs them added here too —
    # otherwise the browser reports it as a CORS error, hiding the real 500.
    origin = request.headers.get("origin", "")
    extra = {"Access-Control-Allow-Origin": origin} if origin in _ALLOWED_ORIGINS else {}
    return JSONResponse(status_code=500, content={"detail": str(exc)}, headers=extra)


app.add_middleware(
    CORSMiddleware,
    allow_origins=list(_ALLOWED_ORIGINS),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(settings_router)


@app.on_event("startup")
def on_startup():
    # Guarded: a missing/unreachable DATABASE_URL must not crash the ASGI
    # lifespan, which would otherwise take down every route instead of just
    # the DB-dependent endpoints.
    if not engine:
        return
    try:
        Base.metadata.create_all(bind=engine)
    except Exception:
        pass


@app.get("/")
def root():
    return {"service": "settings-service", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}


# TEMPORARY — remove after debugging the 401s across services.
# Returns a fingerprint only, never the actual secret.
@app.get("/debug/secret-fingerprint")
def secret_fingerprint():
    return {
        "fingerprint": hashlib.sha256(settings.SECRET_KEY.encode()).hexdigest()[:12],
        "length": len(settings.SECRET_KEY),
    }
