"""阅读位置上报 → 判断是否产生一条历史记忆点。

核心逻辑：距上次上报超过 session_gap，就认为上一段阅读已经结束，
把「那段结束时停留的位置」存成一条 ReadingCheckpoint，再用新位置覆盖
Book 上的当前位置。这样列表里出现的都是「两次阅读之间的断点」，
不会被连续翻页刷屏。

不做成配置项的部分（保留 5 条）：这不是需要按环境调整的东西，写死够用。
"""

from datetime import datetime, timedelta

from sqlmodel import Session, select

from backend.models import Book, ReadingCheckpoint, utcnow
from backend.settings import get_settings

KEEP_CHECKPOINTS = 5


def _naive(dt: datetime) -> datetime:
    """去掉 tzinfo 再比较。

    SQLAlchemy 在 SQLite 上不保留 tzinfo：一次 commit 后（默认
    expire_on_commit=True），下次访问同一个字段会触发重新 SELECT，
    拿到的是不带 tzinfo 的值，直接和刚 set 进去的带 tzinfo 的值相减会
    抛 TypeError。两边都去掉 tzinfo 再比较，避免这个不一致。
    """
    return dt.replace(tzinfo=None) if dt.tzinfo is not None else dt


def _trim_checkpoints(session: Session, book_id: int, keep: int = KEEP_CHECKPOINTS) -> None:
    """只留最近 keep 条，其余删掉。"""
    rows = session.exec(
        select(ReadingCheckpoint)
        .where(ReadingCheckpoint.book_id == book_id)
        .order_by(ReadingCheckpoint.created_at.desc())  # type: ignore[union-attr]
    ).all()
    for row in rows[keep:]:
        session.delete(row)


def record_position(
    session: Session,
    book: Book,
    *,
    cfi: str,
    chapter: str | None,
    progress: int,
) -> None:
    """上报阅读位置。可能产生一条历史记忆点，然后覆盖 Book 的当前位置。"""
    settings = get_settings()
    now = utcnow()
    gap = timedelta(minutes=settings.reading_session_gap_minutes)

    if (
        book.last_opened_at
        and book.last_cfi
        and (_naive(now) - _naive(book.last_opened_at)) > gap
    ):
        session.add(
            ReadingCheckpoint(
                book_id=book.id,
                cfi=book.last_cfi,
                chapter=book.last_chapter,
                progress=book.last_progress,
                # 时间戳用「那段结束时」，不是现在 —— 那才是这条记忆点真正代表的时刻
                created_at=book.last_opened_at,
            )
        )
        _trim_checkpoints(session, book.id or 0)

    book.last_cfi = cfi
    book.last_chapter = chapter
    book.last_progress = progress
    book.last_opened_at = now
    session.add(book)
    session.commit()
