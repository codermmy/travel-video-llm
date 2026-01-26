from __future__ import annotations

from collections.abc import Generator
from datetime import datetime
from typing import Any

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

# 支持 SQLite 和 PostgreSQL
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    connect_args={"check_same_thread": False} if settings.database_url.startswith("sqlite") else {},
)


if settings.database_url.startswith("sqlite"):
    # Older migrations use server_default=now() which SQLite doesn't provide.
    # Register a compatible now() function for SQLite connections.
    @event.listens_for(engine, "connect")
    def _sqlite_register_now(dbapi_connection: Any, _connection_record: Any) -> None:
        try:
            dbapi_connection.create_function(
                "now", 0, lambda: datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
            )
        except Exception:
            # Best-effort; if registration fails, SQLite may still work depending on schema.
            pass


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
