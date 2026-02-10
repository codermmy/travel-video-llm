from __future__ import annotations

import sys

from celery import Celery

from app.core.config import settings

celery_app = Celery(
    "travel_album",
    broker=settings.redis_url,
    backend=settings.redis_url,
)

default_pool = "solo" if sys.platform == "darwin" else "prefork"
worker_pool = settings.celery_worker_pool.strip() or default_pool
worker_concurrency = 1 if worker_pool == "solo" else max(1, settings.celery_worker_concurrency)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone=settings.celery_timezone,
    enable_utc=False,
    task_time_limit=settings.celery_task_time_limit,
    worker_pool=worker_pool,
    worker_concurrency=worker_concurrency,
)

# Auto discover tasks under app.tasks
celery_app.autodiscover_tasks(["app"])
