import traceback
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.routes.sales import router as sale_router
from app.api.routes.debts import router as debt_router
from app.api.routes.proforma import router as proforma_router
from app.realtime import router as live_router, hub
from app.db.database import Base, engine

app = FastAPI(title="Sale Service", version="1.0.0")

_ALLOWED_ORIGINS = {
    "http://localhost:3000",
    "https://higoverse.vercel.app",
}


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    origin = request.headers.get("origin", "")
    extra = {"Access-Control-Allow-Origin": origin} if origin in _ALLOWED_ORIGINS else {}
    # Full traceback goes to the function logs; the client gets a generic
    # message because the raw text can contain DB hosts, SQL or credentials.
    traceback.print_exception(exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"}, headers=extra)


app.add_middleware(
    CORSMiddleware,
    allow_origins=list(_ALLOWED_ORIGINS),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sale_router)
app.include_router(debt_router)
app.include_router(proforma_router)
app.include_router(live_router)


@app.on_event("startup")
def on_startup():
    # Guarded: a missing/unreachable DATABASE_URL must not crash the ASGI
    # lifespan, which would otherwise take down every route instead of just
    # the DB-dependent endpoints.
    if not engine:
        return
    try:
        Base.metadata.create_all(bind=engine)
        with engine.connect() as conn:
            conn.execute(text(
                "ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20)"
            ))
            conn.execute(text(
                "ALTER TABLE sales ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12, 2)"
            ))
            conn.commit()
    except Exception:
        pass


@app.on_event("startup")
async def start_live_hub():
    # Starts LISTENing for live events right away, not on the first phone.
    import asyncio
    hub.start(asyncio.get_running_loop())


@app.get("/")
def root():
    return {"service": "sale-service", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}
