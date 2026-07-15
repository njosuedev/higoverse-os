import hashlib

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes.reports import router as report_router
from app.core.config import settings

app = FastAPI(title="Report Service", version="1.0.0")

_ALLOWED_ORIGINS = {
    "http://localhost:3000",
    "https://aandtconsultants.vercel.app",
}


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
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

app.include_router(report_router)


@app.get("/")
def root():
    return {"service": "report-service", "status": "running"}


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
