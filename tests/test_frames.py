import pytest
from pydantic import ValidationError

from backend.schema.frames import FRAME_ORDER, Script


def valid_script_dict():
    return {
        "book_title": "原子习惯",
        "book_author": "James Clear",
        "book_index": 7,
        "year": 2026,
        "hook": {
            "lines": ["你不是不够自律"],
            "highlight": "你只是环境太顺手",
            "narration": "",
        },
        "quote": {
            "text": "环境是塑造人类行为看不见的手。",
            "chapter": "第 12 章",
            "highlighted_at": "2026-08-01",
            "progress": 43,
            "narration": "环境，是塑造人类行为看不见的手。",
        },
        "breakdown": {
            "kicker": "作者的意思是",
            "points": ["意志力是消耗品，环境是常量", "把手机放进抽屉，比下决心有效"],
            "narration": "作者的核心主张是，意志力是消耗品，环境才是常量。",
        },
        "my_take": {
            "kicker": "但我不完全同意",
            "text": "改环境本身也要意志力。我试过把手机锁进抽屉，第三天就自己拿出来了。",
            "narration": "但我觉得环境论有个漏洞，改环境本身也要意志力。",
        },
        "outro": {
            "question": "你有过改环境失败的时刻吗？",
            "footer_lines": ["我在读第 7 本书", "把想法记下来，做成视频"],
            "narration": "你有过改环境失败的时刻吗？",
        },
    }


def test_script_parses_valid_payload():
    script = Script.model_validate(valid_script_dict())
    assert script.book_title == "原子习惯"
    assert script.quote.progress == 43
    assert script.my_take.kicker == "但我不完全同意"


def test_frame_order_matches_script_fields():
    script = Script.model_validate(valid_script_dict())
    for name in FRAME_ORDER:
        assert hasattr(script, name), f"FRAME_ORDER 里的 {name} 在 Script 上不存在"
    assert FRAME_ORDER == ("hook", "quote", "breakdown", "my_take", "outro")


def test_iter_frames_yields_five_frames_in_order():
    script = Script.model_validate(valid_script_dict())
    frames = list(script.iter_frames())
    assert [kind for kind, _ in frames] == list(FRAME_ORDER)


def test_progress_out_of_range_rejected():
    data = valid_script_dict()
    data["quote"]["progress"] = 150
    with pytest.raises(ValidationError):
        Script.model_validate(data)


def test_breakdown_requires_at_least_two_points():
    data = valid_script_dict()
    data["breakdown"]["points"] = ["只有一条"]
    with pytest.raises(ValidationError):
        Script.model_validate(data)


def test_breakdown_rejects_more_than_three_points():
    data = valid_script_dict()
    data["breakdown"]["points"] = ["一", "二", "三", "四"]
    with pytest.raises(ValidationError):
        Script.model_validate(data)


def test_hook_narration_may_be_empty():
    """钩子帧通常无配音，这是允许的。"""
    script = Script.model_validate(valid_script_dict())
    assert script.hook.narration == ""


def test_my_take_narration_must_not_be_empty():
    """我的想法这一帧是产品存在的理由，不能没有内容。"""
    data = valid_script_dict()
    data["my_take"]["narration"] = ""
    with pytest.raises(ValidationError):
        Script.model_validate(data)


@pytest.mark.parametrize("blank", ["   ", "\n", "\t  \n"])
def test_my_take_narration_rejects_whitespace_only(blank):
    """纯空白等于没有内容，会渲出一帧无声画面，必须拦住。"""
    data = valid_script_dict()
    data["my_take"]["narration"] = blank
    with pytest.raises(ValidationError):
        Script.model_validate(data)


def test_my_take_text_rejects_whitespace_only():
    data = valid_script_dict()
    data["my_take"]["text"] = "   "
    with pytest.raises(ValidationError):
        Script.model_validate(data)


def test_quote_text_rejects_whitespace_only():
    data = valid_script_dict()
    data["quote"]["text"] = "  "
    with pytest.raises(ValidationError):
        Script.model_validate(data)


def test_text_fields_are_stripped():
    """两头空白会破坏排版对齐，入库前就清掉。"""
    data = valid_script_dict()
    data["quote"]["text"] = "  环境是看不见的手。  "
    script = Script.model_validate(data)
    assert script.quote.text == "环境是看不见的手。"


def test_json_schema_exports():
    schema = Script.model_json_schema()
    assert schema["title"] == "Script"
    assert "hook" in schema["properties"]
