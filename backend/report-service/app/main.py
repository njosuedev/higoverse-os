from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.reports import router as report_router

app = FastAPI(title="Report Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://aandtconsultants.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(report_router)


@app.get("/")
def root():
    return {"service": "report-service", "status": "running"}


@app.get("/health")
def health():
    return {"status": "ok"}
