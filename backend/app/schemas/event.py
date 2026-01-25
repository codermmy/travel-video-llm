from __future__ import annotations

from pydantic import BaseModel


class EventOut(BaseModel):
    id: str
