from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.purchases import router as purchase_router
from app.db.database import Base, engine

app = FastAPI(title="Purchase Service", version="1.0.0")

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

app.include_router(purchase_router)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


@app.get("/")
def root():
    return {"service": "purchase-service", "status": "running"}
