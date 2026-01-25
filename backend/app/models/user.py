from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional
from uuid import uuid4

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

# 认证类型常量
AuthType = str  # "device" | "email"


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    device_id: Mapped[Optional[str]] = mapped_column(
        String(128), unique=True, index=True, nullable=True
    )
    email: Mapped[Optional[str]] = mapped_column(String(255), unique=True, index=True, nullable=True)
    hashed_password: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    auth_type: Mapped[AuthType] = mapped_column(
        String(50), nullable=False, server_default="device"
    )
    nickname: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    if TYPE_CHECKING:
        from app.models.event import Event
        from app.models.photo import Photo

    photos: Mapped[list["Photo"]] = relationship(back_populates="user")
    events: Mapped[list["Event"]] = relationship(back_populates="user")
