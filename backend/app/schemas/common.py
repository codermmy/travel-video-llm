from __future__ import annotations

from datetime import datetime, timezone
from typing import Generic, Optional, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    success: bool
    data: Optional[T] = None
    message: Optional[str] = None
    timestamp: datetime

    @classmethod
    def ok(cls, data: Optional[T] = None, message: Optional[str] = None) -> "ApiResponse[T]":
        return cls(
            success=True,
            data=data,
            message=message,
            timestamp=datetime.now(tz=timezone.utc),
        )
