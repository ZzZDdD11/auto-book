from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from sqlmodel import Session, select

from backend.db import engine, get_session
from backend.models import Book, Job, JobStatus, Material, MaterialMode, MaterialSource
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


class MaterialPatch(BaseModel):
    """素材编辑的请求体。所有字段可选，只更新提供的。"""

    source_text: str | None = None
    my_take: str | None = None
    chapter: str | None = None
    progress: int | None = Field(default=None, ge=0, le=100)


async def _restart_job(job_id: int) -> None:
    """后台重跑 job：退回 scripting，重生成脚本，一路往下。"""
    from backend.core.pipeline import run_job

    with Session(engine) as session:
        await run_job(job_id, session)


@router.patch("/{material_id}", response_model=dict)
async def edit_material(
    material_id: int,
    payload: MaterialPatch,
    session: SessionDep,
    background: BackgroundTasks,
) -> dict[str, Any]:
    """改素材。关联的 job 退回 scripting 重跑。

    旧视频保留为历史版本（version 不变，新版本 version+1）。
    找不到关联 job 就只改素材不重跑（素材可能还没出过视频）。
    """
    material = session.get(Material, material_id)
    if material is None:
        raise HTTPException(status_code=404, detail="素材不存在")

    # 只更新非 None 的字段
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(material, field, value)
    session.add(material)
    session.commit()

    # 只重启最新的一个 job —— 改素材是为了修正「这条素材出过的最新视频」，
    # 不是要把历史版本全部重跑（那些是过去某个时刻的快照，不该动）。
    jobs = session.exec(
        select(Job).where(Job.material_id == material_id).order_by(Job.created_at.desc())  # type: ignore[union-attr]
    ).all()
    restarted: list[int] = []
    if jobs:
        job = jobs[0]
        job.script_json = None
        job.script_json_history = None
        job.status = JobStatus.scripting
        job.auto_advance = True
        job.error = None
        session.add(job)
        session.commit()
        restarted.append(job.id or 0)
        background.add_task(_restart_job, job.id or 0)

    return {"material_id": material_id, "restarted_jobs": restarted}
