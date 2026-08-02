"""生成无版权背景音乐。

为什么自己合成而不是下载现成音乐：
音乐版权是短视频平台自动检测的重点，抖音/视频号会直接消音或限流，
风险比引用书籍原文高得多。自己合成的音频版权属于自己，永远不会被判侵权。

只用标准库（wave + math），不依赖 numpy。
合成完用 ffmpeg 转 mp3，输出到 video/public/bgm/。

用法：
    .venv/bin/python scripts/make_bgm.py
"""

import argparse
import math
import shutil
import struct
import subprocess
import sys
import wave
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = PROJECT_ROOT / "video" / "public" / "bgm"

SR = 44100

# 淡入淡出时长。BGM 在 Remotion 里是 loop 播放，
# 首尾必须归零，否则每次循环接缝处会有「啪」的爆音。
EDGE_S = 1.5


def midi_to_freq(m: float) -> float:
    return 440.0 * 2.0 ** ((m - 69.0) / 12.0)


# A 小调，安静、不喧闹。每个和弦 4 秒。
# 用 maj7 / m7 这类七和弦是因为三和弦太「明亮直白」，会抢注意力。
PROGRESSION: list[list[int]] = [
    [57, 60, 64, 67],  # Am7
    [53, 57, 60, 64],  # Fmaj7
    [48, 52, 55, 59],  # Cmaj7
    [55, 59, 62, 64],  # G6
]

# 音色的谐波构成。基频为主 + 少量泛音 = 柔和的音乐盒/毛毡钢琴感。
# 泛音给太多会变尖锐刺耳。
HARMONICS: tuple[tuple[float, float], ...] = (
    (1.0, 1.00),
    (2.0, 0.28),
    (3.0, 0.12),
    (4.0, 0.06),
)


def add_tone(
    buf: list[float],
    start_s: float,
    freq: float,
    dur_s: float,
    amp: float,
    decay: float = 1.6,
) -> None:
    """叠加一个音符。指数衰减包络，带 8ms 软起音防爆音。"""
    start = int(start_s * SR)
    total = int(dur_s * SR)
    attack = int(0.008 * SR)

    for i in range(total):
        idx = start + i
        if idx >= len(buf):
            break
        t = i / SR
        env = math.exp(-decay * t)
        if i < attack:
            env *= i / attack

        sample = 0.0
        for mult, weight in HARMONICS:
            sample += weight * math.sin(2.0 * math.pi * freq * mult * t)
        buf[idx] += amp * env * sample


def add_pad(
    buf: list[float], start_s: float, freq: float, dur_s: float, amp: float
) -> None:
    """叠加一个持续低音垫。

    用很慢的 LFO 让音量轻微起伏，避免长音听起来像蜂鸣器。
    只用基频和八度，泛音越少越「垫」，越不抢戏。
    """
    start = int(start_s * SR)
    total = int(dur_s * SR)
    fade = int(min(1.2, dur_s / 3.0) * SR)

    for i in range(total):
        idx = start + i
        if idx >= len(buf):
            break
        t = i / SR

        env = 1.0
        if i < fade:
            env *= i / fade
        elif i > total - fade:
            env *= max(0.0, (total - i) / fade)
        # 0.08Hz 的慢起伏，约 12 秒一个周期
        env *= 0.82 + 0.18 * math.sin(2.0 * math.pi * 0.08 * t)

        sample = math.sin(2.0 * math.pi * freq * t)
        sample += 0.35 * math.sin(2.0 * math.pi * freq * 2.0 * t)
        buf[idx] += amp * env * sample


def build_ink(duration_s: float) -> list[float]:
    """「墨」——缓慢琶音 + 低音垫。有一点旋律感但不夺注意力。"""
    buf = [0.0] * int(duration_s * SR)
    chord_s = 4.0
    n_chords = int(duration_s / chord_s)

    for c in range(n_chords):
        chord = PROGRESSION[c % len(PROGRESSION)]
        base = c * chord_s

        # 低音垫：根音降一个八度
        add_pad(buf, base, midi_to_freq(chord[0] - 12), chord_s + 1.0, 0.16)

        # 琶音：和弦音依次浮现，每 0.9 秒一个，长衰减互相叠住
        for j, note in enumerate(chord):
            at = base + j * 0.9
            if at >= duration_s:
                break
            add_tone(buf, at, midi_to_freq(note + 12), 3.4, 0.085, decay=1.5)

    return buf


def build_dusk(duration_s: float) -> list[float]:
    """「暮」——纯低音垫，没有旋律。几乎察觉不到，最不抢戏。"""
    buf = [0.0] * int(duration_s * SR)
    chord_s = 6.0
    n_chords = int(duration_s / chord_s)

    for c in range(n_chords):
        chord = PROGRESSION[c % len(PROGRESSION)]
        base = c * chord_s
        for k, note in enumerate(chord[:3]):
            add_pad(buf, base, midi_to_freq(note - 12), chord_s + 1.5, 0.13 - k * 0.02)

    return buf


def finalize(buf: list[float], peak: float = 0.85) -> list[float]:
    """整体淡入淡出 + 归一化。

    淡入淡出让 loop 接缝无爆音；归一化保证不削波。
    """
    n = len(buf)
    edge = int(EDGE_S * SR)
    for i in range(min(edge, n // 2)):
        f = i / edge
        buf[i] *= f
        buf[n - 1 - i] *= f

    top = max((abs(v) for v in buf), default=0.0)
    if top <= 0:
        return buf
    scale = peak / top
    return [v * scale for v in buf]


def write_wav(buf: list[float], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = b"".join(
            struct.pack("<h", max(-32768, min(32767, int(v * 32767)))) for v in buf
        )
        w.writeframes(frames)


def to_mp3(wav_path: Path, mp3_path: Path) -> None:
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
            str(wav_path),
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "128k",
            str(mp3_path),
        ],
        shell=False,
        check=True,
    )


BUILDERS = {"ink": build_ink, "dusk": build_dusk}


def main() -> int:
    parser = argparse.ArgumentParser(description="生成无版权 BGM")
    parser.add_argument("--seconds", type=float, default=64.0)
    parser.add_argument("--only", choices=sorted(BUILDERS), default=None)
    args = parser.parse_args()

    names = [args.only] if args.only else sorted(BUILDERS)
    for name in names:
        print(f"合成 {name} …", flush=True)
        buf = finalize(BUILDERS[name](args.seconds))
        wav = OUT_DIR / f"{name}.wav"
        mp3 = OUT_DIR / f"{name}.mp3"
        write_wav(buf, wav)
        to_mp3(wav, mp3)
        wav.unlink()
        print(f"  → {mp3.relative_to(PROJECT_ROOT)}  {mp3.stat().st_size // 1024} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
