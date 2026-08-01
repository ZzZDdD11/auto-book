from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api import jobs, materials
from backend.db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="auto-book", lifespan=lifespan)

# v1 只在本机跑，只放开本地前端
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(materials.router)
app.include_router(jobs.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
