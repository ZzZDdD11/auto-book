"""文案生成的输入拼装。

这个测试存在的原因：points 从 list[str] 改成 list[Point] 之后，
copywrite 里的 '；'.join(script.breakdown.points) 没跟着改，
真跑任务时抛 TypeError —— 视频渲完了、封面出了，最后一步炸掉。

ruff 和 pytest 都没抓住它，因为那是运行时的字符串拼接。
所以这里直接断言拼出来的 prompt 内容。
"""

from backend.core.copywrite import build_copy_prompt
from tests.test_evidence import script_with


def test_prompt_uses_point_text_not_object():
    script = script_with(["我们看待人和事的态度", None])
    prompt = build_copy_prompt(script)

    assert "第 1 条结论" in prompt
    assert "第 2 条结论" in prompt
    # 不能把对象的 repr 塞进 prompt
    assert "Point(" not in prompt
    assert "evidence=" not in prompt


def test_prompt_contains_all_frames():
    script = script_with([None, None])
    prompt = build_copy_prompt(script)

    for expect in ("书名", "视频钩子", "原文金句", "作者观点", "我的想法", "结尾提问"):
        assert expect in prompt, f"prompt 缺少 {expect}"
