from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.db.database import Base, engine
from app.api.routes.suppliers import router as supplier_router

app = FastAPI(
    title="Supplier Service",
    version="1.0.0"
)

# -----------------------------
# CORS (CRITICAL FIX)
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
app.include_router(supplier_router)

# -----------------------------
# STARTUP (CREATE TABLES)
# -----------------------------
@app.on_event("startup")
def on_startup():
    """
    Auto-create DB tables (DEV ONLY).
    Use Alembic in production.
    """
    Base.metadata.create_all(bind=engine)


# -----------------------------
# HEALTH CHECK
# -----------------------------
@app.get("/")
def root():
    return {"service": "supplier-service", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}