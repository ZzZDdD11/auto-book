"""传给 Remotion 的 props 结构。

设计要点：视频总长不硬编码，由每帧时长累加得出。
每帧时长又来自该帧配音的实际长度，所以脚本长一点短一点都不会破版。
"""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from backend.schema.frames import FrameKind


def to_camel(s: str) -> str:
    head, *rest = s.split("_")
    return head + "".join(w.capitalize() for w in rest)


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Caption(CamelModel):
    """一行字幕。时间相对所属帧的起点。"""

    text: str = Field(min_length=1)
    start_s: float = Field(ge=0)
    end_s: float = Field(ge=0)

    @model_validator(mode="after")
    def check_range(self):
        if self.end_s <= self.start_s:
            raise ValueError("end_s 必须大于 start_s")
        return self


class Theme(CamelModel):
    """配色。改视觉调性只改这里，五个帧组件都读它。"""

    ink: str = "#12100e"
    paper: str = "#f4f1ec"
    accent: str = "#e8b84b"
    take_bg: str = "#0f2a24"
    take_accent: str = "#4fd1a5"


class FramePayload(CamelModel):
    """一帧的全部渲染信息。

    data 是对应帧模型 dump 出来的字典，结构由 kind 决定。
    这里刻意用 dict 而不是联合类型：Python 侧已经用 Script 校验过了，
    这一层只负责搬运，不重复校验。
    """

    kind: FrameKind
    duration_in_frames: int = Field(gt=0)
    data: dict[str, Any]
    # 相对 video/public 的路径，供 Remotion 的 staticFile() 使用
    audio_src: str | None = None
    captions: list[Caption] = Field(default_factory=list)


class RenderPayload(CamelModel):
    """Remotion Composition 的完整输入。"""

    fps: int = Field(gt=0)
    width: int = 1080
    height: int = 1920
    theme: Theme = Field(default_factory=Theme)
    frames: list[FramePayload] = Field(min_length=1)
    bgm_src: str | None = None
    bgm_volume: float = Field(default=0.12, ge=0, le=1)

    @property
    def total_frames(self) -> int:
        return sum(f.duration_in_frames for f in self.frames)
