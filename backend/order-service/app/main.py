import os
import re

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes.orders import router as order_router
from app.db.database import Base, engine

app = FastAPI(title="Order Service", version="1.0.0")

# -----------------------------
# CORS CONFIG
# -----------------------------
# Matches localhost/127.0.0.1 on any port (local dev), the production domain,
# and Vercel preview deployment URLs — instead of a fixed origin list that
# breaks the moment the frontend runs on a different port or preview URL.
# allow_credentials=False because auth here is a Bearer token in the
# Authorization header, not cookies.
CORS_ORIGIN_REGEX = os.getenv(
    "CORS_ALLOWED_ORIGIN_REGEX",
    r"^https?://localhost(:\d+)?$"
    r"|^https?://127\.0\.0\.1(:\d+)?$"
    r"|^https://higoverse-os(-[\w-]+)?\.vercel\.app$",
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

app.include_router(order_router)


@app.on_event("startup")
def on_startup():
    if not engine:
        return
    try:
        Base.metadata.create_all(bind=engine)
    except Exception:
        pass


@app.get("/")
def root():
    return {"service": "order-service", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}
