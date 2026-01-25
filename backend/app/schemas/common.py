from __future__ import annotations

from datetime import datetime, timezone
from typing import Generic, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    success: bool
    data: T | None = None
    message: str | None = None
    timestamp: datetime

    @classmethod
    def ok(cls, data: T | None = None, message: str | None = None) -> "ApiResponse[T]":
        return cls(
            success=True,
            data=data,
            message=message,
            timestamp=datetime.now(tz=timezone.utc),
        )
