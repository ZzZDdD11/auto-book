"""从 Pydantic 模型生成 Remotion 侧的 TS 类型与预览假数据。

不要手写 video/src/types.ts 和 defaultProps.ts —— 它们每次都由这个脚本覆盖。
改了 schema 就重跑一次：python scripts/gen_types.py

defaultProps 也由这里生成，原因是它手工维护必然过期：
实测 points 从 list[str] 改成 list[Point] 之后，defaultProps 还是旧结构，
studio 预览直接崩，而 tsc 查不出来（它是 JSON 字面量，被 as 断言吞掉了）。
"""

import json
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUT_FILE = PROJECT_ROOT / "video" / "src" / "types.ts"
PROPS_FILE = PROJECT_ROOT / "video" / "src" / "defaultProps.ts"

# 允许直接 python scripts/gen_types.py 运行，不必先设 PYTHONPATH
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


def _sample_script():
    """给 studio 预览用的假脚本。走真实模型校验，保证结构永不过期。"""
    from backend.schema.frames import Script

    return Script.model_validate(
        {
            "book_title": "原子习惯",
            "book_author": "James Clear",
            "book_index": 7,
            "year": date.today().year,
            "hook": {
                "lines": ["你不是", "不够自律"],
                "highlight": "不够自律",
                "narration": "",
            },
            "quote": {
                "text": "环境是塑造人类行为看不见的手。",
                "chapter": "第 12 章",
                "highlighted_at": date.today().isoformat(),
                "progress": 43,
                "narration": "环境，是塑造人类行为看不见的手。",
            },
            "breakdown": {
                "kicker": "作者的意思是",
                "points": [
                    {
                        "text": "意志力是消耗品，环境是常量",
                        "evidence": "环境是塑造人类行为看不见的手",
                    },
                    {"text": "把手机放进抽屉，比下决心有效", "evidence": None},
                ],
                "narration": "作者的核心主张是，意志力是消耗品，环境才是常量。",
            },
            "my_take": {
                "kicker": "但我不完全同意",
                "text": "改环境本身也要意志力。我试过把手机锁进抽屉，第三天就自己拿出来了。",
                "narration": "但我觉得环境论有个漏洞，改环境本身也要意志力。",
            },
            "outro": {
                "question": "你有过改环境失败的时刻吗？",
                "footer_lines": ["我在读第 7 本书", "把想法记下来，做成视频"],
                "narration": "你有过改环境失败的时刻吗？",
            },
        }
    )


def _write_default_props() -> None:
    from backend.core.payload import FrameAudio, build_payload
    from backend.core.tts import TtsResult
    from backend.schema.frames import FRAME_ORDER

    script = _sample_script()
    payload = build_payload(
        script,
        [
            FrameAudio(kind=k, tts=TtsResult(audio_path=None, duration_s=3.0), public_src=None)
            for k in FRAME_ORDER
        ],
        fps=30,
        padding_s=0.45,
        silent_s=3.0,
    )
    body = json.dumps(
        payload.model_dump(by_alias=True, mode="json"), ensure_ascii=False, indent=2
    )

    cover = script.hook
    cover_body = json.dumps(
        {
            "lines": cover.lines,
            "highlight": cover.highlight,
            "bookTitle": script.book_title,
            "bookAuthor": script.book_author,
            "bookIndex": script.book_index,
            "year": script.year,
            "progress": script.quote.progress,
        },
        ensure_ascii=False,
        indent=2,
    )

    PROPS_FILE.write_text(
        "/* 由 scripts/gen_types.py 生成，不要手改 */\n\n"
        'import type { CoverProps } from "./Cover";\n'
        'import type { RenderPayload } from "./types";\n\n'
        "/** 供 remotion studio 预览用的假数据。渲染时会被 --props 覆盖。 */\n"
        f"export const defaultProps: RenderPayload = {body};\n\n"
        "/** 封面预览假数据。 */\n"
        f"export const coverDefaultProps: CoverProps = {cover_body};\n",
        "utf-8",
    )
    print(f"已生成 {PROPS_FILE}")


def main() -> int:
    from backend.schema.payload import RenderPayload

    npx = shutil.which("npx")
    if npx is None:
        print("找不到 npx，请先安装 Node.js", file=sys.stderr)
        return 1

    schema = RenderPayload.model_json_schema(by_alias=True)
    schema_file = PROJECT_ROOT / "video" / "payload.schema.json"
    schema_file.parent.mkdir(parents=True, exist_ok=True)
    schema_file.write_text(json.dumps(schema, ensure_ascii=False, indent=2), "utf-8")

    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    # json-schema-to-typescript 由 video/ 的 devDependencies 提供
    result = subprocess.run(  # noqa: S603
        [
            npx,
            "--no-install",
            "json2ts",
            "--input",
            str(schema_file),
            "--output",
            str(OUT_FILE),
            "--bannerComment",
            "/* 由 scripts/gen_types.py 生成，不要手改 */",
        ],
        cwd=PROJECT_ROOT / "video",
        shell=False,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(result.stderr, file=sys.stderr)
        return result.returncode
    print(f"已生成 {OUT_FILE}")

    _write_default_props()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
