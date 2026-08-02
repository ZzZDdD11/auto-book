"""生成四个平台尺寸的封面图。

为什么四个尺寸都要出：同一张图发四个平台，三个会被裁坏 ——
竖图发公众号头条被切掉六成，横图发抖音上下补黑边。
这是排版问题不是缩放问题，所以每个尺寸都由 Remotion 独立排版。

安全要点与 render.py 一致：
  - subprocess 用列表参数 + shell=False
  - ratio 走白名单，它进文件路径与命令行
  - 输出路径先 resolve 再校验落在预期目录内
"""

import json
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from backend.schema.frames import Script
from backend.settings import get_settings

ENTRY_POINT = "src/index.ts"


@dataclass(frozen=True)
class CoverSize:
    """一个封面尺寸。

    composition_id 必须与 video/src/Root.tsx 里注册的 Still id 一致。
    ratio 用于文件名和 URL，只允许字母数字与 x —— 它进文件路径。
    """

    ratio: str
    composition_id: str
    platform: str


# 与 video/src/Root.tsx 的 COVER_SIZES 一一对应。改一处必须改两处 ——
# 这是跨语言边界，没法用类型系统绑住，所以两边都写了注释。
COVER_SIZES: tuple[CoverSize, ...] = (
    CoverSize("9x16", "Cover9x16", "抖音 / 视频号"),
    CoverSize("3x4", "Cover3x4", "小红书"),
    CoverSize("1x1", "Cover1x1", "公众号次条"),
    CoverSize("235x1", "Cover235x1", "公众号头条"),
)

_BY_RATIO = {s.ratio: s for s in COVER_SIZES}


class CoverError(RuntimeError):
    pass


def size_for(ratio: str) -> CoverSize:
    """按 ratio 取尺寸定义。不在白名单里就拒绝 —— ratio 会进文件路径。"""
    size = _BY_RATIO.get(ratio)
    if size is None:
        raise CoverError(f"不支持的封面比例：{ratio!r}")
    return size


def build_cover_props(script: Script) -> dict[str, object]:
    """封面数据全部来自 hook 帧与书信息，不额外调用 AI。

    封面和视频前三秒说同一句话，观众点进来不会有落差 ——
    这也是选择复用 hook 而不是新增 AI 字段的原因。
    """
    return {
        "lines": list(script.hook.lines),
        "highlight": script.hook.highlight,
        "bookTitle": script.book_title,
        "bookAuthor": script.book_author,
        "bookIndex": script.book_index,
        "year": script.year,
        "progress": script.quote.progress,
    }


def render_covers(script: Script, out_dir: Path) -> dict[str, Path]:
    """渲染全部尺寸，返回 {ratio: 文件路径}。

    单个尺寸失败不影响其他尺寸 —— 封面是附加产物，
    不该因为一张图挂掉就让整个任务失败（视频才是主体）。
    """
    settings = get_settings()
    npx = shutil.which("npx")
    if npx is None:
        raise CoverError("找不到 npx，请先安装 Node.js")

    out_dir = out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    props_path = out_dir / "cover-props.json"
    props_path.write_text(
        json.dumps(build_cover_props(script), ensure_ascii=False), "utf-8"
    )

    made: dict[str, Path] = {}
    for size in COVER_SIZES:
        target = (out_dir / f"{size.ratio}.png").resolve()
        if not target.is_relative_to(out_dir):
            raise CoverError(f"输出路径越出目标目录：{size.ratio}")

        cmd = [
            npx,
            "--no-install",
            "remotion",
            "still",
            ENTRY_POINT,
            size.composition_id,
            str(target),
            f"--props={props_path}",
            "--log=error",
        ]
        try:
            result = subprocess.run(  # noqa: S603  列表参数，shell=False，无注入面
                cmd,
                cwd=settings.video_dir,
                shell=False,
                capture_output=True,
                text=True,
                timeout=settings.cover_timeout_s,
                check=False,
            )
        except subprocess.TimeoutExpired:
            continue

        if result.returncode == 0 and target.is_file():
            made[size.ratio] = target

    if not made:
        raise CoverError("四个尺寸的封面都渲染失败")
    return made
