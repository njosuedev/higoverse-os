from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import advisor
from app.db.base import Base
from app.db.session import engine

if engine:
    Base.metadata.create_all(bind=engine)

app = FastAPI(title="Higoverse AI Advisor", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],
    allow_credentials = False,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

app.include_router(advisor.router, prefix="/advisor", tags=["Advisor"])


@app.get("/")
def root():
    return {"status": "ai-advisor-service running", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"ok": True}
