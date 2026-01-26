from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.api.deps import CurrentUserIdDep
from app.db.session import get_db
from app.models.task import AsyncTask
from app.schemas.common import ApiResponse
from app.schemas.task import TaskStatusResponse

router = APIRouter()


@router.get("/status/{task_id}", response_model=ApiResponse[TaskStatusResponse])
def get_task_status(
    task_id: str,
    current_user_id: CurrentUserIdDep,
    db: Session = Depends(get_db),
) -> ApiResponse[TaskStatusResponse]:
    task = db.scalar(
        select(AsyncTask).where(
            and_(AsyncTask.user_id == current_user_id, AsyncTask.task_id == task_id)
        )
    )
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="任务不存在")

    return ApiResponse.ok(
        TaskStatusResponse(
            taskId=task.task_id or "",
            taskType=task.task_type,
            status=task.status,
            progress=task.progress,
            total=task.total,
            result=task.result,
            error=task.error,
            createdAt=task.created_at,
            startedAt=task.started_at,
            completedAt=task.completed_at,
        )
    )
