from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.routes.products import router as product_router
from app.db.database import Base, engine

app = FastAPI(
    title="Product Service",
    version="1.0.0"
)

# -----------------------------
# CORS CONFIG (FIX FOR FETCH ERROR)
# -----------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://higoverse-os.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------
# ROUTES
# -----------------------------
app.include_router(product_router)


# -----------------------------
# STARTUP EVENT
# -----------------------------
@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)
    # Safe migrations — ADD COLUMN IF NOT EXISTS is idempotent on PostgreSQL
    with engine.connect() as conn:
        for sql in [
            "ALTER TABLE products ADD COLUMN IF NOT EXISTS category VARCHAR(100)",
            "ALTER TABLE products ADD COLUMN IF NOT EXISTS images TEXT",
            "ALTER TABLE products ADD COLUMN IF NOT EXISTS listed BOOLEAN NOT NULL DEFAULT FALSE",
        ]:
            try:
                conn.execute(text(sql))
                conn.commit()
            except Exception:
                conn.rollback()


# -----------------------------
# HEALTH CHECK
# -----------------------------
@app.get("/")
def root():
    return {"service": "product-service", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}