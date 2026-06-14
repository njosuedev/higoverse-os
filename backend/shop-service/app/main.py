from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.shops import router as shops_router

app = FastAPI(
    title="Higoverse Shop Service",
    description="Manages shop profiles stored in auth_db.shops",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://higoverse-os.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(shops_router)


@app.get("/")
def root():
    return {"service": "shop-service", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}
