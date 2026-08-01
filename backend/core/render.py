"""调用 Remotion CLI 渲染视频。

安全要点：
  - subprocess 用列表参数 + shell=False，绝不拼字符串
  - job_id 与帧名都走白名单校验，不信任任何外部输入
  - 所有路径先 resolve 再校验落在预期目录内
"""

import re
import shutil
import subprocess
from pathlib import Path

from backend.settings import get_settings

COMPOSITION_ID = "Book60"
ENTRY_POINT = "src/index.ts"

_FRAME_NAME = re.compile(r"^[a-z_]{1,20}$")


class RenderError(RuntimeError):
    pass


def safe_job_id(job_id: object) -> str:
    """job_id 会进文件路径和命令行，必须是正整数，别的一律拒绝。"""
    if isinstance(job_id, bool) or not isinstance(job_id, int) or job_id < 1:
        raise RenderError(f"非法 job_id：{job_id!r}")
    return str(job_id)


def _public_root() -> Path:
    return (get_settings().video_dir / "public").resolve()


def prepare_job_public_dir(job_id: int, audio_files: dict[str, Path]) -> dict[str, str]:
    """把音频拷进 video/public/jobs/<id>/，返回 {帧名: staticFile 相对路径}。

    Remotion 只能通过 staticFile() 访问 public 目录下的文件，
    所以必须拷进去，不能直接引用 storage/ 里的路径。
    """
    sid = safe_job_id(job_id)
    public_root = _public_root()
    target = (public_root / "jobs" / sid).resolve()
    if not target.is_relative_to(public_root):
        raise RenderError("目标目录越出 public 范围")

    target.mkdir(parents=True, exist_ok=True)
    mapping: dict[str, str] = {}
    for name, src in audio_files.items():
        if not _FRAME_NAME.match(name):
            raise RenderError(f"非法帧名：{name!r}")
        if not src.is_file():
            raise RenderError(f"音频文件不存在：{name}")
        dest = target / f"{name}.mp3"
        shutil.copyfile(src, dest)
        mapping[name] = f"jobs/{sid}/{name}.mp3"
    return mapping


def cleanup_job_public_dir(job_id: int) -> None:
    """渲染完就把 public 里的音频删掉，避免 video/public 无限膨胀。"""
    sid = safe_job_id(job_id)
    public_root = _public_root()
    target = (public_root / "jobs" / sid).resolve()
    if target.is_relative_to(public_root) and target.is_dir():
        shutil.rmtree(target, ignore_errors=True)


def build_render_command(
    npx: str, props_path: Path, out_path: Path, concurrency: str
) -> list[str]:
    if not props_path.is_file():
        raise RenderError(f"props 文件不存在：{props_path}")
    return [
        npx,
        "--no-install",
        "remotion",
        "render",
        ENTRY_POINT,
        COMPOSITION_ID,
        str(out_path),
        f"--props={props_path}",
        f"--concurrency={concurrency}",
        "--log=error",
    ]


def render_video(props_path: Path, out_path: Path, concurrency: str = "50%") -> Path:
    settings = get_settings()
    npx = shutil.which("npx")
    if npx is None:
        raise RenderError("找不到 npx，请先安装 Node.js")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = build_render_command(npx, props_path, out_path, concurrency)

    try:
        result = subprocess.run(  # noqa: S603  参数是列表，shell=False，无注入面
            cmd,
            cwd=settings.video_dir,
            shell=False,
            capture_output=True,
            text=True,
            timeout=settings.render_timeout_s,
            check=False,
        )
    except subprocess.TimeoutExpired:
        raise RenderError(f"渲染超时（超过 {settings.render_timeout_s} 秒）") from None

    if result.returncode != 0:
        tail = (result.stderr or result.stdout or "").strip()[-800:]
        raise RenderError(f"Remotion 渲染失败（退出码 {result.returncode}）：{tail}")
    if not out_path.is_file():
        raise RenderError("Remotion 报告成功但没有产出文件")
    return out_path
