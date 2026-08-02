"""句级时间戳 → 字幕行。纯函数，无副作用。

为什么要插值：edge-tts 只给到句级时间（见 tts.py 的说明），
但一整句中文放在竖屏上一行装不下，必须切成多行。
切完之后每行的时间按字数比例在句子时长内分配 —— 中文语速相对均匀，
这个近似在一句话的尺度上误差很小，肉眼看不出来。

断行规则：标点优先，其次找「可断位置」，最后才硬切。
标点本身不上屏（视觉更干净），但它占用的时间算进所在行。

为什么不能到字数上限就硬切（实测教训，不要改回去）：
硬切会把词组切断，实测把「认识过自己的大脑」切成了「己的大脑」、
把「因为能力不够」切成了「为能力不够」，观众看到的是残句。
所以到上限时允许多读几个字去找一个不那么难看的断点。
"""

from backend.core.tts import Segment
from backend.schema.payload import Caption

# 遇到这些字符就断行
_BREAK_CHARS = frozenset("，。！？；：、,.!?;:")
# 这些字符不上屏
_STRIP_CHARS = frozenset("，。！？；：、,.!?;:\u201c\u201d\u2018\u2019\"'")

DEFAULT_MAX_CHARS = 12

# 到达上限后，最多再往后读这么多字去找断点。
# 给 4 个字是因为中文常见词组长度是 2-4 字，够跨过一个词；
# 给太多会让某一行明显比别行长，在竖屏上依然难看。
SOFT_OVERFLOW = 4

# 允许回退寻找断点的距离。
# 硬切之所以难看，是因为它切在词组内部。与其维护一张「哪些字不能开头」的
# 字表（那是治不完的，实测漏过「自己的大脑」里的「自」），不如反过来找
# 「哪些位置本来就是词的边界」，在上限附近往回退几个字去找它。
LOOKBACK = 5

# 这些字几乎总是一个成分的结尾，断在它们之后是安全的。
# 「的/地/得」是结构助词，「了/着/过」是体标记，它们后面天然是新成分开头。
_GOOD_BREAK_AFTER = frozenset("的地得了着过们吗呢吧啊也都还就才又")

# 这些字总是引出后续内容，断在它们之后会留下悬空的行尾
_BAD_BREAK_AFTER = frozenset("很不没最更太该可要会能想是和与或而且但因所以之其此每各某第")


def _visible(text: str) -> str:
    return "".join(c for c in text if c not in _STRIP_CHARS)


def _find_break(chars: list[str], start: int, limit: int) -> int:
    """在 chars[start:limit] 里挑一个断点，返回「断在第几个字之后」的下标。

    优先级：
      1. 助词结尾（的/了/着…）—— 这类位置几乎总是成分边界
      2. 任何不以「悬空字」结尾的位置，从右往左取最靠后的
      3. 都没有就返回 limit-1，即硬切

    从右往左找是为了让每行尽量接近字数上限，不浪费屏幕宽度。
    """
    lo = max(start, limit - LOOKBACK)

    for i in range(limit - 1, lo - 1, -1):
        if chars[i] in _GOOD_BREAK_AFTER:
            return i

    for i in range(limit - 1, lo - 1, -1):
        if chars[i] not in _BAD_BREAK_AFTER:
            return i

    return limit - 1


def split_lines(text: str, max_chars: int) -> list[str]:
    """把一句话切成适合上屏的短行。

    标点优先断；否则在字数上限附近找一个落在词边界上的位置断，
    避免把「自己的大脑」切成「己的大脑」这种残句。
    """
    # 先取出要上屏的字符，并记下哪些位置原本跟着标点（意味着自然停顿）
    chars: list[str] = []
    break_after: set[int] = set()
    for char in text:
        if char in _STRIP_CHARS:
            if char in _BREAK_CHARS and chars:
                break_after.add(len(chars) - 1)
            continue
        if char.isspace():
            continue
        chars.append(char)

    lines: list[str] = []
    start = 0
    n = len(chars)

    while start < n:
        # 允许延伸到的最远位置：字数上限 + 宽限，但不越过标点。
        # 标点是语义停顿，越过它去凑字数会把两个分句挤成一行。
        window = min(start + max_chars + SOFT_OVERFLOW, n)
        punct = next((i for i in range(start, window) if i in break_after), None)
        if punct is not None:
            end = punct + 1
        elif window >= n:
            # 剩下的字不足一整行（含宽限），直接收尾，避免留下 1-2 字的孤行
            end = n
        else:
            end = _find_break(chars, start, window) + 1

        lines.append("".join(chars[start:end]))
        start = end

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
