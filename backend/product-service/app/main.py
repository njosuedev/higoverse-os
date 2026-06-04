from fastapi import FastAPI

from app.api.routes.products import router as product_router
from app.db.database import Base, engine

app = FastAPI(
    title="Product Service",
    version="1.0.0"
)

# -----------------------------
# ROUTES
# -----------------------------
app.include_router(product_router)


# -----------------------------
# STARTUP EVENT (PROFESSIONAL WAY)
# -----------------------------
@app.on_event("startup")
def on_startup():
    """
    Create database tables safely on startup.
    In production, replace with Alembic migrations.
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
