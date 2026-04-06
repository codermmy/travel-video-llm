from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Event(Base):
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(256), default="")

    location_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    gps_lat: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 7), nullable=True)
    gps_lon: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 7), nullable=True)
    start_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    end_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    photo_count: Mapped[int] = mapped_column(Integer, default=0)
    cover_photo_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    cover_photo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    story_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    full_story: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    hero_title: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    hero_summary: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    detailed_location: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    location_tags: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    emotion_tag: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    music_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    music_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="clustered")
    event_version: Mapped[int] = mapped_column(Integer, default=1)
    story_generated_from_version: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    story_requested_for_version: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    story_freshness: Mapped[str] = mapped_column(String(20), default="stale")
    slideshow_generated_from_version: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True
    )
    slideshow_freshness: Mapped[str] = mapped_column(String(20), default="stale")
    has_pending_structure_changes: Mapped[bool] = mapped_column(Boolean, default=True)
    title_manually_set: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    if TYPE_CHECKING:
        from app.models.chapter import EventChapter
        from app.models.photo import Photo
        from app.models.user import User

    user: Mapped["User"] = relationship(back_populates="events")
    photos: Mapped[list["Photo"]] = relationship(back_populates="event")
    chapters: Mapped[list["EventChapter"]] = relationship(
        back_populates="event",
        cascade="all, delete-orphan",
        order_by="EventChapter.chapter_index",
    )
