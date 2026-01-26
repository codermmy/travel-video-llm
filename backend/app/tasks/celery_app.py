from __future__ import annotations

from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "travel_album",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone=settings.celery_timezone,
    enable_utc=False,
    task_time_limit=settings.celery_task_time_limit,
)

# Auto discover tasks under app.tasks
celery_app.autodiscover_tasks(["app"])
