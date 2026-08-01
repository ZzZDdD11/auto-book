from collections.abc import Iterator

from sqlmodel import Session, SQLModel, create_engine

from backend.settings import get_settings

_settings = get_settings()
_settings.storage_dir.mkdir(parents=True, exist_ok=True)

DB_PATH = _settings.storage_dir / "auto-book.db"
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})


def init_db() -> None:
    import backend.models  # noqa: F401  确保表已注册

    SQLModel.metadata.create_all(engine)


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session
