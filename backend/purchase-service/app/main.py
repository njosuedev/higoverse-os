from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes.purchases import router as purchase_router
from app.db.database import Base, engine

app = FastAPI(title="Purchase Service", version="1.0.0")

_ALLOWED_ORIGINS = {
    "http://localhost:3000",
    "https://higoverse.vercel.app",
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

app.include_router(purchase_router)


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
    return {"service": "purchase-service", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}
