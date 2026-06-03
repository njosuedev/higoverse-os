from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import auth

app = FastAPI(title="Higoverse Auth Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://higoverse-os.vercel.app",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(
    auth.router,
    prefix="/api/v1/auth",
    tags=["Auth"]
)


@app.get("/")
def root():
    return {"status": "auth-service running"}