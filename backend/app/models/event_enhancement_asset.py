from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class EventEnhancementAsset(Base):
    __tablename__ = "event_enhancement_assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    event_id: Mapped[str] = mapped_column(String(36), ForeignKey("events.id"), index=True)
    photo_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("photos.id"), nullable=True)

    local_path: Mapped[str] = mapped_column(String(500), nullable=False)
    public_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    storage_provider: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    object_key: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    file_size: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    analysis_result: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
