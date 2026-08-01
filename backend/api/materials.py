from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field, model_validator
from sqlmodel import Session, select

from backend.db import get_session
from backend.models import Book, Material, MaterialMode, MaterialSource
from backend.settings import get_settings

router = APIRouter(prefix="/api/materials", tags=["materials"])

SessionDep = Annotated[Session, Depends(get_session)]


class MaterialIn(BaseModel):
    book_title: str = Field(min_length=1, max_length=60)
    book_author: str = Field(default="", max_length=60)
    source_text: str = Field(min_length=1)
    my_take: str = ""
    chapter: str | None = Field(default=None, max_length=30)
    highlighted_at: date | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
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
        return self


class MaterialOut(BaseModel):
    material_id: int
    book_id: int


@router.post("", status_code=status.HTTP_201_CREATED, response_model=MaterialOut)
def create_material(payload: MaterialIn, session: SessionDep) -> MaterialOut:
    user_id = get_settings().default_user_id

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
        source=MaterialSource.paste,
        mode=payload.mode,
    )
    session.add(material)
    session.commit()
    session.refresh(material)
    return MaterialOut(material_id=material.id, book_id=book.id)
