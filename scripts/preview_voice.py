"""合成候选音色的样音，混上 BGM 后打开目录试听。

音色只能听，不能看参数决定。改 settings.tts_voice 之前先跑这个。

用法：
    .venv/bin/python scripts/preview_voice.py
    .venv/bin/python scripts/preview_voice.py --text "自定义的一段话"
"""

import argparse
import asyncio
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.core import tts as tts_mod  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BGM_DIR = PROJECT_ROOT / "video" / "public" / "bgm"
OUT_DIR = PROJECT_ROOT / "storage" / "voice_preview"

# edge-tts 实测只有 8 个中文音色，这里列出适合念读书感悟的候选。
# 括号里是微软的官方人格标签，不是我的主观描述。
CANDIDATES: dict[str, str] = {
    "zh-CN-YunyangNeural": "男声 · Professional/Reliable · 播报腔，浑厚稳重",
    "zh-CN-XiaoxiaoNeural": "女声 · Warm · 温暖，主流书评女声",
    "zh-CN-YunjianNeural": "男声 · Passion · 有力，偏激昂",
    "zh-CN-XiaoyiNeural": "女声 · Lively · 活泼",
    "zh-CN-YunxiNeural": "男声 · Lively/Sunshine · 少年音（原默认）",
}

DEFAULT_TEXT = (
    "真正的成长不在于你读了多少本书，"
    "而在于你有没有因为某一句话，真的改掉一个习惯。"
    "这是我今天划下这句话的原因。"
)


def mix_with_bgm(voice: Path, bgm: Path, out: Path, volume: float) -> None:
    """把配音和 BGM 按真实比例混起来 —— 单听配音听不出实际效果。"""
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        raise SystemExit("找不到 ffmpeg，请先安装：brew install ffmpeg")
    subprocess.run(  # noqa: S603  参数是列表，shell=False，路径由本脚本生成
        [
            ffmpeg,
            "-y",
            "-loglevel",
            "error",
            "-i",
            str(voice),
            "-i",
            str(bgm),
            "-filter_complex",
            f"[1:a]volume={volume}[bg];"
            "[0:a][bg]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[out]",
            "-map",
            "[out]",
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "128k",
            str(out),
        ],
        shell=False,
        check=True,
    )


async def main_async(text: str, volume: float) -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("*.mp3"):
        old.unlink()

    bgm = BGM_DIR / "ink.mp3"
    if not bgm.is_file():
        print("没有 BGM，先跑：.venv/bin/python scripts/make_bgm.py", file=sys.stderr)
        bgm = None

    for i, (voice, desc) in enumerate(CANDIDATES.items(), 1):
        short = voice.replace("zh-CN-", "").replace("Neural", "")
        raw = OUT_DIR / f"{i}-{short}-纯配音.mp3"
        print(f"[{i}/{len(CANDIDATES)}] {short:12} {desc}", flush=True)
        try:
            await tts_mod.synthesize(text, voice, raw)
        except RuntimeError as exc:
            print(f"    合成失败：{exc}", file=sys.stderr)
            continue
        if bgm is not None:
            mix_with_bgm(raw, bgm, OUT_DIR / f"{i}-{short}-带音乐.mp3", volume)

    print(f"\n样音目录：{OUT_DIR}")
    print("听完把选中的音色写进 .env：TTS_VOICE=zh-CN-XxxNeural")
    if sys.platform == "darwin":
        opener = shutil.which("open")
        if opener:
            subprocess.run([opener, str(OUT_DIR)], shell=False, check=False)  # noqa: S603
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="试听候选音色")
    parser.add_argument("--text", default=DEFAULT_TEXT)
    parser.add_argument("--bgm-volume", type=float, default=0.10)
    args = parser.parse_args()
    return asyncio.run(main_async(args.text, args.bgm_volume))


if __name__ == "__main__":
    sys.exit(main())
