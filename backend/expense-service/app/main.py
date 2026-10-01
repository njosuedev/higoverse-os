from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes.expenses import router as expense_router
from app.db.database import Base, engine

app = FastAPI(title="Expense Service", version="1.0.0", redirect_slashes=False)

_ALLOWED_ORIGINS = {
    "http://localhost:3000",
    "https://higoverse.vercel.app",
}


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    origin = request.headers.get("origin", "")
    extra = {"Access-Control-Allow-Origin": origin} if origin in _ALLOWED_ORIGINS else {}
    return JSONResponse(status_code=500, content={"detail": str(exc)}, headers=extra)


app.add_middleware(
    CORSMiddleware,
    allow_origins=list(_ALLOWED_ORIGINS),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(expense_router)


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
            from sqlalchemy import text
            for col_sql in [
                "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS proof_data TEXT",
                "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_method TEXT",
                "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS bank_name TEXT",
                "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS bank_account TEXT",
                "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receiver_phone TEXT",
            ]:
                conn.execute(text(col_sql))
            conn.commit()
    except Exception:
        pass


@app.get("/")
def root():
    return {"service": "expense-service", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}
