from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.expenses import router as expense_router
from app.db.database import Base, engine

app = FastAPI(title="Expense Service", version="1.0.0", redirect_slashes=False)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://higoverse-os.vercel.app",
    ],
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
            conn.execute(text(
                "ALTER TABLE expenses ADD COLUMN IF NOT EXISTS proof_data TEXT"
            ))
            conn.commit()


@app.get("/")
def root():
    return {"service": "expense-service", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}
