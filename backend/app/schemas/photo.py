from __future__ import annotations

from datetime import datetime
from typing import Annotated, Optional

from pydantic import BaseModel, Field


class CheckDuplicatesRequest(BaseModel):
    hashes: Annotated[list[str], Field(min_length=1, max_length=1000)]


class CheckDuplicatesData(BaseModel):
    newHashes: list[str]
    existingHashes: list[str]
    totalCount: int


class PhotoUploadItem(BaseModel):
    hash: str = Field(..., min_length=64, max_length=64)
    thumbnailPath: str
    gpsLat: Optional[float] = None
    gpsLon: Optional[float] = None
    shootTime: Optional[datetime] = None
    width: Optional[int] = None
    height: Optional[int] = None
    fileSize: Optional[int] = None


class PhotoUploadRequest(BaseModel):
    photos: Annotated[list[PhotoUploadItem], Field(min_length=1, max_length=2000)]
    triggerClustering: bool = True


class PhotoUploadData(BaseModel):
    uploaded: int
    failed: int
    taskId: Optional[str] = None


class PhotoOut(BaseModel):
    id: str
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
