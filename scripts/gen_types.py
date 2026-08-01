"""从 Pydantic 模型生成 Remotion 侧的 TS 类型。

不要手写 video/src/types.ts —— 它每次都由这个脚本覆盖。
改了 schema 就重跑一次：python scripts/gen_types.py
"""

import json
import shutil
import subprocess
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUT_FILE = PROJECT_ROOT / "video" / "src" / "types.ts"


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
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
