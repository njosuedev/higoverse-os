from fastapi import FastAPI
from app.api.v1 import auth
from app.db.base import Base
from app.db.session import engine
from app.models import user, role, shop, refresh_token

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Higoverse Auth Service")

app.include_router(auth.router, prefix="/api/v1/auth")

@app.get("/")
def root():
    return {"status": "auth-service running"}