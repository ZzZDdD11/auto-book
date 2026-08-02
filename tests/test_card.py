"""build_card_specs 是图集卡片与公众号占位标记的唯一真源。

这个测试存在的原因：一旦这个函数算错了顺序或张数，图片和公众号
文案里的 `[图: 卡i ...]` 标记就会对不上，属于比较隐蔽的问题
（渲染不报错，只是内容错位）。
"""

from backend.core.card import build_card_specs
from tests.test_evidence import script_with


def test_card_count_follows_breakdown_points():
    """张数 = hook + quote + N 个论点 + my_take + outro，不是固定 5 张。"""
    two_points = build_card_specs(script_with([None, None]))
    three_points = build_card_specs(script_with([None, None, "第三条依据"]))

    assert len(two_points) == 6
    assert len(three_points) == 7


def test_card_index_is_sequential_and_ordered():
    specs = build_card_specs(script_with([None, None]))
    assert [s.index for s in specs] == list(range(6))
    assert [s.kind for s in specs] == ["hook", "quote", "point", "point", "my_take", "outro"]


def test_point_footer_is_evidence_or_none():
    """evidence 为 None 时 footer 也必须是 None —— 不留空占位。"""
    specs = build_card_specs(script_with(["原文依据", None]))
    points = [s for s in specs if s.kind == "point"]

    assert points[0].footer == "原文依据"
    assert points[1].footer is None


def test_hook_footer_does_not_repeat_book_meta():
    """书名/作者已经在卡片顶部的书名条里，hook 的 footer 不该重复同一句话。"""
    specs = build_card_specs(script_with([None, None]))
    hook = specs[0]

    assert "认知觉醒" not in hook.footer
    assert "周岭" not in hook.footer
