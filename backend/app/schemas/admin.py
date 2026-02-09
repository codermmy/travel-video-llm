from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, model_validator


class AdminReclusterRequest(BaseModel):
    userId: Optional[str] = None
    allUsers: bool = False
    limitUsers: Optional[int] = Field(default=None, ge=1, le=10000)
    runGeocoding: bool = False

    @model_validator(mode="after")
    def validate_mode(self) -> "AdminReclusterRequest":
        if self.userId and self.allUsers:
            raise ValueError("userId and allUsers cannot both be set")
        if not self.userId and not self.allUsers:
            raise ValueError("either userId or allUsers=true is required")
        return self


class AdminUserReclusterResult(BaseModel):
    userId: str
    totalPhotos: int
    previousEvents: int
    resetPhotos: int
    createdEvents: int
    noisePhotos: int
    uploadedPhotos: int
    geocodedEvents: int


class AdminReclusterResponse(BaseModel):
    startedAt: datetime
    finishedAt: datetime
    durationMs: int
    userCount: int
    totalCreatedEvents: int
    totalPreviousEvents: int
    totalResetPhotos: int
    totalNoisePhotos: int
    results: list[AdminUserReclusterResult]
