"""素材 → 五帧脚本。

两档模式的差别全部体现在 system prompt 上：
  深耕档 —— AI 不许替用户编造观点，my_take 只能改写用户写的内容
  快产档 —— AI 可以起草观点，用户审改
"""

from datetime import date

from pydantic import BaseModel, Field, model_validator

from backend.core.deepseek import DeepSeekClient
from backend.models import MaterialMode
from backend.schema.frames import Script
from backend.settings import get_settings

_STRUCTURE = """你必须返回一个 JSON 对象，字段如下（不要多、不要少）：

{
  "book_title": "书名",
  "book_author": "作者",
  "book_index": 整数，这是用户今年读的第几本,
  "year": 整数年份,
  "hook": {
    "lines": ["1 到 2 行短句，每行 4 到 8 字"],
    "highlight": "只能是 lines 里的其中一行，原样照抄，用于标成强调色；不想强调就填 null",
    "narration": ""
  },
  "quote": {
    "text": "原文金句，直接引用不要改写，不超过 60 字",
    "chapter": "章节，可为 null",
    "highlighted_at": "YYYY-MM-DD",
    "progress": 0 到 100 的整数,
    "narration": "把金句念出来的完整句子"
  },
  "breakdown": {
    "kicker": "小标题，不超过 10 字",
    "points": ["2 到 3 条，每条不超过 14 字"],
    "narration": "把这几条讲清楚的口语句子，60 到 110 字"
  },
  "my_take": {
    "kicker": "小标题，不超过 10 字",
    "text": "屏幕上显示的个人观点，不超过 100 字",
    "narration": "念出来的个人观点，60 到 110 字，不能为空"
  },
  "outro": {
    "question": "一个抛给观众的问题，不超过 20 字",
    "footer_lines": ["1 到 3 行落款"],
    "narration": "把问题念出来"
  }
}

规则：
- hook 的 narration 固定为空字符串，这一帧只有画面不配音。
- narration 是要念出来的话，必须是完整口语句子；屏幕文字要短要有冲击力。两者不要写成一样的。
- quote.text 必须是原文，不许改写、不许润色、不许拼接。
- 全部使用简体中文。不要用「首先其次最后」这种八股连接词。
- 不要写「这本书告诉我们」「让我们一起」这类空话。

关于 hook（这一帧决定别人划不划走，最重要）：
- **不要复述原文金句**。原文会在下一帧完整出现，钩子重复它等于浪费 3 秒。
- 要制造认知冲突：指出一个反常识的判断，或者点破读者正在犯的错。
- 好例子：「你不是」「不够自律」；「越努力」「越失控」。
- 坏例子：把原文缩写一遍，比如原文讲环境，钩子就写「环境的力量」。
- lines 每行 4 到 8 字，两行之间要有转折或递进，不要是同一句话拆两半。
- highlight 必须是 lines 中某一行的**原样照抄**，不能是新写的句子，也不能超过 8 字，否则会折行破版。

关于 breakdown：
- 几条之间必须是**不同的信息**，不能是同一句话的三种说法。
- 如果你发现只能想出一个要点，就只写 2 条，别硬凑成 3 条同义句。
- 每条不超过 14 字，超了在竖屏上会折行。

关于数字，不许编造：
- book_index 和 year 必须原样使用我在下面提供的数值，不要自己改、不要写「第1本」这种猜的数字。
- footer_lines 里如果要提「第几本」，必须和 book_index 一致。"""

_DEEP = f"""你在帮一个人把读书笔记做成短视频。这个人自己写了想法，你的工作是整理，不是代笔。

最重要的一条：my_take 字段必须完全基于用户提供的「我的想法」。你可以调整语序、删掉啰嗦的部分、让它更适合口语表达，但**不得替用户编造**任何他没有表达过的观点、例子或结论。如果用户的想法很短，就让 my_take 也短，不要填充。

{_STRUCTURE}"""

_FAST = f"""你在帮一个人把读书笔记做成短视频。这次他没时间细想，你可以起草观点，他会审改。

my_take 字段你可以起草：基于原文提出一个具体的、有立场的看法。宁可片面也不要四平八稳。如果用户提供了「我的想法」，优先用他的，你只做补全。

避免写成「这个观点很有启发」这种谁都能说的话。要具体：给场景、给反例、给一个可以争论的判断。

{_STRUCTURE}"""


def system_prompt_for(mode: MaterialMode) -> str:
    return _DEEP if mode is MaterialMode.deep else _FAST


class ScriptInput(BaseModel):
    """生成脚本所需的全部信息。与数据库解耦，方便测试。"""

    book_title: str = Field(min_length=1, max_length=60)
    book_author: str = ""
    book_index: int = Field(ge=1)
    year: int = Field(ge=2000, le=2100)
    source_text: str = Field(min_length=1)
    my_take: str = ""
    chapter: str | None = None
    highlighted_at: date | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    mode: MaterialMode = MaterialMode.fast

    @model_validator(mode="after")
    def check(self):
        limit = get_settings().max_material_chars
        if len(self.source_text) > limit:
            raise ValueError(f"原文超过 {limit} 字上限")
        if len(self.my_take) > limit:
            raise ValueError(f"个人想法超过 {limit} 字上限")
        if self.mode is MaterialMode.deep and not self.my_take.strip():
            raise ValueError("深耕档必须填写个人想法")
        return self


def build_user_prompt(data: ScriptInput) -> str:
    highlighted = data.highlighted_at or date.today()
    parts = [
        f"书名：{data.book_title}",
        f"作者：{data.book_author or '未提供'}",
        f"这是今年第 {data.book_index} 本，年份 {data.year}",
        f"章节：{data.chapter or '未提供'}",
        f"划线日期：{highlighted.isoformat()}",
        f"阅读进度：{data.progress if data.progress is not None else 0}",
        "",
        "原文摘录：",
        data.source_text.strip(),
        "",
        "我的想法：",
        data.my_take.strip() or "（未提供，请你起草）",
    ]
    return "\n".join(parts)


async def generate_script(data: ScriptInput, client: DeepSeekClient) -> tuple[Script, int]:
    """返回 (五帧脚本, 消耗 token 数)。"""
    return await client.complete_json(
        system_prompt_for(data.mode),
        build_user_prompt(data),
        Script,
    )
