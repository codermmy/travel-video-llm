from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Photo(Base):
    __tablename__ = "photos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True)
    event_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("events.id"), nullable=True)
    uri: Mapped[str] = mapped_column(String(2048), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    if TYPE_CHECKING:
        from app.models.event import Event
        from app.models.user import User

    user: Mapped["User"] = relationship(back_populates="photos")
    event: Mapped["Event"] = relationship(back_populates="photos")
