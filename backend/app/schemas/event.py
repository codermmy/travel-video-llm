from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

EventStatus = Literal['clustered', 'ai_pending', 'ai_processing', 'generated', 'ai_failed']


class EventResponse(BaseModel):
    id: str
    title: str = ''
    locationName: Optional[str] = None
    gpsLat: Optional[float] = None
    gpsLon: Optional[float] = None
    startTime: Optional[datetime] = None
    endTime: Optional[datetime] = None
    photoCount: int = 0
    coverPhotoUrl: Optional[str] = None
    storyText: Optional[str] = None
    emotionTag: Optional[str] = None
    musicUrl: Optional[str] = None
    status: EventStatus = 'clustered'
    aiError: Optional[str] = None


class EventListResponse(BaseModel):
    items: list[EventResponse]
    total: int
    page: int
    pageSize: int
    totalPages: int


class EventPhotoItem(BaseModel):
    id: str
    photoUrl: Optional[str] = None
    thumbnailUrl: Optional[str] = None
    shootTime: Optional[datetime] = None
    gpsLat: Optional[float] = None
    gpsLon: Optional[float] = None


class EventDetailResponse(EventResponse):
    photos: list[EventPhotoItem] = Field(default_factory=list)


class EventCreateRequest(BaseModel):
    title: Optional[str] = None


class EventUpdateRequest(BaseModel):
    title: Optional[str] = None
    locationName: Optional[str] = None
    coverPhotoUrl: Optional[str] = None
    storyText: Optional[str] = None
    emotionTag: Optional[str] = None
    musicUrl: Optional[str] = None
    status: Optional[EventStatus] = None


class RegenerateStoryResponse(BaseModel):
    taskId: Optional[str] = None
    status: str
