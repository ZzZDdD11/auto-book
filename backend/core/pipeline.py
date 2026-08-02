"""任务状态机：pending → scripting → tts → rendering → done | failed

所有外部依赖通过参数注入，方便测试时替换。
"""

import json
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlmodel import Session, select

from backend.core import copywrite, render
from backend.core import script as script_mod
from backend.core import tts as tts_mod
from backend.core.cover import render_covers
from backend.core.deepseek import DeepSeekClient
from backend.core.payload import FrameAudio, build_payload
from backend.models import Asset, Book, Job, JobStatus, Material
from backend.schema.frames import FRAME_ORDER
from backend.settings import get_settings


def _touch(session: Session, job: Job, status: JobStatus) -> None:
    job.status = status
    job.updated_at = datetime.now(UTC)
    session.add(job)
    session.commit()


def default_client() -> DeepSeekClient:
    s = get_settings()
    return DeepSeekClient(
        api_key=s.deepseek_api_key.get_secret_value(),
        base_url=s.deepseek_base_url,
        model=s.deepseek_model,
    )


def job_dir_for(job_id: int) -> Path:
    d = get_settings().storage_dir / "jobs" / render.safe_job_id(job_id)
    d.mkdir(parents=True, exist_ok=True)
    return d


def _book_index(session: Session, job: Job, book: Book, year: int) -> int:
    """今年第几本。

    按创建时间排序取序号，而不是数总数 ——
    这样同一本书重复出视频时序号稳定，不会每次都变。
    """
    books = sorted(
        (
            b
            for b in session.exec(select(Book).where(Book.user_id == job.user_id)).all()
            if b.created_at.year == year
        ),
        key=lambda b: (b.created_at, b.id or 0),
    )
    ids = [b.id for b in books]
    return ids.index(book.id) + 1 if book.id in ids else len(ids) + 1


async def run_job(
    job_id: int,
    session: Session,
    *,
    client: Any | None = None,
    job_dir: Path | None = None,
    generate_script: Callable = script_mod.generate_script,
    synthesize: Callable = tts_mod.synthesize,
    prepare_public: Callable = render.prepare_job_public_dir,
    render_video: Callable = render.render_video,
    generate_copy: Callable = copywrite.generate_copy,
    cleanup_public: Callable = render.cleanup_job_public_dir,
    make_covers: Callable = render_covers,
) -> None:
    settings = get_settings()
    job = session.get(Job, job_id)
    if job is None:
        raise ValueError(f"任务不存在：{job_id}")

    client = client if client is not None else default_client()
    work_dir = job_dir if job_dir is not None else job_dir_for(job_id)
    prepared = False

    try:
        material = session.get(Material, job.material_id)
        if material is None:
            raise ValueError("素材不存在")
        book = session.get(Book, material.book_id)
        if book is None:
            raise ValueError("书籍不存在")

        year = datetime.now(UTC).year
        book_index = _book_index(session, job, book, year)

        # ---- 阶段 1：生成脚本 ----
        _touch(session, job, JobStatus.scripting)
        data = script_mod.ScriptInput(
            book_title=book.title,
            book_author=book.author,
            book_index=book_index,
            year=year,
            source_text=material.source_text,
            my_take=material.my_take,
            chapter=material.chapter,
            highlighted_at=material.highlighted_at,
            progress=material.progress,
            mode=material.mode,
        )
        script, tokens = await generate_script(data, client)
        job.script_json = script.model_dump_json()
        job.cost_tokens += tokens
        session.add(job)
        session.commit()

        # ---- 阶段 2：配音 ----
        _touch(session, job, JobStatus.tts)
        results: dict[str, Any] = {}
        for kind, frame in script.iter_frames():
            results[kind] = await synthesize(
                frame.narration, settings.tts_voice, work_dir / f"{kind}.mp3"
            )

        audio_files = {
            kind: r.audio_path for kind, r in results.items() if r.audio_path is not None
        }
        for path in audio_files.values():
            session.add(Asset(job_id=job.id, kind="audio", path=str(path)))
        session.commit()

        # ---- 阶段 3：渲染 ----
        _touch(session, job, JobStatus.rendering)
        public_map = prepare_public(job.id, audio_files)
        prepared = True

        payload = build_payload(
            script,
            [
                FrameAudio(kind=k, tts=results[k], public_src=public_map.get(k))
                for k in FRAME_ORDER
            ],
            fps=settings.fps,
            padding_s=settings.frame_padding_s,
            silent_s=settings.silent_frame_s,
            bgm_src=render.resolve_bgm(settings.bgm_src),
            bgm_volume=settings.bgm_volume,
            bgm_volume_solo=settings.bgm_volume_solo,
        )
        props_path = work_dir / "props.json"
        props_path.write_text(
            json.dumps(payload.model_dump(by_alias=True, mode="json"), ensure_ascii=False),
            "utf-8",
        )

        out_path = work_dir / "video.mp4"
        render_video(props_path, out_path)
        session.add(Asset(job_id=job.id, kind="video", path=str(out_path)))
        session.commit()

        # ---- 阶段 3.5：封面 ----
        # 封面是附加产物，失败不该让整个任务废掉 ——
        # 视频和文案才是主体，前面花的 AI 钱都在那里。
        try:
            covers = make_covers(script, work_dir / "covers")
        except Exception as exc:  # noqa: BLE001  封面失败不影响出片
            covers = {}
            job.error = f"封面生成失败（视频正常）：{type(exc).__name__}: {exc}"[:1000]
        for ratio, path in covers.items():
            session.add(
                Asset(job_id=job.id, kind=f"cover:{ratio}", path=str(path))
            )
        session.commit()

        # ---- 阶段 4：文案 ----
        copy, copy_tokens = await generate_copy(script, client)
        job.copy_json = copy.model_dump_json()
        job.cost_tokens += copy_tokens
        session.add(job)
        session.commit()

        _touch(session, job, JobStatus.done)

    except Exception as exc:
        job.error = f"{type(exc).__name__}: {exc}"[:1000]
        _touch(session, job, JobStatus.failed)
    finally:
        if prepared:
            cleanup_public(job_id)
