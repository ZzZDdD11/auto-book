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
    # 流水线阶段：每个完成后进对应的 _pending，等 auto_advance 或 resume
    pending = "pending"
    scripting = "scripting"
    script_pending = "script_pending"
    tts = "tts"
    tts_pending = "tts_pending"
    rendering = "rendering"
    render_pending = "render_pending"
    cover_pending = "cover_pending"
    copywriting = "copywriting"
    done = "done"
    failed = "failed"


class Book(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(index=True)
    title: str
    author: str = ""
    cover_path: str | None = None
    # ---- EPUB 阅读器用 ----
    epub_path: str | None = None
    # 同一本书重复上传时复用记录，不新建
    file_sha256: str | None = Field(default=None, index=True)
    # 全书有效字符数，是阅读进度的分母
    total_chars: int = 0
    # 章节表（标题 + 字数 + 累计偏移）的 JSON，用来把章内比例换算成全书进度
    chapters_json: str | None = None
    # 上次读到哪（EPUB CFI），重开自动跳回
    last_cfi: str | None = None
    # 当前位置的章节标题/全书进度，跟 last_cfi 一起更新，
    # 侧栏「现在」这一条展示时复用，不用重新算一次
    last_chapter: str | None = None
    last_progress: int | None = None
    # 最近一次上报阅读位置的时间，用于书架排序与判断阅读时段是否已结束
    last_opened_at: datetime | None = None
    created_at: datetime = Field(default_factory=utcnow)


class ReadingCheckpoint(SQLModel, table=True):
    """一条历史记忆点：某次阅读时段结束时停留的位置。

    只在「距上次上报超过 session_gap」时才新增一条 —— 按阅读时段聚合，
    不是每次翻页都记，否则列表会被刷屏。每本书最多保留最近 5 条，
    见 backend/core/reading.py。
    """

    id: int | None = Field(default=None, primary_key=True)
    book_id: int = Field(foreign_key="book.id", index=True)
    cfi: str
    chapter: str | None = None
    progress: int | None = None
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
    # EPUB 定位符，用来回到划线处
    cfi: str | None = None
    source: MaterialSource = MaterialSource.paste
    mode: MaterialMode = MaterialMode.fast
    created_at: datetime = Field(default_factory=utcnow)


class Job(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    user_id: int = Field(index=True)
    material_id: int = Field(foreign_key="material.id", index=True)
    status: JobStatus = Field(default=JobStatus.pending, index=True)
    script_json: str | None = None
    # AI 重写单帧时，旧版整份 script_json 追加到这里，可回滚
    script_json_history: str | None = None
    copy_json: str | None = None
    error: str | None = None
    cost_tokens: int = 0
    # 默认 true：阶段完成后自动进下一阶段（保持「随手记、自动出片」体验）。
    # 任何编辑操作把它关掉，停在当前 _pending 等用户 resume。
    auto_advance: bool = True
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Asset(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    job_id: int = Field(foreign_key="job.id", index=True)
    kind: str  # audio | video | cover:{ratio} | caption
    path: str
    # 产物版本号。改素材重跑、单帧重做都会 +1，旧版保留为历史。
    version: int = 1
    created_at: datetime = Field(default_factory=utcnow)
