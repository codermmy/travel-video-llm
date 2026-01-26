from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AsyncTask(Base):
    __tablename__ = "async_tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))

    user_id: Mapped[str] = mapped_column(String(36), index=True)
    task_id: Mapped[Optional[str]] = mapped_column(String(100), index=True, nullable=True)
    task_type: Mapped[str] = mapped_column(String(50), nullable=False)

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    result: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
