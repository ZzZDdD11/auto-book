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

from pydantic import BaseModel, Field, StringConstraints, model_validator

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

    @model_validator(mode="after")
    def check_highlight(self):
        """highlight 必须是 lines 里的某一行。

        prompt 已经交代过，但模型仍会自作主张写一句新的、或者写太长。
        那会在竖屏上折行破版，所以这里直接丢掉不合规的值 ——
        少一个强调色好过版式崩掉。
        """
        if self.highlight is not None and self.highlight not in self.lines:
            object.__setattr__(self, "highlight", None)
        return self


class QuoteFrame(BaseFrame):
    """原文金句 + 划线证据。

    highlighted_at 和 progress 是「真读过」的证据，
    是与批量洗稿账号的核心区别之一，不可省略。
    """

    text: Text = Field(max_length=120)
    chapter: Text | None = Field(default=None, max_length=30)
    highlighted_at: date
    progress: int = Field(ge=0, le=100)


class Point(BaseModel):
    """拆解帧的一条要点：结论 + 原文依据。

    evidence 刻意用 `str | None` 而不是默认空字符串：
    None 表示「这条没有原文依据」，渲染时整行不出现；
    空字符串会渲出一个空占位而破版。类型上就把这个区别固化下来。

    evidence 是否真的来自原文，由 script.py 在返回前做子串校验 ——
    假引用比没有引用严重得多，它会让账号失去全部可信度。
    """

    text: Text = Field(max_length=24)
    # 80 字能放下一句完整的中文原文。之前定 40 太紧，实测 AI 照抄一句
    # 50 字的原文就被 Pydantic 拒了 —— 那不是 AI 的错，是限制不合理。
    # evidence 是原文照抄，长度由原文决定，不该让 AI 压缩（压缩=改写）。
    evidence: Text | None = Field(default=None, max_length=80)


class BreakdownFrame(BaseFrame):
    """作者观点拆解。逐条浮现。

    每条要点带一句原文依据，这是与洗稿账号的区别所在：
    结论可以是你的，依据必须是书里真有的。
    """

    kicker: Text = Field(max_length=20)
    # 保持 2-3 条，不强制 3 条：强制会让模型在素材不足时编第三条
    points: list[Point] = Field(min_length=2, max_length=3)


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
