from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from backend.api import books, jobs, materials
from backend.db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="auto-book", lifespan=lifespan)

# v1 只在本机跑，只放开本地前端
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5273", "http://127.0.0.1:5273"],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(books.router)
app.include_router(materials.router)
app.include_router(jobs.router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/", include_in_schema=False)
def root() -> RedirectResponse:
    # v1 只在本机跑，前端 dev server 固定这个地址（和上面 CORS 白名单一致）
    return RedirectResponse(url="http://localhost:5273")
