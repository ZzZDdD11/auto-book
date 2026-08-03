from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from backend.api import books, jobs, materials
from backend.db import init_db
from backend.settings import get_settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="auto-book", lifespan=lifespan)

# 本地开发的两个地址始终放开；FRONTEND_URL 部署时会换成 nginx 域名，
# 一起加进白名单（去重，避免部署环境正好也是这两个地址时重复）。
_default_origins = {"http://localhost:5273", "http://127.0.0.1:5273"}
_cors_origins = sorted(_default_origins | {get_settings().frontend_url})

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
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
    # 跳到前端页面。地址来自 settings.frontend_url（部署时用 FRONTEND_URL
    # 环境变量覆盖成 nginx 域名），不要硬编码 localhost —— 那只对"访问者和
    # 服务器是同一台机器"成立，部署到服务器后手机/其他电脑访问会跳到
    # 访问者自己设备上的 localhost，打不开。
    return RedirectResponse(url=get_settings().frontend_url)
