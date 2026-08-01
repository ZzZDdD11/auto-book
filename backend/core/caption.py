"""句级时间戳 → 字幕行。纯函数，无副作用。

为什么要插值：edge-tts 只给到句级时间（见 tts.py 的说明），
但一整句中文放在竖屏上一行装不下，必须切成多行。
切完之后每行的时间按字数比例在句子时长内分配 —— 中文语速相对均匀，
这个近似在一句话的尺度上误差很小，肉眼看不出来。

断行规则：标点优先，其次是字数上限。
标点本身不上屏（视觉更干净），但它占用的时间算进所在行。
"""

from backend.core.tts import Segment
from backend.schema.payload import Caption

# 遇到这些字符就断行
_BREAK_CHARS = frozenset("，。！？；：、,.!?;:")
# 这些字符不上屏
_STRIP_CHARS = frozenset("，。！？；：、,.!?;:\u201c\u201d\u2018\u2019\"'")

DEFAULT_MAX_CHARS = 12


def _visible(text: str) -> str:
    return "".join(c for c in text if c not in _STRIP_CHARS)


def split_lines(text: str, max_chars: int) -> list[str]:
    """把一句话切成适合上屏的短行。标点优先断，其次按字数。"""
    lines: list[str] = []
    buf: list[str] = []

    for char in text:
        if char in _STRIP_CHARS:
            # 标点不上屏，但它意味着一个自然停顿
            if char in _BREAK_CHARS and buf:
                lines.append("".join(buf))
                buf = []
            continue

        if char.isspace():
            continue

        buf.append(char)
        if len(buf) >= max_chars:
            lines.append("".join(buf))
            buf = []

    if buf:
        lines.append("".join(buf))
    return lines


def group_captions(
    segments: list[Segment], max_chars: int = DEFAULT_MAX_CHARS
) -> list[Caption]:
    """把句级时间戳展开成逐行字幕。"""
    captions: list[Caption] = []
    prev_end = 0.0

    for seg in segments:
        # 服务端返回的相邻句子偶尔会重叠几十毫秒（实测约 50ms）。
        # 重叠会让字幕层在切换瞬间显示上一句，所以把后一句往后压。
        start = max(seg.start_s, prev_end)
        if seg.end_s <= start:
            continue

        lines = split_lines(seg.text, max_chars)
        if not lines:
            continue

        total_chars = sum(len(line) for line in lines)
        if total_chars == 0:
            continue

        span = seg.end_s - start
        cursor = start
        for i, line in enumerate(lines):
            # 最后一行直接贴到句子结束，避免累计误差留下缝隙
            if i == len(lines) - 1:
                end = seg.end_s
            else:
                end = cursor + span * len(line) / total_chars
            if end > cursor:
                captions.append(Caption(text=line, start_s=cursor, end_s=end))
                cursor = end
        prev_end = cursor

    return captions
