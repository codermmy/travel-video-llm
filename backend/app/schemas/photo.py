from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, Field

PeopleCountBucket = Literal["0", "1", "2-3", "4+"]


class PhotoMetadataItem(BaseModel):
    gpsLat: Optional[float] = None
    gpsLon: Optional[float] = None
    shootTime: Optional[datetime] = None
    filename: Optional[str] = None


class CheckDuplicatesByMetadataRequest(BaseModel):
    photos: Annotated[list[PhotoMetadataItem], Field(min_length=1, max_length=1000)]


class CheckDuplicatesByMetadataData(BaseModel):
    newItems: list[PhotoMetadataItem]
    existingItems: list[PhotoMetadataItem]
    newIndices: list[int]
    existingIndices: list[int]
    totalCount: int


class PhotoVisionResult(BaseModel):
    schema_version: str
    source_platform: str
    generated_at: datetime
    scene_category: Optional[str] = None
    object_tags: list[str] = Field(default_factory=list)
    activity_hint: Optional[str] = None
    people_present: bool = False
    people_count_bucket: PeopleCountBucket = "0"
    emotion_hint: Optional[str] = None
    ocr_text: str = ""
    landmark_hint: Optional[str] = None
    image_quality_flags: list[str] = Field(default_factory=list)
    cover_score: float = 0.0
    confidence_map: dict[str, float] = Field(default_factory=dict)


class PhotoUploadItem(BaseModel):
    clientRef: Optional[str] = None
    assetId: Optional[str] = None
    gpsLat: Optional[float] = None
    gpsLon: Optional[float] = None
    shootTime: Optional[datetime] = None
    width: Optional[int] = None
    height: Optional[int] = None
    fileSize: Optional[int] = None
    vision: Optional[PhotoVisionResult] = None


class PhotoUploadRequest(BaseModel):
    photos: Annotated[list[PhotoUploadItem], Field(min_length=1, max_length=2000)]
    triggerClustering: bool = True


class PhotoUploadData(BaseModel):
    uploaded: int
    failed: int
    taskId: Optional[str] = None
    items: list["PhotoUploadResultItem"] = Field(default_factory=list)


class PhotoUploadResultItem(BaseModel):
    id: str
    clientRef: Optional[str] = None
    assetId: Optional[str] = None
    gpsLat: Optional[float] = None
    gpsLon: Optional[float] = None
    shootTime: Optional[datetime] = None


class PhotoOut(BaseModel):
    id: str
    assetId: Optional[str] = None
    fileHash: Optional[str] = None
    thumbnailUrl: Optional[str] = None
    storageProvider: Optional[str] = None
    objectKey: Optional[str] = None
    gpsLat: Optional[float] = None
    gpsLon: Optional[float] = None
    shootTime: Optional[datetime] = None
    eventId: Optional[str] = None
    status: Optional[str] = None
    caption: Optional[str] = None
    visualDesc: Optional[str] = None
    emotionTag: Optional[str] = None
    vision: Optional[PhotoVisionResult] = None


class PhotoListData(BaseModel):
    items: list[PhotoOut]
    total: int
    page: int
    pageSize: int
    totalPages: int


class PhotoUpdateRequest(BaseModel):
    eventId: Optional[str] = None
    status: Optional[str] = None
    caption: Optional[str] = None


class PhotoStatsData(BaseModel):
    total: int
    withGps: int
    withoutGps: int
    clustered: int
    unclustered: int


class PhotoQueryParams(BaseModel):
    page: int = Field(1, ge=1)
    pageSize: int = Field(20, ge=1, le=100)
    eventId: Optional[str] = None
    hasGps: Optional[bool] = None
    status: Optional[str] = None
    caption: Optional[str] = None
