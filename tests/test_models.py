from datetime import date

from sqlmodel import Session, SQLModel, create_engine, select

from backend.models import Asset, Book, Job, JobStatus, Material, MaterialMode, MaterialSource


def make_session():
    engine = create_engine("sqlite://")
    SQLModel.metadata.create_all(engine)
    return Session(engine)


def test_material_persists_with_user_id():
    with make_session() as s:
        book = Book(user_id=1, title="原子习惯", author="James Clear")
        s.add(book)
        s.commit()
        s.refresh(book)

        m = Material(
            user_id=1,
            book_id=book.id,
            source_text="环境是塑造人类行为看不见的手。",
            my_take="改环境本身也要意志力。",
            chapter="第 12 章",
            highlighted_at=date(2026, 8, 1),
            progress=43,
            source=MaterialSource.paste,
            mode=MaterialMode.fast,
        )
        s.add(m)
        s.commit()
        s.refresh(m)

        assert m.id is not None
        assert m.user_id == 1
        assert m.created_at is not None


def test_job_defaults_to_pending():
    with make_session() as s:
        book = Book(user_id=1, title="测试书")
        s.add(book)
        s.commit()
        s.refresh(book)
        m = Material(user_id=1, book_id=book.id, source_text="原文", my_take="想法")
        s.add(m)
        s.commit()
        s.refresh(m)

        job = Job(user_id=1, material_id=m.id)
        s.add(job)
        s.commit()
        s.refresh(job)

        assert job.status == JobStatus.pending
        assert job.script_json is None
        assert job.error is None
        assert job.cost_tokens == 0


def test_assets_query_by_job():
    with make_session() as s:
        book = Book(user_id=1, title="测试书")
        s.add(book)
        s.commit()
        s.refresh(book)
        m = Material(user_id=1, book_id=book.id, source_text="原文", my_take="想法")
        s.add(m)
        s.commit()
        s.refresh(m)
        job = Job(user_id=1, material_id=m.id)
        s.add(job)
        s.commit()
        s.refresh(job)

        s.add(Asset(job_id=job.id, kind="video", path="storage/jobs/1/out.mp4"))
        s.add(Asset(job_id=job.id, kind="audio", path="storage/jobs/1/quote.mp3"))
        s.commit()

        found = s.exec(select(Asset).where(Asset.job_id == job.id)).all()
        assert len(found) == 2
        assert {a.kind for a in found} == {"video", "audio"}
