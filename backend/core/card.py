"""五帧脚本 → 小红书图集卡片。

张数不固定：hook + quote + breakdown 每个论点各一张 + my_take + outro。
build_card_specs 是唯一真源 —— 渲图和公众号长文的配图占位标记都调这一个函数，
保证文案里引用的卡片和实际生成的卡片一一对应，不会对不上。

安全要点与 cover.py 一致：
  - subprocess 用列表参数 + shell=False
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
COMPOSITION_ID = "Card"


@dataclass(frozen=True)
class CardSpec:
    """一张卡片的内容。index 从 0 起，是图集里的顺序。"""

    index: int
    kind: str  # hook | quote | point | my_take | outro
    label: str  # 给公众号占位标记用的短标签
    kicker: str
    text: str
    highlight: str | None
    footer: str | None


class CardError(RuntimeError):
    pass


def build_card_specs(script: Script) -> list[CardSpec]:
    """Script → 卡片规格列表。纯函数，不做任何 IO。"""
    specs: list[CardSpec] = []
    idx = 0

    hook = script.hook
    specs.append(
        CardSpec(
            index=idx,
            kind="hook",
            label="封面",
            kicker="",
            text="".join(hook.lines),
            highlight=hook.highlight,
            # 书名/作者已经在顶部书名条里，footer 放「今年第几本」这种
            # 顶部没有的信息增量，不重复
            footer=f"今年第 {script.book_index} 本",
        )
    )
    idx += 1

    quote = script.quote
    footer_bits = []
    if quote.chapter:
        footer_bits.append(quote.chapter)
    footer_bits.append(f"读到 {quote.progress}%")
    specs.append(
        CardSpec(
            index=idx,
            kind="quote",
            label="金句",
            kicker="原文摘录",
            text=quote.text,
            highlight=None,
            footer=" · ".join(footer_bits),
        )
    )
    idx += 1

    points = script.breakdown.points
    n = len(points)
    for i, point in enumerate(points):
        specs.append(
            CardSpec(
                index=idx,
                kind="point",
                label=f"论点{i + 1}",
                kicker=f"作者的意思是 {i + 1}/{n}",
                text=point.text,
                highlight=None,
                footer=point.evidence,
            )
        )
        idx += 1

    my_take = script.my_take
    specs.append(
        CardSpec(
            index=idx,
            kind="my_take",
            label="我的想法",
            kicker=my_take.kicker,
            text=my_take.text,
            highlight=None,
            footer=None,
        )
    )
    idx += 1

    outro = script.outro
    specs.append(
        CardSpec(
            index=idx,
            kind="outro",
            label="互动",
            kicker="互动",
            text=outro.question,
            highlight=None,
            footer=" · ".join(outro.footer_lines),
        )
    )

    return specs


def _card_props(spec: CardSpec, script: Script, total: int) -> dict[str, object]:
    return {
        "kind": spec.kind,
        "kicker": spec.kicker,
        "text": spec.text,
        "highlight": spec.highlight,
        "footer": spec.footer,
        "bookTitle": script.book_title,
        "bookAuthor": script.book_author,
        "index": spec.index,
        "total": total,
    }


def render_cards(script: Script, out_dir: Path) -> dict[int, Path]:
    """渲染全部卡片，返回 {index: 文件路径}。

    单张失败不影响其他张 —— 图集是附加产物，不该因为一张图挂掉就让
    整个任务失败（视频才是主体）。
    """
    settings = get_settings()
    npx = shutil.which("npx")
    if npx is None:
        raise CardError("找不到 npx，请先安装 Node.js")

    out_dir = out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    specs = build_card_specs(script)
    made: dict[int, Path] = {}

    for spec in specs:
        props_path = out_dir / f"card-{spec.index}-props.json"
        props_path.write_text(
            json.dumps(_card_props(spec, script, len(specs)), ensure_ascii=False), "utf-8"
        )

        target = (out_dir / f"{spec.index}.png").resolve()
        if not target.is_relative_to(out_dir):
            raise CardError(f"输出路径越出目标目录：卡片 {spec.index}")

        cmd = [
            npx,
            "--no-install",
            "remotion",
            "still",
            ENTRY_POINT,
            COMPOSITION_ID,
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
            made[spec.index] = target

    if not made:
        raise CardError("图集卡片全部渲染失败")
    return made
