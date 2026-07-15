import hashlib

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes.expenses import router as expense_router
from app.core.config import settings
from app.db.database import Base, engine

app = FastAPI(title="Expense Service", version="1.0.0", redirect_slashes=False)

_ALLOWED_ORIGINS = {
    "http://localhost:3000",
    "https://aandtconsultants.vercel.app",
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
    if engine is not None:
        Base.metadata.create_all(bind=engine)
        # Add proof_data column if it doesn't exist (safe idempotent migration)
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


@app.get("/")
def root():
    return {"service": "expense-service", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}


# TEMPORARY — remove after debugging the 401s across services.
# Returns a fingerprint only, never the actual secret.
@app.get("/debug/secret-fingerprint")
def secret_fingerprint():
    return {
        "fingerprint": hashlib.sha256(settings.SECRET_KEY.encode()).hexdigest()[:12],
        "length": len(settings.SECRET_KEY),
    }
