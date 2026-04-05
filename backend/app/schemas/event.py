from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.chapter import EventChapterResponse
from app.schemas.photo import PhotoVisionResult
from app.schemas.photo_group import PhotoGroupResponse

EventStatus = Literal[
    "clustered", "waiting_for_vision", "ai_pending", "ai_processing", "generated", "ai_failed"
]
StoryFreshness = Literal["fresh", "stale"]
EnhancementStatus = Literal["none", "retained", "expired"]
EventVisionStatus = Literal["pending", "processing", "partial", "completed", "failed", "unsupported"]


class EventVisionSummary(BaseModel):
    status: EventVisionStatus = "pending"
    total: int = 0
    pending: int = 0
    processing: int = 0
    completed: int = 0
    failed: int = 0
    unsupported: int = 0


class EventResponse(BaseModel):
    id: str
    title: str = ""
    locationName: Optional[str] = None
    gpsLat: Optional[float] = None
    gpsLon: Optional[float] = None
    startTime: Optional[datetime] = None
    endTime: Optional[datetime] = None
    photoCount: int = 0
    coverPhotoId: Optional[str] = None
    coverAssetId: Optional[str] = None
    coverShootTime: Optional[datetime] = None
    coverGpsLat: Optional[float] = None
    coverGpsLon: Optional[float] = None
    coverPhotoUrl: Optional[str] = None
    storyText: Optional[str] = None
    fullStory: Optional[str] = None
    detailedLocation: Optional[str] = None
    locationTags: Optional[str] = None
    emotionTag: Optional[str] = None
    musicUrl: Optional[str] = None
    status: EventStatus = "clustered"
    eventVersion: int = 1
    storyGeneratedFromVersion: Optional[int] = None
    storyFreshness: StoryFreshness = "stale"
    slideshowGeneratedFromVersion: Optional[int] = None
    slideshowFreshness: StoryFreshness = "stale"
    hasPendingStructureChanges: bool = True
    titleManuallySet: bool = False
    storyReady: bool = False
    visionSummary: EventVisionSummary = Field(default_factory=EventVisionSummary)
    aiError: Optional[str] = None
    updatedAt: Optional[datetime] = None


class EventEnhancementSummary(BaseModel):
    status: EnhancementStatus = "none"
    assetCount: int = 0
    totalBytes: int = 0
    canRetry: bool = False
    lastUploadedAt: Optional[datetime] = None
    retainedUntil: Optional[datetime] = None


class EnhancementStorageSummary(BaseModel):
    eventCount: int = 0
    assetCount: int = 0
    totalBytes: int = 0
    nextExpiresAt: Optional[datetime] = None


class EventListResponse(BaseModel):
    items: list[EventResponse]
    total: int
    page: int
    pageSize: int
    totalPages: int


class EventPhotoItem(BaseModel):
    id: str
    assetId: Optional[str] = None
    fileHash: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    photoUrl: Optional[str] = None
    thumbnailUrl: Optional[str] = None
    shootTime: Optional[datetime] = None
    gpsLat: Optional[float] = None
    gpsLon: Optional[float] = None
    caption: Optional[str] = None
    photoIndex: Optional[int] = None
    visualDesc: Optional[str] = None
    microStory: Optional[str] = None
    emotionTag: Optional[str] = None
    visionStatus: str = "pending"
    visionError: Optional[str] = None
    visionUpdatedAt: Optional[datetime] = None
    vision: Optional[PhotoVisionResult] = None


class EventDetailResponse(EventResponse):
    photos: list[EventPhotoItem] = Field(default_factory=list)
    chapters: list[EventChapterResponse] = Field(default_factory=list)
    photoGroups: list[PhotoGroupResponse] = Field(default_factory=list)
    enhancement: EventEnhancementSummary = Field(default_factory=EventEnhancementSummary)


class EventCreateRequest(BaseModel):
    title: Optional[str] = None
    locationName: Optional[str] = None
    photoIds: list[str] = Field(default_factory=list)


class EventUpdateRequest(BaseModel):
    title: Optional[str] = None
    locationName: Optional[str] = None
    gpsLat: Optional[float] = None
    gpsLon: Optional[float] = None
    coverPhotoUrl: Optional[str] = None
    storyText: Optional[str] = None
    fullStory: Optional[str] = None
    detailedLocation: Optional[str] = None
    locationTags: Optional[str] = None
    emotionTag: Optional[str] = None
    musicUrl: Optional[str] = None
    status: Optional[EventStatus] = None


class RegenerateStoryResponse(BaseModel):
    taskId: Optional[str] = None
    status: str


class EnhanceStoryResponse(BaseModel):
    taskId: Optional[str] = None
    status: str
    enhancement: EventEnhancementSummary


class LocationCityCandidate(BaseModel):
    name: str
    displayName: str
    adcode: str


class LocationPlaceCandidate(BaseModel):
    name: str
    address: str = ""
    locationName: str
    detailedLocation: str
    locationTags: str = ""
    gpsLat: float
    gpsLon: float
