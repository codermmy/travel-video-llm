from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel

from app.schemas.event import EventResponse

TaskStage = Literal["pending", "clustering", "geocoding", "ai"]


class TaskStatusResponse(BaseModel):
    taskId: str
    taskType: str
    status: str
    stage: TaskStage = "pending"
    progress: int
    total: int
    result: Optional[str] = None
    error: Optional[str] = None
    createdAt: datetime
    startedAt: Optional[datetime] = None
    completedAt: Optional[datetime] = None


class SyncCloudSnapshot(BaseModel):
    eventCount: int
    photoCount: int
    cursor: Optional[datetime] = None


class SyncDeviceSnapshot(BaseModel):
    lastPullCursor: Optional[datetime] = None
    lastPullAt: Optional[datetime] = None


class SyncStatusResponse(BaseModel):
    deviceId: str
    isFirstSyncOnDevice: bool
    needsSync: bool
    cloud: SyncCloudSnapshot
    device: SyncDeviceSnapshot
    serverTime: datetime


class SyncPullRequest(BaseModel):
    mode: Literal["metadata_only"] = "metadata_only"
    sinceCursor: Optional[datetime] = None


class SyncPullStats(BaseModel):
    pulledEvents: int
    cloudEventCount: int


class SyncPullResponse(BaseModel):
    mode: Literal["metadata_only"] = "metadata_only"
    events: list[EventResponse]
    deletedEventIds: list[str]
    newCursor: Optional[datetime] = None
    stats: SyncPullStats


class SyncAckRequest(BaseModel):
    cursor: Optional[datetime] = None


class SyncAckResponse(BaseModel):
    ok: bool
