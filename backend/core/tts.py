"""文本 → 音频文件 + 时间戳。

每帧单独调用一次，而不是整段一次。这样：
  1. 每帧时长直接可知，视频总长由此推导，不用硬凑
  2. 字幕时间戳天然落在帧内，不需要全局偏移换算
  3. v2 换成用户自己的录音时，只替换某一帧的音频文件即可

关于时间戳粒度（实测结论，不要凭文档改回去）：
edge-tts 的文档描述了 WordBoundary 事件，但实测当前服务端对中文和英文音色
都只返回 SentenceBoundary（整句一条），拿不到逐词偏移。
所以这里以「句」为最小单位，句内字幕时间由 caption.py 按字数比例插值。
如果哪天服务端恢复了 WordBoundary，可以在这里追加处理并让 caption 用更细的粒度。
"""

from dataclasses import dataclass, field
from pathlib import Path

import edge_tts

# edge-tts 的 offset / duration 单位是 100 纳秒（.NET tick）
TICKS_PER_SECOND = 10_000_000

# 服务端可能返回的边界事件类型，都按「一段带时间的文本」处理
_BOUNDARY_TYPES = frozenset({"SentenceBoundary", "WordBoundary"})


@dataclass(frozen=True)
class Segment:
    """一段带时间的文本。通常是一句话。"""

    text: str
    start_s: float
    end_s: float


@dataclass(frozen=True)
class TtsResult:
    audio_path: Path | None
    duration_s: float
    segments: list[Segment] = field(default_factory=list)


async def synthesize(text: str, voice: str, out_path: Path) -> TtsResult:
    """合成一段配音。text 为空时返回空结果，不发请求。"""
    if not text.strip():
        return TtsResult(audio_path=None, duration_s=0.0, segments=[])

    out_path.parent.mkdir(parents=True, exist_ok=True)
    segments: list[Segment] = []
    chunks: list[bytes] = []

    communicate = edge_tts.Communicate(text, voice)
    async for chunk in communicate.stream():
        kind = chunk.get("type")
        if kind == "audio":
            chunks.append(chunk["data"])
        elif kind in _BOUNDARY_TYPES:
            start = chunk["offset"] / TICKS_PER_SECOND
            segments.append(
                Segment(
                    text=chunk["text"],
                    start_s=start,
                    end_s=start + chunk["duration"] / TICKS_PER_SECOND,
                )
            )

    if not chunks:
        raise RuntimeError(f"TTS 没有返回音频：voice={voice}")

    out_path.write_bytes(b"".join(chunks))
    duration = segments[-1].end_s if segments else 0.0
    return TtsResult(audio_path=out_path, duration_s=duration, segments=segments)
