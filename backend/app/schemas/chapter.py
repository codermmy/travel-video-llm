from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class EventChapterResponse(BaseModel):
    id: str
    chapterIndex: int
    chapterTitle: Optional[str] = None
    chapterStory: Optional[str] = None
    chapterIntro: Optional[str] = None
    chapterSummary: Optional[str] = None
    slideshowCaption: Optional[str] = None
    photoStartIndex: int
    photoEndIndex: int
    createdAt: datetime
