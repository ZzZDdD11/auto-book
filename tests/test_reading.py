"""record_position 的时段判定逻辑 —— 这是历史记忆点功能的核心。

按 spec 的验证方式第 1、2、3 条：
  1. 间隔超过 session_gap，产生一条记忆点，且记的是「上一段」的位置
  2. 间隔不超过，不产生记忆点，只更新 Book 当前位置
  3. 超过 5 条时淘汰最旧的
"""

from datetime import timedelta

from sqlmodel import Session, SQLModel, create_engine, select

from backend.core.reading import record_position
from backend.models import Book, ReadingCheckpoint, utcnow


def make_session():
    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(engine)
    return Session(engine)


def make_book(session: Session) -> Book:
    book = Book(user_id=1, title="测试书")
    session.add(book)
    session.commit()
    session.refresh(book)
    return book


def test_first_report_does_not_create_checkpoint():
    """第一次上报没有「上一段」可言，不该产生记忆点。"""
    with make_session() as s:
        book = make_book(s)
        record_position(s, book, cfi="/6/2", chapter="第一章", progress=5)

        checkpoints = s.exec(select(ReadingCheckpoint)).all()
        assert checkpoints == []
        assert book.last_cfi == "/6/2"
        assert book.last_progress == 5


def test_short_gap_does_not_create_checkpoint():
    """同一时段内连续上报（间隔小于阈值），不产生新记忆点。"""
    with make_session() as s:
        book = make_book(s)
        record_position(s, book, cfi="/6/2", chapter="第一章", progress=5)
        record_position(s, book, cfi="/6/4", chapter="第一章", progress=8)

        assert s.exec(select(ReadingCheckpoint)).all() == []
        assert book.last_cfi == "/6/4"
        assert book.last_progress == 8


def test_long_gap_creates_checkpoint_from_previous_position():
    """间隔超过阈值，记的必须是「上一次」的位置，不是这一次的。"""
    with make_session() as s:
        book = make_book(s)
        record_position(s, book, cfi="/6/2", chapter="第一章", progress=5)

        # 手动把 last_opened_at 拨回 31 分钟前，模拟隔了一段时间又打开
        book.last_opened_at = utcnow() - timedelta(minutes=31)
        s.add(book)
        s.commit()

        record_position(s, book, cfi="/6/40", chapter="第三章", progress=20)

        checkpoints = s.exec(select(ReadingCheckpoint)).all()
        assert len(checkpoints) == 1
        assert checkpoints[0].cfi == "/6/2"
        assert checkpoints[0].chapter == "第一章"
        assert checkpoints[0].progress == 5
        # Book 上的当前位置已经是新的
        assert book.last_cfi == "/6/40"
        assert book.last_progress == 20


def test_only_keeps_most_recent_five_checkpoints():
    with make_session() as s:
        book = make_book(s)
        record_position(s, book, cfi="/6/0", chapter=None, progress=0)

        # 8 次「跨时段」上报会产生 7 条历史记忆点（每次记的是上一次的位置），
        # 超过 keep=5 的部分应该被淘汰，只留最近的 5 条。
        for i in range(1, 8):
            book.last_opened_at = utcnow() - timedelta(minutes=31)
            s.add(book)
            s.commit()
            record_position(s, book, cfi=f"/6/{i}", chapter=None, progress=i)

        checkpoints = s.exec(select(ReadingCheckpoint)).all()
        assert len(checkpoints) == 5
        # 最早产生的两条记忆点（对应 /6/0、/6/1）应该已经被淘汰
        remaining_cfis = {c.cfi for c in checkpoints}
        assert "/6/0" not in remaining_cfis
        assert "/6/1" not in remaining_cfis
