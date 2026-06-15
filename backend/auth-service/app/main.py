from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api.v1 import auth
from app.api.v1 import shop
from app.db.session import engine as auth_engine
from app.db.shop_session import shop_engine
from app.models.shop import Shop

app = FastAPI(title="Higoverse Auth Service")


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": str(exc)})

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
    tags=["Authentication"]
)

app.include_router(
    shop.router,
    prefix="/api/v1",
    tags=["Shops"]
)


@app.on_event("startup")
def on_startup():
    if shop_engine:
        Shop.__table__.create(bind=shop_engine, checkfirst=True)
    if auth_engine:
        Shop.__table__.create(bind=auth_engine, checkfirst=True)


@app.get("/")
def root():
    return {"status": "auth-service running"}