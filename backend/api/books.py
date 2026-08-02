"""书架与阅读器接口。

安全要点（EPUB 是用户上传的不可信文件）：
  - 落盘文件名用 sha256 生成，绝不使用客户端的 filename
  - 每个接口都校验 Book.user_id 归属，改 URL 里的 id 拿不到别人的书
  - 文件下发前 resolve() 并校验落在 storage 内，防目录穿越
  - 不挂 StaticFiles 到 storage/，否则数据库和视频产物会变成可枚举目录
"""

import json
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from backend.core.epub import Chapter, EpubError, compute_progress, parse_epub, validate_and_hash
from backend.core.reading import record_position
from backend.db import get_session
from backend.models import Book, Material, ReadingCheckpoint
from backend.settings import get_settings

router = APIRouter(prefix="/api/books", tags=["books"])

SessionDep = Annotated[Session, Depends(get_session)]
EpubUpload = Annotated[UploadFile, File(description="EPUB 文件")]

_COVER_MEDIA = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
}


class BookOut(BaseModel):
    id: int
    title: str
    author: str
    total_chars: int
    last_cfi: str | None
    last_chapter: str | None
    last_progress: int | None
    last_opened_at: str | None
    has_cover: bool
    material_count: int


class PositionIn(BaseModel):
    cfi: str = Field(min_length=1, max_length=500)
    chapter_index: int = Field(ge=0)
    fraction: float = Field(ge=0, le=1)
    chapter_title: str = Field(default="", max_length=200)


class CheckpointOut(BaseModel):
    cfi: str
    chapter: str | None
    progress: int | None
    created_at: str


class ProgressIn(BaseModel):
    """把「第几章 + 章内比例」换算成全书百分比。

    epub.js 只能给章节内进度，全书进度必须由后端用字数表算。
    """

    chapter_index: int = Field(ge=0)
    fraction: float = Field(ge=0, le=1)


class MaterialBrief(BaseModel):
    id: int
    source_text: str
    my_take: str
    chapter: str | None
    progress: int | None
    cfi: str | None


def _owned_book(book_id: int, session: Session) -> Book:
    """取书并校验归属。找不到或不属于当前用户都返回 404。

    不区分「不存在」和「不属于你」，避免泄露 id 是否存在。
    """
    book = session.get(Book, book_id)
    if book is None or book.user_id != get_settings().default_user_id:
        raise HTTPException(status_code=404, detail="书籍不存在")
    return book


def _chapters_of(book: Book) -> list[Chapter]:
    if not book.chapters_json:
        return []
    try:
        raw = json.loads(book.chapters_json)
    except json.JSONDecodeError:
        return []
    return [Chapter(**c) for c in raw]


def _safe_under(path_str: str, root: Path) -> Path:
    """校验路径落在 root 内，防目录穿越。"""
    path = Path(path_str).resolve()
    if not path.is_relative_to(root.resolve()):
        raise HTTPException(status_code=403, detail="非法的文件路径")
    if not path.is_file():
        raise HTTPException(status_code=404, detail="文件已不存在")
    return path


@router.post("/upload", status_code=status.HTTP_201_CREATED, response_model=BookOut)
async def upload_epub(session: SessionDep, file: EpubUpload) -> BookOut:
    settings = get_settings()
    data = await file.read()

    try:
        sha = validate_and_hash(data)
        meta = parse_epub(data)
    except EpubError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None

    user_id = settings.default_user_id

    # 同一本书重复上传就复用，避免「今年第几本」被重复计数
    existing = session.exec(
        select(Book).where(Book.user_id == user_id, Book.file_sha256 == sha)
    ).first()
    if existing is not None:
        return _to_out(existing, session)

    # 文件名由服务端生成，绝不使用客户端的 filename
    settings.epub_dir.mkdir(parents=True, exist_ok=True)
    epub_path = settings.epub_dir / f"{sha}.epub"
    epub_path.write_bytes(data)

    cover_path: str | None = None
    if meta.cover_bytes:
        settings.cover_dir.mkdir(parents=True, exist_ok=True)
        cover_file = settings.cover_dir / f"{sha}{meta.cover_ext}"
        cover_file.write_bytes(meta.cover_bytes)
        cover_path = str(cover_file)

    book = Book(
        user_id=user_id,
        title=meta.title,
        author=meta.author,
        cover_path=cover_path,
        epub_path=str(epub_path),
        file_sha256=sha,
        total_chars=meta.total_chars,
        chapters_json=json.dumps([c.__dict__ for c in meta.chapters], ensure_ascii=False),
    )
    session.add(book)
    session.commit()
    session.refresh(book)
    return _to_out(book, session)


def _to_out(book: Book, session: Session) -> BookOut:
    count = len(
        session.exec(select(Material).where(Material.book_id == book.id)).all()
    )
    return BookOut(
        id=book.id or 0,
        title=book.title,
        author=book.author,
        total_chars=book.total_chars,
        last_cfi=book.last_cfi,
        last_chapter=book.last_chapter,
        last_progress=book.last_progress,
        last_opened_at=book.last_opened_at.isoformat() if book.last_opened_at else None,
        has_cover=bool(book.cover_path),
        material_count=count,
    )


@router.get("", response_model=list[BookOut])
def list_books(session: SessionDep) -> list[BookOut]:
    books = session.exec(
        select(Book)
        .where(Book.user_id == get_settings().default_user_id)
        .order_by(
            Book.last_opened_at.isnot(None).desc(),  # type: ignore[union-attr]
            Book.last_opened_at.desc(),  # type: ignore[union-attr]
            Book.created_at.desc(),  # type: ignore[union-attr]
        )
    ).all()
    return [_to_out(b, session) for b in books]


@router.get("/{book_id}/file")
def get_epub_file(book_id: int, session: SessionDep) -> FileResponse:
    book = _owned_book(book_id, session)
    if not book.epub_path:
        raise HTTPException(status_code=404, detail="这本书没有 EPUB 文件")
    path = _safe_under(book.epub_path, get_settings().storage_dir)
    return FileResponse(path, media_type="application/epub+zip")


@router.get("/{book_id}/cover")
def get_cover(book_id: int, session: SessionDep) -> FileResponse:
    book = _owned_book(book_id, session)
    if not book.cover_path:
        raise HTTPException(status_code=404, detail="这本书没有封面")
    path = _safe_under(book.cover_path, get_settings().storage_dir)
    media = _COVER_MEDIA.get(path.suffix.lower(), "application/octet-stream")
    return FileResponse(path, media_type=media)


@router.post("/{book_id}/position", status_code=status.HTTP_204_NO_CONTENT)
def save_position(book_id: int, payload: PositionIn, session: SessionDep) -> None:
    """上报阅读位置。可能顺带产生一条历史记忆点，见 record_position。"""
    book = _owned_book(book_id, session)
    progress = compute_progress(
        _chapters_of(book), book.total_chars, payload.chapter_index, payload.fraction
    )
    record_position(
        session,
        book,
        cfi=payload.cfi,
        chapter=payload.chapter_title or None,
        progress=progress,
    )


@router.get("/{book_id}/checkpoints", response_model=list[CheckpointOut])
def list_checkpoints(book_id: int, session: SessionDep) -> list[CheckpointOut]:
    """最近的历史记忆点（不含「现在」，那条数据已经在 BookOut 里）。"""
    _owned_book(book_id, session)
    rows = session.exec(
        select(ReadingCheckpoint)
        .where(ReadingCheckpoint.book_id == book_id)
        .order_by(ReadingCheckpoint.created_at.desc())  # type: ignore[union-attr]
    ).all()
    return [
        CheckpointOut(
            cfi=r.cfi,
            chapter=r.chapter,
            progress=r.progress,
            created_at=r.created_at.isoformat(),
        )
        for r in rows
    ]


@router.post("/{book_id}/progress")
def calc_progress(book_id: int, payload: ProgressIn, session: SessionDep) -> dict[str, int]:
    """算全书进度。前端划线时调用，拿到真实百分比再存素材。"""
    book = _owned_book(book_id, session)
    value = compute_progress(
        _chapters_of(book), book.total_chars, payload.chapter_index, payload.fraction
    )
    return {"progress": value}


@router.get("/{book_id}/materials", response_model=list[MaterialBrief])
def list_materials(book_id: int, session: SessionDep) -> list[MaterialBrief]:
    _owned_book(book_id, session)
    rows = session.exec(
        select(Material)
        .where(Material.book_id == book_id)
        .order_by(Material.created_at.desc())  # type: ignore[union-attr]
    ).all()
    return [
        MaterialBrief(
            id=m.id or 0,
            source_text=m.source_text,
            my_take=m.my_take,
            chapter=m.chapter,
            progress=m.progress,
            cfi=m.cfi,
        )
        for m in rows
    ]
