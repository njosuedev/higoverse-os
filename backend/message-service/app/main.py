import asyncio

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import conversations
from app.core.events import set_event_loop
from app.db.session import engine
from app.models import conversation, message  # noqa: F401 — register tables

ALLOWED_ORIGINS = [
    "https://higoverse-os.vercel.app",
    "http://localhost:3000",
]

app = FastAPI(title="Higoverse Message Service", redirect_slashes=False)


# NOTE: @app.exception_handler(Exception) is handled by ServerErrorMiddleware which sits
# OUTSIDE CORSMiddleware in Starlette's stack, so 500 responses lose their CORS headers.
# Fix: add CORS headers manually inside the handler so the browser can read the error.
@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    origin = request.headers.get("origin", "")
    extra = (
        {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
        }
        if origin in ALLOWED_ORIGINS
        else {}
    )
    return JSONResponse(status_code=500, content={"detail": str(exc)}, headers=extra)


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(conversations.router, prefix="/api/v1", tags=["Messages"])


@app.on_event("startup")
async def on_startup():
    # Capture the running event loop so sync route handlers can publish SSE events
    set_event_loop(asyncio.get_event_loop())

    if not engine:
        return
    try:
        from app.models.conversation import Conversation
        from app.models.message import Message
        Conversation.__table__.create(bind=engine, checkfirst=True)
        Message.__table__.create(bind=engine, checkfirst=True)
    except Exception:
        pass

    # Widen product_image from VARCHAR(1000) → TEXT so long CDN/base64 URLs don't 500
    try:
        from sqlalchemy import text
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE conversations "
                "ALTER COLUMN product_image TYPE TEXT"
            ))
    except Exception:
        pass  # already TEXT, or table doesn't exist yet — both are fine

    # Add edit/delete columns to messages (safe to run repeatedly — IF NOT EXISTS)
    try:
        from sqlalchemy import text
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE messages "
                "ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE"
            ))
            conn.execute(text(
                "ALTER TABLE messages "
                "ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ"
            ))
    except Exception:
        pass


@app.get("/")
def root():
    return {"status": "message-service running"}


@app.get("/health")
def health():
    return {"status": "ok"}
