from fastapi import FastAPI

from app.db.database import Base, engine
from app.api.routes.suppliers import router

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Supplier Service"
)

app.include_router(router)


@app.get("/")
def root():
    return {
        "service": "supplier-service",
        "status": "running"
    }