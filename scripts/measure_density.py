"""测量渲出画面的空白占比。

为什么要用程序量：目测「看起来挺满」和实际占比差很远，
上一版 breakdown 帧目测「有点空」，实测是 72% 空。

做法：把图缩成灰度，逐行看这一行有没有与背景不同的像素。
连续的空行段落如果超过阈值就算「空白带」。
"""

import shutil
import subprocess
import sys
from pathlib import Path

# 判定「这个像素不是背景」的灰度差阈值。
# 取 12 是因为字体抗锯齿的边缘像素差值很小，阈值太低会把噪点算成内容。
DIFF_THRESHOLD = 12

# 一行里至少要有这么多非背景像素，才算「这行有内容」。
# 取 3 是为了滤掉压缩噪点，但仍能捕捉到细如 3px 的进度条。
MIN_PIXELS_PER_ROW = 3


def _tool(name: str) -> str:
    path = shutil.which(name)
    if path is None:
        raise SystemExit(f"找不到 {name}，请先安装：brew install ffmpeg")
    return path


def load_gray(path: Path) -> tuple[list[list[int]], int, int]:
    """用 ffmpeg 转成灰度原始字节读进来，避免依赖 Pillow。"""
    probe = subprocess.run(  # noqa: S603  列表参数，绝对路径，shell=False
        [
            _tool("ffprobe"), "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height", "-of", "csv=p=0", str(path),
        ],
        capture_output=True, text=True, check=True, shell=False,
    )
    w, h = (int(x) for x in probe.stdout.strip().split(",")[:2])

    raw = subprocess.run(  # noqa: S603  列表参数，绝对路径，shell=False
        [_tool("ffmpeg"), "-v", "error", "-i", str(path), "-f", "rawvideo",
         "-pix_fmt", "gray", "-"],
        capture_output=True, check=True, shell=False,
    ).stdout

    rows = [list(raw[y * w : (y + 1) * w]) for y in range(h)]
    return rows, w, h


def analyze(path: Path) -> dict[str, float]:
    rows, w, h = load_gray(path)

    # 背景色取四角的众数 —— 四角一定是背景
    corners = [rows[0][0], rows[0][w - 1], rows[h - 1][0], rows[h - 1][w - 1]]
    bg = max(set(corners), key=corners.count)

    content_rows = [
        sum(1 for v in row if abs(v - bg) > DIFF_THRESHOLD) >= MIN_PIXELS_PER_ROW
        for row in rows
    ]

    filled = sum(content_rows)
    # 最长的连续空白带 —— 这个比总占比更能说明「看起来空」
    longest_gap = cur = 0
    for has in content_rows:
        cur = 0 if has else cur + 1
        longest_gap = max(longest_gap, cur)

    return {
        "height": h,
        "content_ratio": filled / h,
        "blank_ratio": 1 - filled / h,
        "longest_blank_band": longest_gap / h,
    }


def main() -> int:
    if len(sys.argv) < 2:
        print("用法：measure_density.py <图片...>", file=sys.stderr)
        return 2

    worst = 0.0
    for arg in sys.argv[1:]:
        p = Path(arg)
        if not p.is_file():
            print(f"跳过（不存在）：{p}", file=sys.stderr)
            continue
        r = analyze(p)
        worst = max(worst, r["blank_ratio"])
        print(
            f"{p.name:26} 有内容 {r['content_ratio']:5.1%}  "
            f"空白 {r['blank_ratio']:5.1%}  最长空白带 {r['longest_blank_band']:5.1%}"
        )
    print(f"\n最差空白占比：{worst:.1%}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
