import os
import traceback
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes.expenses import router as expense_router
from app.api.routes.payroll import router as payroll_router
from app.models import payroll as _payroll_models  # noqa: F401  (tables for create_all)
from app.db.database import Base, engine

app = FastAPI(
    # The API description (/docs, /openapi.json) lists every route; keep it
    # off the public internet unless ENABLE_API_DOCS=1 is set for debugging.
    openapi_url="/openapi.json" if os.getenv("ENABLE_API_DOCS") == "1" else None,
    title="Expense Service", version="1.0.0", redirect_slashes=False)

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

app.include_router(expense_router)
app.include_router(payroll_router)


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
                # Pay slip details
                "ALTER TABLE payroll_employees ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100)",
                "ALTER TABLE payroll_employees ADD COLUMN IF NOT EXISTS bank_account VARCHAR(60)",
                "ALTER TABLE payroll_employees ADD COLUMN IF NOT EXISTS contract_end DATE",
                "ALTER TABLE payroll_employees ADD COLUMN IF NOT EXISTS working_days INTEGER DEFAULT 26",
                "ALTER TABLE payroll_payments ADD COLUMN IF NOT EXISTS bonus NUMERIC(12,2) NOT NULL DEFAULT 0",
                "ALTER TABLE payroll_payments ADD COLUMN IF NOT EXISTS accommodation NUMERIC(12,2) NOT NULL DEFAULT 0",
                "ALTER TABLE payroll_payments ADD COLUMN IF NOT EXISTS overtime_hours NUMERIC(6,2) NOT NULL DEFAULT 0",
                "ALTER TABLE payroll_payments ADD COLUMN IF NOT EXISTS overtime_amount NUMERIC(12,2) NOT NULL DEFAULT 0",
                "ALTER TABLE payroll_payments ADD COLUMN IF NOT EXISTS bank_name VARCHAR(100)",
                "ALTER TABLE payroll_payments ADD COLUMN IF NOT EXISTS bank_account VARCHAR(60)",
                "ALTER TABLE payroll_payments ADD COLUMN IF NOT EXISTS contract_start DATE",
                "ALTER TABLE payroll_payments ADD COLUMN IF NOT EXISTS contract_end DATE",
                "ALTER TABLE payroll_payments ADD COLUMN IF NOT EXISTS working_days INTEGER",
                "ALTER TABLE payroll_payments ADD COLUMN IF NOT EXISTS late_days INTEGER NOT NULL DEFAULT 0",
                "ALTER TABLE payroll_payments ADD COLUMN IF NOT EXISTS leave_days INTEGER NOT NULL DEFAULT 0",
                "ALTER TABLE payroll_payments ADD COLUMN IF NOT EXISTS sick_days INTEGER NOT NULL DEFAULT 0",
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
