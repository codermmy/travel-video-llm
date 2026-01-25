from __future__ import annotations

from pydantic import BaseModel


class PhotoOut(BaseModel):
    id: str
