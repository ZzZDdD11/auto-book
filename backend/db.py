from collections.abc import Iterator

from sqlmodel import Session, SQLModel, create_engine

from backend.settings import get_settings

_settings = get_settings()
_settings.storage_dir.mkdir(parents=True, exist_ok=True)

DB_PATH = _settings.storage_dir / "auto-book.db"
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})


def init_db() -> None:
    """建表。幂等，可重复调用。

    在模块底部就调用一次，不依赖 FastAPI 的 lifespan ——
    否则用 TestClient 或脚本直接调用时会遇到「表不存在」。

    SQLModel 的 create_all 只建表不加列。改了模型字段后，老库要手动 ALTER。
    迁移用「检查列是否存在 → 缺了就加」的方式，比 alembic 轻得多，
    对单用户本地项目够用。
    """
    import backend.models  # noqa: F401  确保表已注册

    SQLModel.metadata.create_all(engine)
    _migrate(engine)


# 已知需要补的列。键是 (表名, 列名)，值是列定义。
# 加新字段时往这里加一行，老库启动时会自动补上。
_MIGRATIONS: dict[tuple[str, str], str] = {
    ("job", "auto_advance"): "BOOLEAN NOT NULL DEFAULT 1",
    ("job", "script_json_history"): "TEXT",
    ("asset", "version"): "INTEGER NOT NULL DEFAULT 1",
    ("book", "last_chapter"): "TEXT",
    ("book", "last_progress"): "INTEGER",
    ("book", "last_opened_at"): "TIMESTAMP",
}


def _migrate(eng) -> None:
    """给老库补列。SQLite 不支持 IF NOT EXISTS on ADD COLUMN，要先查。"""
    from sqlalchemy import inspect, text

    insp = inspect(eng)
    with eng.connect() as conn:
        for (table, column), typedef in _MIGRATIONS.items():
            if table not in insp.get_table_names():
                continue
            existing = {c["name"] for c in insp.get_columns(table)}
            if column in existing:
                continue
            # SQLite 的 ALTER TABLE 只能 ADD COLUMN，不能改类型或删列。
            # 对我们够用 —— 还没遇到过要改类型的字段。
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {typedef}"))
            conn.commit()


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session


init_db()
