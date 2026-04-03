from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Optional
from uuid import uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Photo(Base):
    __tablename__ = "photos"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    event_id: Mapped[Optional[str]] = mapped_column(
        String(36), ForeignKey("events.id"), nullable=True
    )

    asset_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    file_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    local_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    thumbnail_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    thumbnail_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    storage_provider: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    object_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    file_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    gps_lat: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 7), nullable=True)
    gps_lon: Mapped[Optional[Decimal]] = mapped_column(Numeric(10, 7), nullable=True)
    shoot_time: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    status: Mapped[str] = mapped_column(String(20), default="uploaded")
    uri: Mapped[str] = mapped_column(String(2048), default="")
    caption: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    photo_index: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    visual_desc: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    micro_story: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    emotion_tag: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    vision_result: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    vision_status: Mapped[str] = mapped_column(String(20), default="pending")
    vision_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    vision_updated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    __table_args__ = (
        Index("idx_photos_user_hash", "user_id", "file_hash", unique=True),
        Index("idx_photos_shoot_time", "shoot_time"),
        Index("idx_photos_event", "event_id"),
    )

    if TYPE_CHECKING:
        from app.models.event import Event
        from app.models.user import User

    user: Mapped["User"] = relationship(back_populates="photos")
    event: Mapped["Event"] = relationship(back_populates="photos")
