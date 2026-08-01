import json
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from backend.core.pipeline import run_job
from backend.db import engine, get_session
from backend.models import Asset, Job, Material
from backend.settings import get_settings

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

SessionDep = Annotated[Session, Depends(get_session)]


class JobIn(BaseModel):
    material_id: int


class JobOut(BaseModel):
    id: int
    status: str
    error: str | None = None
    cost_tokens: int = 0
    # 不叫 copy —— 那会遮蔽 BaseModel.copy
    copies: dict[str, Any] | None = None


def _to_out(job: Job) -> JobOut:
    return JobOut(
        id=job.id,
        status=job.status.value,
        error=job.error,
        cost_tokens=job.cost_tokens,
        copies=json.loads(job.copy_json) if job.copy_json else None,
    )


async def _run_in_background(job_id: int) -> None:
    """后台任务用自己的 session，不复用请求的。"""
    with Session(engine) as session:
        await run_job(job_id, session)


@router.post("", status_code=status.HTTP_202_ACCEPTED, response_model=JobOut)
def create_job(
    payload: JobIn,
    background: BackgroundTasks,
    session: SessionDep,
) -> JobOut:
    material = session.get(Material, payload.material_id)
    if material is None:
        raise HTTPException(status_code=404, detail="素材不存在")

    job = Job(user_id=get_settings().default_user_id, material_id=material.id)
    session.add(job)
    session.commit()
    session.refresh(job)

    background.add_task(_run_in_background, job.id)
    return _to_out(job)


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: int, session: SessionDep) -> JobOut:
    job = session.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    return _to_out(job)


@router.get("/{job_id}/video")
def download_video(job_id: int, session: SessionDep) -> FileResponse:
    asset = session.exec(
        select(Asset).where(Asset.job_id == job_id, Asset.kind == "video")
    ).first()
    if asset is None:
        raise HTTPException(status_code=404, detail="还没有成品视频")

    # 路径必须落在 storage/ 内，防目录穿越
    storage_root = get_settings().storage_dir.resolve()
    path = Path(asset.path).resolve()
    if not path.is_relative_to(storage_root):
        raise HTTPException(status_code=403, detail="非法的文件路径")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="文件已不存在")

    return FileResponse(path, media_type="video/mp4", filename=f"auto-book-{job_id}.mp4")
