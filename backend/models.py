"""数据表。

所有业务表从第一天就带 user_id，v1 固定为 1。
这样以后加登录只需要改「怎么拿到 user_id」，不用改表。
"""

from datetime import UTC, date, datetime
from enum import Enum

from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(UTC)


class MaterialSource(str, Enum):
    paste = "paste"
    epub = "epub"
    wechat = "wechat"


class MaterialMode(str, Enum):
    """深耕档 / 快产档。

    这个字段不用来限制什么，它的用途是留出数据：
    哪一档产出的视频表现更好，年底有多少内容是真正想过的。
    """

    deep = "deep"
    fast = "fast"


class JobStatus(str, Enum):
    pending = "pending"
    scripting = "scripting"
    tts = "tts"
    rendering = "rendering"
    done = "done"
    failed = "failed"


class Book(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(index=True)
    title: str
    author: str = ""
    cover_path: str | None = None
    created_at: datetime = Field(default_factory=utcnow)


class Material(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(index=True)
    book_id: int = Field(foreign_key="book.id", index=True)
    source_text: str
    my_take: str = ""
    chapter: str | None = None
    highlighted_at: date | None = None
    progress: int | None = None
    source: MaterialSource = MaterialSource.paste
    mode: MaterialMode = MaterialMode.fast
    created_at: datetime = Field(default_factory=utcnow)


class Job(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(index=True)
    material_id: int = Field(foreign_key="material.id", index=True)
    status: JobStatus = Field(default=JobStatus.pending, index=True)
    script_json: str | None = None
    copy_json: str | None = None
    error: str | None = None
    cost_tokens: int = 0
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Asset(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    job_id: int = Field(foreign_key="job.id", index=True)
    kind: str  # audio | video | caption
    path: str
    created_at: datetime = Field(default_factory=utcnow)
