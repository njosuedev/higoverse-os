from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import conversations
from app.db.session import engine
from app.models import conversation, message  # noqa: F401 — register tables

app = FastAPI(title="Higoverse Message Service", redirect_slashes=False)


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": str(exc)})


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://higoverse-os.vercel.app",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(conversations.router, prefix="/api/v1", tags=["Messages"])


@app.on_event("startup")
def on_startup():
    if not engine:
        return
    try:
        from app.models.conversation import Conversation
        from app.models.message import Message
        Conversation.__table__.create(bind=engine, checkfirst=True)
        Message.__table__.create(bind=engine, checkfirst=True)
    except Exception:
        pass


@app.get("/")
def root():
    return {"status": "message-service running"}


@app.get("/health")
def health():
    return {"status": "ok"}
