from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import notifications
from app.db.session import engine
from app.models import notification  # noqa: F401 — register table

app = FastAPI(title="Higoverse Notification Service", redirect_slashes=False)


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

app.include_router(notifications.router, prefix="/api/v1", tags=["Notifications"])


@app.on_event("startup")
def on_startup():
    if not engine:
        return
    try:
        from app.models.notification import Notification
        Notification.__table__.create(bind=engine, checkfirst=True)
    except Exception:
        pass


@app.get("/")
def root():
    return {"status": "notification-service running"}


@app.get("/health")
def health():
    return {"status": "ok"}
