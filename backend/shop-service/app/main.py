from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes.shops import router as shops_router
from app.db.database import Base, engine

app = FastAPI(
    title="A & T Consultants Shop Service",
    description="Manages shop profiles stored in auth_db.shops",
    version="1.0.0",
)

_ALLOWED_ORIGINS = {
    "http://localhost:3000",
    "https://aandtconsultants.vercel.app",
}

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(_ALLOWED_ORIGINS),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(shops_router)


@app.on_event("startup")
def on_startup():
    if engine:
        Base.metadata.create_all(bind=engine)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # CORSMiddleware never gets to add headers to a response built by an
    # exception handler, so an unhandled 500 needs them added here too —
    # otherwise the browser reports it as a CORS error, hiding the real 500.
    origin = request.headers.get("origin", "")
    extra = {"Access-Control-Allow-Origin": origin} if origin in _ALLOWED_ORIGINS else {}
    return JSONResponse(status_code=500, content={"detail": str(exc)}, headers=extra)


@app.get("/")
def root():
    return {"service": "shop-service", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}
