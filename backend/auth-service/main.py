from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import auth, shop

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