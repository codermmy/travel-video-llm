from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class EventResponse(BaseModel):
    id: str
    title: str = ""
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
    status: str = "clustered"


class EventListResponse(BaseModel):
    items: list[EventResponse]
    total: int
    page: int
    pageSize: int
    totalPages: int


class EventPhotoItem(BaseModel):
    id: str
    thumbnailUrl: Optional[str] = None
    shootTime: Optional[datetime] = None


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
    status: Optional[str] = None
