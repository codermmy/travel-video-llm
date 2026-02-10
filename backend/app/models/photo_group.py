from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class PhotoGroup(Base):
    __tablename__ = "photo_groups"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    event_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("events.id"), nullable=False, index=True
    )
    chapter_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("event_chapters.id"), nullable=False, index=True
    )

    group_index: Mapped[int] = mapped_column(Integer, nullable=False)
    group_theme: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    group_emotion: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    group_scene_desc: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    photo_start_index: Mapped[int] = mapped_column(Integer, nullable=False)
    photo_end_index: Mapped[int] = mapped_column(Integer, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (Index("idx_photo_groups_chapter", "chapter_id", "group_index"),)

    if TYPE_CHECKING:
        from app.models.chapter import EventChapter
        from app.models.event import Event

    chapter: Mapped["EventChapter"] = relationship()
    event: Mapped["Event"] = relationship()
