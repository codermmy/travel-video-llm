from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class PhotoGroupResponse(BaseModel):
    id: str
    chapterId: str
    groupIndex: int
    groupTheme: Optional[str] = None
    groupEmotion: Optional[str] = None
    groupSceneDesc: Optional[str] = None
    photoStartIndex: int
    photoEndIndex: int
    createdAt: datetime
