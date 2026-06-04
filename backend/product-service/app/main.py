from fastapi import FastAPI

from app.db.database import engine
from app.db.database import Base

from app.api.routes.products import router as product_router

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Product Service"
)

app.include_router(product_router)


@app.get("/")
def root():
    return {
        "service": "product-service",
        "status": "running"
    }