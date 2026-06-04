from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
    """
    Auto-create tables (DEV ONLY).
    In production: use Alembic migrations.
    """
    Base.metadata.create_all(bind=engine)


# -----------------------------
# HEALTH CHECK
# -----------------------------
@app.get("/")
def root():
    return {
        "service": "product-service",
        "status": "running"
    }