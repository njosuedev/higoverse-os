import hashlib

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import auth, shop
from app.core.config import settings

app = FastAPI(
    title="A & T Consultants Auth Service"
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://aandtconsultants.vercel.app",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routes
app.include_router(
    auth.router,
    prefix="/api/v1/auth",
    tags=["Authentication"]
)

app.include_router(
    shop.router,
    prefix="/api/v1",
    tags=["Shop"]
)

@app.get("/")
def root():
    return {
        "status": "auth-service running"
    }


# TEMPORARY — remove after debugging the product-service 401.
# Returns a fingerprint only, never the actual secret.
@app.get("/debug/secret-fingerprint")
def secret_fingerprint():
    return {
        "fingerprint": hashlib.sha256(settings.SECRET_KEY.encode()).hexdigest()[:12],
        "length": len(settings.SECRET_KEY),
    }