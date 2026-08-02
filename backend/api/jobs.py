import json
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from backend.core.cover import CoverError, size_for
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
    # 已产出的封面比例，供前端决定显示哪几个下载入口
    cover_ratios: list[str] = []


def _to_out(job: Job, session: Session | None = None) -> JobOut:
    ratios: list[str] = []
    if session is not None and job.id is not None:
        rows = session.exec(
            select(Asset).where(Asset.job_id == job.id, Asset.kind.startswith("cover:"))  # type: ignore[union-attr]
        ).all()
        ratios = [a.kind.split(":", 1)[1] for a in rows]
    return JobOut(
        id=job.id,
        status=job.status.value,
        error=job.error,
        cost_tokens=job.cost_tokens,
        copies=json.loads(job.copy_json) if job.copy_json else None,
        cover_ratios=ratios,
    )


def _asset_file(asset: Asset) -> Path:
    """校验资产路径落在 storage/ 内，防目录穿越。"""
    storage_root = get_settings().storage_dir.resolve()
    path = Path(asset.path).resolve()
    if not path.is_relative_to(storage_root):
        raise HTTPException(status_code=403, detail="非法的文件路径")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="文件已不存在")
    return path


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
    return _to_out(job, session)


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: int, session: SessionDep) -> JobOut:
    job = session.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    return _to_out(job, session)


@router.get("/{job_id}/video")
def download_video(job_id: int, session: SessionDep) -> FileResponse:
    asset = session.exec(
        select(Asset).where(Asset.job_id == job_id, Asset.kind == "video")
    ).first()
    if asset is None:
        raise HTTPException(status_code=404, detail="还没有成品视频")

    return FileResponse(
        _asset_file(asset), media_type="video/mp4", filename=f"auto-book-{job_id}.mp4"
    )


@router.get("/{job_id}/cover/{ratio}")
def download_cover(job_id: int, ratio: str, session: SessionDep) -> FileResponse:
    """下发指定比例的封面。

    ratio 会参与查库与文件名，必须先过白名单 —— size_for 不认的一律拒绝。
    """
    try:
        size = size_for(ratio)
    except CoverError:
        raise HTTPException(status_code=404, detail="不支持的封面比例") from None

    asset = session.exec(
        select(Asset).where(Asset.job_id == job_id, Asset.kind == f"cover:{size.ratio}")
    ).first()
    if asset is None:
        raise HTTPException(status_code=404, detail="还没有这个尺寸的封面")

    return FileResponse(
        _asset_file(asset),
        media_type="image/png",
        filename=f"auto-book-{job_id}-{size.ratio}.png",
    )
