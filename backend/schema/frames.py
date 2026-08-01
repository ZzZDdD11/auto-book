"""五帧结构 —— 全系统唯一真源。

它同时是：
  1. DeepSeek 的输出格式（JSON Schema 约束）
  2. Remotion 的组件划分（types.ts 由此生成）
  3. 后续图文形态的数据基础

改这个文件意味着 AI prompt、渲染组件、文案生成都要跟着变。
"""

from collections.abc import Iterator
from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

FrameKind = Literal["hook", "quote", "breakdown", "my_take", "outro"]

FRAME_ORDER: tuple[FrameKind, ...] = ("hook", "quote", "breakdown", "my_take", "outro")

# 上屏文字统一先 strip 再校验长度。
# 不这么做的话，"   " 能通过 min_length=1，渲出一帧空白画面。
Text = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1)]


class BaseFrame(BaseModel):
    """所有帧共有的部分。

    narration 是「要念出来的话」，与屏幕上的文字分开。
    屏幕文字要短要有冲击力，配音要是完整句子，两者不该互相将就。
    """

    narration: str = Field(default="", max_length=400)


class HookFrame(BaseFrame):
    """0-3s 钩子。大字压屏，抢住前三秒。通常不配音。"""

    lines: list[Text] = Field(min_length=1, max_length=2)
    highlight: Text | None = Field(default=None, max_length=20)


class QuoteFrame(BaseFrame):
    """原文金句 + 划线证据。

    highlighted_at 和 progress 是「真读过」的证据，
    是与批量洗稿账号的核心区别之一，不可省略。
    """

    text: Text = Field(max_length=120)
    chapter: Text | None = Field(default=None, max_length=30)
    highlighted_at: date
    progress: int = Field(ge=0, le=100)


class BreakdownFrame(BaseFrame):
    """作者观点拆解。逐条浮现。"""

    kicker: Text = Field(max_length=20)
    points: list[Text] = Field(min_length=2, max_length=3)


class MyTakeFrame(BaseFrame):
    """我的想法 —— 这一帧是整个产品的存在理由。

    narration 不允许为空：没有个人观点的视频，本产品不该产出。
    """

    kicker: Text = Field(max_length=20)
    text: Text = Field(max_length=200)
    narration: Text = Field(max_length=400)


class OutroFrame(BaseFrame):
    """提问收尾 + 人格化落款。"""

    question: Text = Field(max_length=40)
    footer_lines: list[Text] = Field(min_length=1, max_length=3)


class Script(BaseModel):
    """一条视频的完整脚本。"""

    book_title: Text = Field(max_length=60)
    book_author: str = Field(default="", max_length=60)
    book_index: int = Field(ge=1)
    year: int = Field(ge=2000, le=2100)

    hook: HookFrame
    quote: QuoteFrame
    breakdown: BreakdownFrame
    my_take: MyTakeFrame
    outro: OutroFrame

    def iter_frames(self) -> Iterator[tuple[FrameKind, BaseFrame]]:
        """按播放顺序遍历五帧。"""
        for kind in FRAME_ORDER:
            yield kind, getattr(self, kind)
