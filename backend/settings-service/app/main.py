from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.settings import router as settings_router
from app.db.database import Base, engine

app = FastAPI(title="Settings Service", version="1.0.0")

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

app.include_router(settings_router)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


@app.get("/")
def root():
    return {"service": "settings-service", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}
