from fastapi import FastAPI

app = FastAPI(
    title="Auth Service"
)

@app.get("/")
def root():
    return {"message": "Auth Service Running"}