"""evidence 子串校验 —— 这是护城河，必须测。

假引用比没有引用严重得多：观众一旦发现「原文」是编的，
账号会失去全部可信度，而「真读过」正是本产品与洗稿账号唯一的区别。
"""

from backend.core.script import strip_fake_evidence
from backend.schema.frames import Script

SOURCE = (
    "所谓心智，通俗地说，就是我们看待人和事的态度，以及由此做出的判断与选择。"
    "我们的寿命变得更长，智商变得更高，财富变得更多，"
    "而且这些可以通过基因或基金传递给下一代。"
)


def script_with(evidences: list[str | None]) -> Script:
    return Script.model_validate(
        {
            "book_title": "认知觉醒",
            "book_author": "周岭",
            "book_index": 4,
            "year": 2026,
            "hook": {"lines": ["能力不够", "只是表象"], "highlight": "只是表象", "narration": ""},
            "quote": {
                "text": "所谓心智，就是我们看待人和事的态度。",
                "chapter": "自序",
                "highlighted_at": "2026-08-02",
                "progress": 3,
                "narration": "所谓心智，就是我们看待人和事的态度。",
            },
            "breakdown": {
                "kicker": "心智真义",
                "points": [
                    {"text": f"第 {i + 1} 条结论", "evidence": e}
                    for i, e in enumerate(evidences)
                ],
                "narration": "作者说心智是态度与选择，而且它无法传递。",
            },
            "my_take": {
                "kicker": "我的想法",
                "text": "我一直以为焦虑是能力不够。",
                "narration": "我一直以为自己的焦虑是因为能力不够。",
            },
            "outro": {
                "question": "你想清为什么了吗？",
                "footer_lines": ["第4本"],
                "narration": "你想清为什么了吗？",
            },
        }
    )


def test_exact_quote_is_kept():
    script = script_with(["可以通过基因或基金传递给下一代", "我们看待人和事的态度"])
    removed = strip_fake_evidence(script, SOURCE)
    assert removed == 0
    assert all(p.evidence is not None for p in script.breakdown.points)


def test_paraphrase_is_stripped():
    """意思对但换了说法 —— 这正是模型最爱写的，必须丢掉。"""
    script = script_with(["这些东西可以遗传给孩子", "我们看待人和事的态度"])
    removed = strip_fake_evidence(script, SOURCE)
    assert removed == 1
    assert script.breakdown.points[0].evidence is None
    assert script.breakdown.points[1].evidence is not None


def test_invented_quote_is_stripped():
    """原文里根本没有的句子。"""
    script = script_with(["态度先于判断，判断先于选择", "智商变得更高"])
    removed = strip_fake_evidence(script, SOURCE)
    assert removed == 1
    assert script.breakdown.points[0].evidence is None


def test_punctuation_differences_are_tolerated():
    """标点换成半角、或省掉，不算改写，不该判假。"""
    script = script_with(["所谓心智,通俗地说", "寿命变得更长智商变得更高"])
    removed = strip_fake_evidence(script, SOURCE)
    assert removed == 0


def test_none_evidence_is_left_alone():
    script = script_with([None, "智商变得更高"])
    removed = strip_fake_evidence(script, SOURCE)
    assert removed == 0
    assert script.breakdown.points[0].evidence is None


def test_evidence_of_only_punctuation_is_stripped():
    """去掉标点后为空 —— 视为无效，不能让它渲出一行空白。"""
    script = script_with(["……", "智商变得更高"])
    removed = strip_fake_evidence(script, SOURCE)
    assert removed == 1
    assert script.breakdown.points[0].evidence is None


def test_cross_sentence_splice_is_stripped():
    """把原文两处拼在一起 —— 单独看每半句都在原文里，合起来是伪造的。"""
    script = script_with(["财富变得更多，就是我们看待人和事的态度", "智商变得更高"])
    removed = strip_fake_evidence(script, SOURCE)
    assert removed == 1
    assert script.breakdown.points[0].evidence is None
