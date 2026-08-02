"""素材 → 五帧脚本。

两档模式的差别全部体现在 system prompt 上：
  深耕档 —— AI 不许替用户编造观点，my_take 只能改写用户写的内容
  快产档 —— AI 可以起草观点，用户审改
"""

from datetime import date
from typing import Any

from pydantic import BaseModel, Field, model_validator

from backend.core.deepseek import DeepSeekClient
from backend.models import MaterialMode
from backend.schema.frames import FRAME_ORDER, Script
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
    "points": [
      {
        "text": "结论，不超过 24 字",
        "evidence": "支撑这条结论的原文片段，或 null"
      }
    ],
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
- 2 到 3 条，几条之间必须是**不同的信息**，不能是同一句话的三种说法。
- 如果你发现只能想出一个要点，就只写 2 条，别硬凑成 3 条同义句。
- points[].text 是你的结论，不超过 24 字，超了在竖屏上会折行。

关于 breakdown 里的 evidence（这条规则会被程序检查，写错会被丢弃）：
- evidence 必须是**原文摘录里真实出现过的连续文字**，直接照抄。
- 可以截取一段、可以只取半句，但**不许改写、不许润色、不许补字、不许把两处拼接**。
- 原文里找不到能支撑这条结论的句子时，evidence 填 null。
- **宁可填 null，也不要写一句意思相近的话。** 程序会拿 evidence 去原文里比对，
  凡是找不到的一律丢弃，你写了也是白写。
- 好例子（原文有「可以通过基因或基金传递给下一代」这句）：
  {"text": "寿命智商财富都能传，唯独心智不能", "evidence": "可以通过基因或基金传递给下一代"}
- 坏例子（把原文换了个说法，会被程序丢掉）：
  {"text": "寿命智商财富都能传，唯独心智不能", "evidence": "这些东西可以遗传给孩子"}
- 坏例子（原文里没有这句话，凭理解补的，会被丢掉）：
  {"text": "心智决定你怎么看人和事", "evidence": "态度先于判断，判断先于选择"}

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
    """返回 (五帧脚本, 消耗 token 数)。

    返回前会剔除假引用 —— 见 strip_fake_evidence。
    """
    script, tokens = await client.complete_json(
        system_prompt_for(data.mode),
        build_user_prompt(data),
        Script,
    )
    strip_fake_evidence(script, data.source_text)
    return script, tokens


# ============================================================
# 单帧重写：AI 只重生成指定帧，其他四帧冻结
# ============================================================

# 各帧的输出 schema 描述，供单帧重写的 prompt 用
_FRAME_SCHEMA: dict[str, str] = {
    "hook": '{"lines": ["1 到 2 行短句"], "highlight": "lines 中的某一行或 null", "narration": ""}',
    "quote": '{"text": "原文金句", "chapter": "章节或 null", "highlighted_at": "YYYY-MM-DD", "progress": 0-100, "narration": "念出来的句子"}',
    "breakdown": '{"kicker": "小标题", "points": [{"text": "结论", "evidence": "原文片段或 null"}], "narration": "讲解口语"}',
    "my_take": '{"kicker": "小标题", "text": "屏幕显示的个人观点", "narration": "念出来的个人观点"}',
    "outro": '{"question": "抛给观众的问题", "footer_lines": ["落款"], "narration": "把问题念出来"}',
}


def _build_frame_rewrite_prompt(
    script: Script, target: str, feedback: str | None
) -> str:
    """构造单帧重写的 user prompt。

    把其他四帧作为 context 喂进去，明确「只输出指定帧」。
    """
    others = []
    for kind in FRAME_ORDER:
        if kind == target:
            continue
        frame = getattr(script, kind)
        others.append(f"【{kind}】{frame.model_dump_json(indent=2)}")

    parts = [
        "以下是这条视频的其他四帧内容，请保持风格与它们一致：",
        "",
        "\n\n".join(others),
        "",
        f"现在请只重新生成【{target}】这一帧。",
        f"输出格式：{_FRAME_SCHEMA[target]}",
        "只输出这一帧的 JSON 对象，不要输出其他帧，不要输出解释。",
    ]
    if feedback:
        parts.append(f"要求：{feedback}")
    return "\n".join(parts)


async def regenerate_single_frame(
    script: Script,
    frame: str,
    feedback: str | None,
    client: DeepSeekClient,
) -> tuple[Any, int]:
    """AI 重写指定帧，返回 (新帧对象, token 数)。

    其他四帧冻结 —— 喂给 AI 作为 context，prompt 明确「只输出指定帧」。
    """
    from backend.schema.frames import (
        BreakdownFrame,
        HookFrame,
        MyTakeFrame,
        OutroFrame,
        QuoteFrame,
    )

    frame_classes = {
        "hook": HookFrame,
        "quote": QuoteFrame,
        "breakdown": BreakdownFrame,
        "my_take": MyTakeFrame,
        "outro": OutroFrame,
    }
    cls = frame_classes.get(frame)
    if cls is None:
        raise ValueError(f"非法帧名：{frame!r}")

    system = (
        "你在帮一个人重写短视频脚本的某一帧。其他四帧已经定稿，"
        "你的输出会直接替换这一帧，所以必须只输出这一帧的 JSON，不要多不要少。"
        "保持与其他帧的风格一致，不要与其他帧的内容重复。"
    )
    user = _build_frame_rewrite_prompt(script, frame, feedback)
    return await client.complete_json(system, user, cls)


# 比对时忽略的字符：标点、空白、引号。
# 模型经常把原文的「，」写成「,」或者干脆省掉，那不算改写，不该因此判假。
_IGNORED_IN_MATCH = frozenset(
    "，。！？；：、,.!?;:\u201c\u201d\u2018\u2019\"'（）()《》〈〉[]【】—-–…·　 \t\n\r"
)


def _normalize_for_match(text: str) -> str:
    return "".join(c for c in text if c not in _IGNORED_IN_MATCH)


def strip_fake_evidence(script: Script, source_text: str) -> int:
    """把不是原文子串的 evidence 置为 None，返回剔除条数。

    为什么必须在代码里兜住：prompt 已经写明「只能照抄原文」并给了正反例子，
    但模型仍会自作主张写一句意思相近的话 —— 这与 HookFrame.check_highlight
    要解决的是同一类问题。

    而假引用比没有引用严重得多：观众一旦发现「原文」是编的，
    账号会失去全部可信度，而「真读过」正是本产品与洗稿账号唯一的区别。
    所以取舍很明确：宁可少一行，也不留一句可能是假的引用。

    已知代价：模型好心写的、内容正确的解释性文字，会因为不在原文里而被丢弃。
    """
    haystack = _normalize_for_match(source_text)
    removed = 0

    for point in script.breakdown.points:
        if point.evidence is None:
            continue
        needle = _normalize_for_match(point.evidence)
        # 去掉标点后为空，或不是原文子串，都算无效
        if not needle or needle not in haystack:
            point.evidence = None
            removed += 1

    return removed
