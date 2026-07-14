from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.routes.sales import router as sale_router
from app.api.routes.debts import router as debt_router
from app.db.database import Base, engine

app = FastAPI(title="Sale Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://higoverse-os.vercel.app",
        "https://aandtconsulatnts.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sale_router)
app.include_router(debt_router)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        conn.execute(text(
            "ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20)"
        ))
        conn.execute(text(
            "ALTER TABLE sales ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12, 2)"
        ))
        conn.commit()


@app.get("/")
def root():
    return {"service": "sale-service", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}
