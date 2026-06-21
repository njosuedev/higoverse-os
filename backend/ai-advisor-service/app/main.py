from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import advisor, subscription
from app.db.base import Base
from app.db.session import engine

# Auto-create tables on startup
if engine:
    Base.metadata.create_all(bind=engine)

app = FastAPI(
    title       = "Higoverse AI Advisor",
    description = "Premium AI-powered business intelligence for shop owners.",
    version     = "1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://higoverse-os.vercel.app",
        "http://localhost:3000",
        "http://localhost:3001",
    ],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

app.include_router(advisor.router,      prefix="/advisor",              tags=["Advisor"])
app.include_router(subscription.router, prefix="/advisor/subscription", tags=["Subscription"])


@app.get("/")
def root():
    return {"status": "ai-advisor-service running", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"ok": True}
