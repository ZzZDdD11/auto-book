import json
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from backend.core.cover import CoverError, size_for
from backend.core.pipeline import (
    patch_script_frame,
    regenerate_frame,
    run_job,
)
from backend.db import engine, get_session
from backend.models import Asset, Job, Material
from backend.schema.frames import FRAME_ORDER
from backend.settings import get_settings

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

SessionDep = Annotated[Session, Depends(get_session)]


class JobIn(BaseModel):
    material_id: int


class FramePatch(BaseModel):
    """单帧手改的请求体。

    frame 必须是五帧之一，它进 JSON path 和 setattr，必须白名单校验。
    patch 的字段必须匹配对应帧的 schema —— 由 patch_script_frame 校验。
    """

    frame: str
    patch: dict[str, Any]


class RegenerateIn(BaseModel):
    frame: str
    feedback: str | None = None


class CopyPatch(BaseModel):
    """文案编辑请求体。copies 的结构与 CopyPayload 一致。

    前端直接编辑 JSON 太难用，所以这里接受完整替换 ——
    前端展示三平台文案，用户改完后整体提交。
    """

    copies: dict[str, dict[str, Any]]


class JobOut(BaseModel):
    id: int
    status: str
    error: str | None = None
    cost_tokens: int = 0
    # 不叫 copy —— 那会遮蔽 BaseModel.copy
    copies: dict[str, Any] | None = None
    # 已产出的封面比例，供前端决定显示哪几个下载入口
    cover_ratios: list[str] = []
    # 当前视频版本号（最大 version）。None = 还没渲过
    video_version: int | None = None
    # 是否停在 _pending 等用户介入
    auto_advance: bool = True
    # 脚本（script_pending 及之后才有），供前端审稿
    script: dict[str, Any] | None = None


def _to_out(job: Job, session: Session | None = None) -> JobOut:
    ratios: list[str] = []
    video_version: int | None = None
    if session is not None and job.id is not None:
        rows = session.exec(
            select(Asset).where(Asset.job_id == job.id, Asset.kind.startswith("cover:"))  # type: ignore[union-attr]
        ).all()
        ratios = sorted({a.kind.split(":", 1)[1] for a in rows})

        videos = session.exec(
            select(Asset).where(Asset.job_id == job.id, Asset.kind == "video")
        ).all()
        if videos:
            video_version = max(a.version for a in videos)

    script: dict[str, Any] | None = None
    if job.script_json:
        try:
            script = json.loads(job.script_json)
        except json.JSONDecodeError:
            script = None

    return JobOut(
        id=job.id,
        status=job.status.value,
        error=job.error,
        cost_tokens=job.cost_tokens,
        copies=json.loads(job.copy_json) if job.copy_json else None,
        cover_ratios=ratios,
        video_version=video_version,
        auto_advance=job.auto_advance,
        script=script,
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
def download_video(
    job_id: int,
    session: SessionDep,
    version: int | None = None,
) -> FileResponse:
    """下载视频。默认最新版，可指定 version 拉历史。"""
    videos = session.exec(
        select(Asset).where(Asset.job_id == job_id, Asset.kind == "video")
    ).all()
    if not videos:
        raise HTTPException(status_code=404, detail="还没有成品视频")

    if version is None:
        asset = max(videos, key=lambda a: a.version)
    else:
        asset = next((a for a in videos if a.version == version), None)
        if asset is None:
            raise HTTPException(status_code=404, detail=f"没有版本 {version}")

    return FileResponse(
        _asset_file(asset),
        media_type="video/mp4",
        filename=f"auto-book-{job_id}-v{asset.version}.mp4",
    )


@router.get("/{job_id}/history")
def list_history(job_id: int, session: SessionDep) -> list[dict[str, Any]]:
    """列出该 job 的所有视频版本。"""
    videos = session.exec(
        select(Asset).where(Asset.job_id == job_id, Asset.kind == "video")
    ).all()
    return [
        {
            "version": a.version,
            "created_at": a.created_at.isoformat(),
            "size_bytes": Path(a.path).stat().st_size if Path(a.path).is_file() else 0,
        }
        for a in sorted(videos, key=lambda a: a.version, reverse=True)
    ]


@router.get("/{job_id}/audio/{frame}")
def download_audio(job_id: int, frame: str, session: SessionDep) -> FileResponse:
    """下发某一帧的配音 mp3。

    frame 白名单校验 —— 它进文件路径和查库。
    """
    if frame not in FRAME_ORDER:
        raise HTTPException(status_code=404, detail="不支持的帧名")

    asset = session.exec(
        select(Asset).where(
            Asset.job_id == job_id,
            Asset.kind == f"audio:{frame}",
        )
    ).first()
    if asset is None:
        raise HTTPException(status_code=404, detail="还没有这一帧的配音")

    return FileResponse(
        _asset_file(asset),
        media_type="audio/mpeg",
        filename=f"auto-book-{job_id}-{frame}.mp3",
    )


@router.get("/{job_id}/cover/{ratio}")
def download_cover(
    job_id: int,
    ratio: str,
    session: SessionDep,
    version: int | None = None,
) -> FileResponse:
    """下发指定比例的封面。

    ratio 会参与查库与文件名，必须先过白名单 —— size_for 不认的一律拒绝。
    """
    try:
        size = size_for(ratio)
    except CoverError:
        raise HTTPException(status_code=404, detail="不支持的封面比例") from None

    covers = session.exec(
        select(Asset).where(Asset.job_id == job_id, Asset.kind == f"cover:{size.ratio}")
    ).all()
    if not covers:
        raise HTTPException(status_code=404, detail="还没有这个尺寸的封面")

    if version is None:
        asset = max(covers, key=lambda a: a.version)
    else:
        asset = next((a for a in covers if a.version == version), None)
        if asset is None:
            raise HTTPException(status_code=404, detail=f"没有版本 {version}")

    return FileResponse(
        _asset_file(asset),
        media_type="image/png",
        filename=f"auto-book-{job_id}-{size.ratio}-v{asset.version}.png",
    )


# ============================================================
# 介入操作
# ============================================================


@router.patch("/{job_id}/script", response_model=JobOut)
async def patch_script(
    job_id: int,
    payload: FramePatch,
    session: SessionDep,
) -> JobOut:
    """手改某一帧。改完停在 render_pending，等用户 resume。

    evidence 仍过 strip_fake_evidence —— 护城河不能松。
    """
    if payload.frame not in FRAME_ORDER:
        raise HTTPException(status_code=422, detail=f"非法帧名：{payload.frame!r}")

    job = session.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    if not job.script_json:
        raise HTTPException(status_code=409, detail="脚本还没生成，无法编辑")

    try:
        patch_script_frame(job, session, payload.frame, payload.patch)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None

    # 重做该帧 TTS + 整体渲染
    from backend.core.pipeline import run_rendering, run_tts

    await run_tts(job, session, only=payload.frame)
    run_rendering(job, session)

    # 停在 render_pending 等用户 resume（patch_script_frame 已设 auto_advance=false，
    # 但 status 还是 done，要显式改）
    from backend.models import JobStatus

    job.status = JobStatus.render_pending
    session.add(job)
    session.commit()
    session.refresh(job)
    return _to_out(job, session)


@router.post("/{job_id}/regenerate-frame", response_model=JobOut)
async def regenerate(
    job_id: int,
    payload: RegenerateIn,
    session: SessionDep,
) -> JobOut:
    """AI 重写指定帧，其他四帧冻结。旧版进 history 可回滚。"""
    if payload.frame not in FRAME_ORDER:
        raise HTTPException(status_code=422, detail=f"非法帧名：{payload.frame!r}")

    job = session.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    if not job.script_json:
        raise HTTPException(status_code=409, detail="脚本还没生成，无法重写")

    try:
        await regenerate_frame(job, session, payload.frame, payload.feedback)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None

    # 重做该帧 TTS + 整体渲染
    from backend.core.pipeline import run_rendering, run_tts

    await run_tts(job, session, only=payload.frame)
    run_rendering(job, session)

    # 停在 render_pending 等用户 resume
    from backend.models import JobStatus

    job.status = JobStatus.render_pending
    session.add(job)
    session.commit()
    session.refresh(job)
    return _to_out(job, session)


@router.post("/{job_id}/resume", response_model=JobOut)
async def resume(
    job_id: int,
    background: BackgroundTasks,
    session: SessionDep,
) -> JobOut:
    """从 _pending 放行，auto_advance 恢复 true，继续往下跑。"""
    job = session.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    if not job.status.value.endswith("_pending"):
        raise HTTPException(status_code=409, detail=f"当前状态 {job.status.value} 不需要 resume")

    job.auto_advance = True
    session.add(job)
    session.commit()
    session.refresh(job)

    background.add_task(_run_in_background, job.id)
    return _to_out(job, session)


@router.patch("/{job_id}/copy", response_model=JobOut)
async def patch_copy(
    job_id: int,
    payload: CopyPatch,
    session: SessionDep,
) -> JobOut:
    """改文案。改完停在 copy_pending，等用户 resume。

    文案和视频是独立产物，改文案不需要重新渲染。
    """
    job = session.get(Job, job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    if not job.copy_json:
        raise HTTPException(status_code=409, detail="文案还没生成")

    job.copy_json = json.dumps(payload.copies, ensure_ascii=False)
    job.auto_advance = False
    session.add(job)
    session.commit()
    session.refresh(job)
    return _to_out(job, session)
