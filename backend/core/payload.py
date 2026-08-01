"""脚本 + 配音 + 字幕 → Remotion props。纯函数。

关键决策：视频时长不硬编码。
每帧时长 = 该帧配音时长 + 留白；无配音帧用固定时长。
所以脚本写长写短都不会破版，也不需要 AI 去凑字数。
"""

import math
from dataclasses import dataclass

from backend.core.caption import group_captions
from backend.core.tts import TtsResult
from backend.schema.frames import FRAME_ORDER, Script
from backend.schema.payload import FramePayload, RenderPayload, Theme


@dataclass(frozen=True)
class FrameAudio:
    """某一帧的配音结果。

    public_src 是相对 video/public/ 的路径，Remotion 用 staticFile() 加载。
    与 tts.audio_path（磁盘绝对路径）区分开：前者给浏览器，后者给文件系统。
    """

    kind: str
    tts: TtsResult
    public_src: str | None


def build_payload(
    script: Script,
    audios: list[FrameAudio],
    fps: int,
    padding_s: float,
    silent_s: float,
    theme: Theme | None = None,
    bgm_src: str | None = None,
) -> RenderPayload:
    by_kind = {a.kind: a for a in audios}
    missing = [k for k in FRAME_ORDER if k not in by_kind]
    if missing:
        raise ValueError(f"缺少这些帧的配音结果：{missing}")

    book_meta = {
        "book_title": script.book_title,
        "book_author": script.book_author,
        "book_index": script.book_index,
        "year": script.year,
    }

    frames: list[FramePayload] = []
    for kind, frame in script.iter_frames():
        audio = by_kind[kind]
        if audio.tts.duration_s > 0:
            seconds = audio.tts.duration_s + padding_s
        else:
            seconds = silent_s

        # mode="json" 让 date 变成字符串，TS 侧才能直接用
        data = frame.model_dump(mode="json")
        data.update(book_meta)

        frames.append(
            FramePayload(
                kind=kind,
                duration_in_frames=max(1, math.ceil(seconds * fps)),
                data=data,
                audio_src=audio.public_src,
                captions=group_captions(audio.tts.segments),
            )
        )

    return RenderPayload(
        fps=fps,
        theme=theme or Theme(),
        frames=frames,
        bgm_src=bgm_src,
    )
