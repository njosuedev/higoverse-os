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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://aandtconsultants.vercel.app",
    ],
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
    return JSONResponse(status_code=500, content={"detail": str(exc)})


@app.get("/")
def root():
    return {"service": "shop-service", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}
