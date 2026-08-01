import pytest
from pydantic import ValidationError

from backend.schema.payload import Caption, FramePayload, RenderPayload


def test_caption_rejects_reversed_time_range():
    with pytest.raises(ValidationError):
        Caption(text="测试", start_s=2.0, end_s=1.0)


def test_frame_payload_requires_positive_duration():
    with pytest.raises(ValidationError):
        FramePayload(kind="hook", duration_in_frames=0, data={})


def test_render_payload_total_frames():
    payload = RenderPayload(
        fps=30,
        frames=[
            FramePayload(kind="hook", duration_in_frames=90, data={}),
            FramePayload(kind="quote", duration_in_frames=330, data={}),
        ],
    )
    assert payload.total_frames == 420


def test_render_payload_serialises_with_camel_case():
    """Remotion 侧是 TS，用 camelCase 更自然。序列化时转换。"""
    payload = RenderPayload(
        fps=30,
        frames=[FramePayload(kind="hook", duration_in_frames=90, data={})],
    )
    dumped = payload.model_dump(by_alias=True)
    assert dumped["frames"][0]["durationInFrames"] == 90
    assert "duration_in_frames" not in dumped["frames"][0]


def test_render_payload_rejects_empty_frames():
    with pytest.raises(ValidationError):
        RenderPayload(fps=30, frames=[])
