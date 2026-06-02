from fastapi import FastAPI

app = FastAPI(
    title="Higoverse Auth Service",
    version="1.0.0"
)

@app.get("/")
def root():
    return {
        "service": "auth-service",
        "status": "running"
    }