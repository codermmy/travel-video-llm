from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class EventChapter(Base):
    __tablename__ = "event_chapters"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    event_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("events.id"), nullable=False, index=True
    )

    chapter_index: Mapped[int] = mapped_column(Integer, nullable=False)
    chapter_title: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    chapter_story: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    chapter_intro: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    chapter_summary: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    slideshow_caption: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    photo_start_index: Mapped[int] = mapped_column(Integer, nullable=False)
    photo_end_index: Mapped[int] = mapped_column(Integer, nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

    __table_args__ = (Index("idx_chapters_event", "event_id", "chapter_index"),)

    if TYPE_CHECKING:
        from app.models.event import Event

    event: Mapped["Event"] = relationship(back_populates="chapters")
