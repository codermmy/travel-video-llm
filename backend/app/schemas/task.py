from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel

TaskStage = Literal['pending', 'clustering', 'geocoding', 'ai']


class TaskStatusResponse(BaseModel):
    taskId: str
    taskType: str
    status: str
    stage: TaskStage = 'pending'
    progress: int
    total: int
    result: Optional[str] = None
    error: Optional[str] = None
    createdAt: datetime
    startedAt: Optional[datetime] = None
    completedAt: Optional[datetime] = None
