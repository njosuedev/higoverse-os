import traceback
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.routes.reports import router as report_router

app = FastAPI(title="Report Service", version="1.0.0")

_ALLOWED_ORIGINS = {
    "http://localhost:3000",
    "https://higoverse.vercel.app",
}


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    origin = request.headers.get("origin", "")
    extra = {"Access-Control-Allow-Origin": origin} if origin in _ALLOWED_ORIGINS else {}
    # Full traceback goes to the function logs; the client gets a generic
    # message because the raw text can contain DB hosts, SQL or credentials.
    traceback.print_exception(exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"}, headers=extra)


app.add_middleware(
    CORSMiddleware,
    allow_origins=list(_ALLOWED_ORIGINS),
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
