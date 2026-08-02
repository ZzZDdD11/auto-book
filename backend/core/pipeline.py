"""任务状态机：分阶段可暂停的流水线。

每个阶段完成后进入 _pending 状态。如果 auto_advance=true（默认），自动进下一阶段；
否则停住等 resume。任何编辑操作把 auto_advance 关掉。

阶段间状态全走数据库（script_json / Asset 行），不传内存变量 ——
暂停再继续可能跨进程，今天改一半明天 resume，进程早没了。

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
from backend.core.card import render_cards
from backend.core.cover import render_covers
from backend.core.deepseek import DeepSeekClient
from backend.core.payload import FrameAudio, build_payload
from backend.models import Asset, Book, Job, JobStatus, Material
from backend.schema.frames import FRAME_ORDER, Script
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


def _load_script(job: Job) -> Script:
    """从 job.script_json 恢复 Script 对象。"""
    if not job.script_json:
        raise ValueError("任务还没有脚本")
    return Script.model_validate_json(job.script_json)


def _next_version(session: Session, job_id: int, kind: str) -> int:
    """取这个 kind 当前的最大版本号 +1。"""
    rows = session.exec(
        select(Asset).where(Asset.job_id == job_id, Asset.kind == kind)
    ).all()
    return max((a.version for a in rows), default=0) + 1


def _load_material_and_book(session: Session, job: Job) -> tuple[Material, Book]:
    material = session.get(Material, job.material_id)
    if material is None:
        raise ValueError("素材不存在")
    book = session.get(Book, material.book_id)
    if book is None:
        raise ValueError("书籍不存在")
    return material, book


# ============================================================
# 阶段函数：每个完成一个生产环节，返回后由调度器决定是否继续
# ============================================================


async def run_scripting(
    job: Job,
    session: Session,
    *,
    client: Any | None = None,
) -> None:
    """阶段 1：素材 → 脚本。

    改素材重跑也走这里 —— 调用方负责把 job.status 退回 scripting。
    """
    client = client if client is not None else default_client()
    material, book = _load_material_and_book(session, job)

    year = datetime.now(UTC).year
    book_index = _book_index(session, job, book, year)

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
    script, tokens = await script_mod.generate_script(data, client)
    job.script_json = script.model_dump_json()
    job.cost_tokens += tokens
    session.add(job)
    session.commit()


async def run_tts(
    job: Job,
    session: Session,
    *,
    only: str | None = None,
    synthesize: Callable = tts_mod.synthesize,
) -> None:
    """阶段 2：脚本 → 五帧配音。

    only: 只重做某一帧（手改单帧 / AI 重写单帧后调用）。
          None = 全部五帧重做（首次或改素材后）。
    """
    settings = get_settings()
    script = _load_script(job)
    work_dir = job_dir_for(job.id or 0)

    kinds = [only] if only else list(FRAME_ORDER)
    for kind in kinds:
        frame = getattr(script, kind)
        result = await synthesize(
            frame.narration, settings.tts_voice, work_dir / f"{kind}.mp3"
        )
        # 单帧重做时，旧 mp3 被覆盖；DB 里旧的 audio Asset 行不删（保留历史）
        session.add(
            Asset(
                job_id=job.id,
                kind=f"audio:{kind}",
                path=str(result.audio_path) if result.audio_path else "",
            )
        )
    session.commit()


def run_rendering(
    job: Job,
    session: Session,
    *,
    prepare_public: Callable = render.prepare_job_public_dir,
    render_video: Callable = render.render_video,
    make_covers: Callable = render_covers,
    make_cards: Callable = render_cards,
    cleanup_public: Callable = render.cleanup_job_public_dir,
) -> None:
    """阶段 3：脚本 + 配音 → 视频 + 封面 + 图文卡片。

    整体渲染 —— Remotion 没法只渲一帧，全渲十几秒够快。
    每次渲染产出一个新版本（version+1），旧视频保留为历史。
    """
    settings = get_settings()
    script = _load_script(job)
    work_dir = job_dir_for(job.id or 0)

    # 从磁盘读回五帧的 mp3 —— 阶段间状态走 DB/文件，不传内存变量
    audio_files: dict[str, Path] = {}
    for kind in FRAME_ORDER:
        path = work_dir / f"{kind}.mp3"
        if path.is_file():
            audio_files[kind] = path

    # TtsResult 只用于 build_payload 算时长；从音频文件反推时长
    from backend.core.tts import TtsResult  # 延迟导入避免循环

    results: dict[str, TtsResult] = {}
    for kind in FRAME_ORDER:
        path = work_dir / f"{kind}.mp3"
        if path.is_file():
            duration = _probe_duration(path)
            results[kind] = TtsResult(audio_path=path, duration_s=duration)
        else:
            results[kind] = TtsResult(audio_path=None, duration_s=0.0)

    prepared = False
    try:
        public_map = prepare_public(job.id or 0, audio_files)
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

        version = _next_version(session, job.id or 0, "video")
        out_path = work_dir / f"v{version}.mp4"
        render_video(props_path, out_path)
        session.add(
            Asset(job_id=job.id, kind="video", path=str(out_path), version=version)
        )
        session.commit()

        # 封面：附加产物，失败不影响出片
        try:
            covers = make_covers(script, work_dir / "covers")
        except Exception as exc:  # noqa: BLE001
            covers = {}
            job.error = f"封面生成失败（视频正常）：{type(exc).__name__}: {exc}"[:1000]
        for ratio, path in covers.items():
            session.add(
                Asset(
                    job_id=job.id,
                    kind=f"cover:{ratio}",
                    path=str(path),
                    version=version,
                )
            )
        session.commit()

        # 图文卡片：附加产物，失败不影响出片，也不连带封面/视频
        try:
            cards = make_cards(script, work_dir / "cards")
        except Exception as exc:  # noqa: BLE001
            cards = {}
            job.error = f"图文卡片生成失败（视频正常）：{type(exc).__name__}: {exc}"[:1000]
        for index, path in cards.items():
            session.add(
                Asset(
                    job_id=job.id,
                    kind=f"card:{index}",
                    path=str(path),
                    version=version,
                )
            )
        session.commit()
    finally:
        if prepared:
            cleanup_public(job.id or 0)


async def run_copywriting(
    job: Job,
    session: Session,
    *,
    client: Any | None = None,
    generate_copy: Callable = copywrite.generate_copy,
) -> None:
    """阶段 4：脚本 → 三平台文案。"""
    client = client if client is not None else default_client()
    script = _load_script(job)
    copy, tokens = await generate_copy(script, client)
    job.copy_json = copy.model_dump_json()
    job.cost_tokens += tokens
    session.add(job)
    session.commit()


# ============================================================
# 调度器：读 status，调对应阶段，根据 auto_advance 决定是否继续
# ============================================================


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
    make_cards: Callable = render_cards,
) -> None:
    """调度器：从 job.status 对应的阶段开始跑，直到 done 或 _pending。

    阶段间全走 DB，所以这个函数可以从任意状态续跑 ——
    包括跨进程：今天改一半明天 resume，重启后端也能继续。
    """
    job = session.get(Job, job_id)
    if job is None:
        raise ValueError(f"任务不存在：{job_id}")

    settings = get_settings()
    client = client if client is not None else default_client()

    try:
        # scripting → script_pending
        if job.status in (JobStatus.pending, JobStatus.scripting):
            _touch(session, job, JobStatus.scripting)
            await run_scripting(job, session, client=client)
            _touch(session, job, JobStatus.script_pending)
            if not job.auto_advance:
                return

        # script_pending → tts → tts_pending
        if job.status in (JobStatus.script_pending, JobStatus.tts):
            _touch(session, job, JobStatus.tts)
            await run_tts(job, session, synthesize=synthesize)
            if settings.pause_after_tts:
                _touch(session, job, JobStatus.tts_pending)
                if not job.auto_advance:
                    return
            # 默认跳过 tts_pending，直接进 rendering

        # tts_pending / rendering → render_pending
        if job.status in (
            JobStatus.tts_pending,
            JobStatus.tts,
            JobStatus.rendering,
        ):
            _touch(session, job, JobStatus.rendering)
            run_rendering(
                job,
                session,
                prepare_public=prepare_public,
                render_video=render_video,
                make_covers=make_covers,
                make_cards=make_cards,
                cleanup_public=cleanup_public,
            )
            _touch(session, job, JobStatus.render_pending)
            if not job.auto_advance:
                return

        # render_pending → copywriting → copy_pending → done
        if job.status in (JobStatus.render_pending, JobStatus.copywriting):
            _touch(session, job, JobStatus.copywriting)
            await run_copywriting(
                job, session, client=client, generate_copy=generate_copy
            )
            _touch(session, job, JobStatus.copy_pending)
            if not job.auto_advance:
                return

        # copy_pending → done
        if job.status in (JobStatus.copy_pending,):
            _touch(session, job, JobStatus.done)

    except Exception as exc:
        job.error = f"{type(exc).__name__}: {exc}"[:1000]
        _touch(session, job, JobStatus.failed)
        raise


# ============================================================
# 介入操作：编辑 / 重写 / resume
# ============================================================


def patch_script_frame(
    job: Job,
    session: Session,
    frame: str,
    patch: dict[str, Any],
) -> Script:
    """手改某一帧的字段。

    evidence 仍过 strip_fake_evidence —— 护城河不能松。
    改完后 auto_advance=false，停在 render_pending 等用户 resume。
    """
    if frame not in FRAME_ORDER:
        raise ValueError(f"非法帧名：{frame!r}")

    script = _load_script(job)
    frame_obj = getattr(script, frame)

    # 校验 patch 的字段都属于这一帧
    allowed = set(frame_obj.model_fields.keys())
    unknown = set(patch.keys()) - allowed
    if unknown:
        raise ValueError(f"帧 {frame} 不支持字段：{unknown}")

    updated = frame_obj.model_copy(update=patch)
    # 如果改的是 evidence，重新过子串校验
    if frame == "breakdown" and "points" in patch:
        material, _ = _load_material_and_book(session, job)
        script_mod.strip_fake_evidence(script, material.source_text)

    setattr(script, frame, updated)
    job.script_json = script.model_dump_json()
    job.auto_advance = False
    session.add(job)
    session.commit()
    return script


async def regenerate_frame(
    job: Job,
    session: Session,
    frame: str,
    feedback: str | None = None,
    *,
    client: Any | None = None,
) -> Script:
    """AI 重写指定帧，其他四帧冻结。

    旧版整份 script_json 追加到 history，可回滚。
    重写后 auto_advance=false，停在 render_pending。
    """
    if frame not in FRAME_ORDER:
        raise ValueError(f"非法帧名：{frame!r}")

    client = client if client is not None else default_client()
    script = _load_script(job)

    # 旧版进 history
    history: list[str] = []
    if job.script_json_history:
        history = json.loads(job.script_json_history)
    history.append(job.script_json or "")
    job.script_json_history = json.dumps(history, ensure_ascii=False)

    # 调 AI 只重写这一帧
    new_frame, tokens = await script_mod.regenerate_single_frame(
        script, frame, feedback, client
    )
    setattr(script, frame, new_frame)
    job.script_json = script.model_dump_json()
    job.cost_tokens += tokens
    job.auto_advance = False
    session.add(job)
    session.commit()
    return script


async def resume_job(job: Job, session: Session) -> None:
    """从 _pending 状态放行，auto_advance 恢复 true，继续往下跑。"""
    job.auto_advance = True
    session.add(job)
    session.commit()
    await run_job(job.id or 0, session)


# ============================================================
# 工具
# ============================================================


def _probe_duration(path: Path) -> float:
    """用 ffprobe 读音频时长。阶段间状态走 DB/文件，不传内存变量。"""
    import shutil
    import subprocess

    ffprobe = shutil.which("ffprobe")
    if ffprobe is None:
        return 0.0
    try:
        result = subprocess.run(  # noqa: S603  列表参数，绝对路径
            [
                ffprobe, "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=nw=1", str(path),
            ],
            capture_output=True, text=True, check=False, shell=False,
            timeout=10,
        )
        return float(result.stdout.strip() or 0)
    except (ValueError, subprocess.TimeoutExpired):
        return 0.0
