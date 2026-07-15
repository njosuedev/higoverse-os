import asyncio

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes.notifications import router as notif_router
from app.core.events import set_event_loop
from app.db.database import Base, engine

app = FastAPI(title="A & T Consultants Notification Service", version="1.0.0")

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

app.include_router(notif_router)


@app.on_event("startup")
async def on_startup():
    set_event_loop(asyncio.get_event_loop())
    if engine:
        Base.metadata.create_all(bind=engine)


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": str(exc)})


@app.get("/")
def root():
    return {"service": "notification-service", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}
