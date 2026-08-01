from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from sqlmodel import Session, select

from backend.db import get_session
from backend.models import Book, Material, MaterialMode, MaterialSource
from backend.settings import get_settings

router = APIRouter(prefix="/api/materials", tags=["materials"])

SessionDep = Annotated[Session, Depends(get_session)]


class MaterialIn(BaseModel):
    """录入一条素材。

    两种来源：
      - paste：手动粘贴，必须给 book_title
      - epub：阅读器划线，必须给 book_id，且进度和日期必填
        （这样 QuoteFrame 的非空约束由数据保证，不再依赖 AI 兜底）
    """

    book_id: int | None = None
    book_title: str = Field(default="", max_length=60)
    book_author: str = Field(default="", max_length=60)
    source_text: str = Field(min_length=1)
    my_take: str = ""
    chapter: str | None = Field(default=None, max_length=30)
    highlighted_at: date | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    cfi: str | None = Field(default=None, max_length=500)
    source: MaterialSource = MaterialSource.paste
    mode: MaterialMode = MaterialMode.fast

    @model_validator(mode="after")
    def check(self):
        limit = get_settings().max_material_chars
        if len(self.source_text) > limit:
            raise ValueError(f"原文超过 {limit} 字上限")
        if len(self.my_take) > limit:
            raise ValueError(f"个人想法超过 {limit} 字上限")
        if self.mode is MaterialMode.deep and not self.my_take.strip():
            raise ValueError("深耕档必须填写个人想法")

        if self.source is MaterialSource.epub:
            if self.book_id is None:
                raise ValueError("EPUB 来源必须提供 book_id")
            # 阅读器完全知道这两个值，没有理由缺失。
            # 强制必填，QuoteFrame 就不用再靠 AI 猜进度。
            if self.progress is None:
                raise ValueError("EPUB 来源必须提供阅读进度")
            if self.highlighted_at is None:
                raise ValueError("EPUB 来源必须提供划线日期")
        elif self.book_id is None and not self.book_title.strip():
            raise ValueError("必须提供 book_id 或 book_title")
        return self


class MaterialOut(BaseModel):
    material_id: int
    book_id: int


@router.post("", status_code=status.HTTP_201_CREATED, response_model=MaterialOut)
def create_material(payload: MaterialIn, session: SessionDep) -> MaterialOut:
    user_id = get_settings().default_user_id

    if payload.book_id is not None:
        book = session.get(Book, payload.book_id)
        # 不区分「不存在」和「不属于你」，避免泄露 id 是否存在
        if book is None or book.user_id != user_id:
            raise HTTPException(status_code=404, detail="书籍不存在")
    else:
        # 同名书复用，避免「今年第几本」被重复计数
        book = session.exec(
            select(Book).where(Book.user_id == user_id, Book.title == payload.book_title)
        ).first()
        if book is None:
            book = Book(user_id=user_id, title=payload.book_title, author=payload.book_author)
            session.add(book)
            session.commit()
            session.refresh(book)

    material = Material(
        user_id=user_id,
        book_id=book.id,
        source_text=payload.source_text,
        my_take=payload.my_take,
        chapter=payload.chapter,
        highlighted_at=payload.highlighted_at or date.today(),
        progress=payload.progress,
        cfi=payload.cfi,
        source=payload.source,
        mode=payload.mode,
    )
    session.add(material)
    session.commit()
    session.refresh(material)
    return MaterialOut(material_id=material.id, book_id=book.id)
