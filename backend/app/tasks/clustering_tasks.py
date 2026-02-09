from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import and_, select
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.event import Event
from app.models.photo import Photo
from app.models.task import AsyncTask
from app.services.ai_service import ai_service
from app.services.clustering_service import cluster_user_photos
from app.services.event_ai_service import generate_event_story_for_event
from app.services.event_enrichment import ensure_event_title, format_coordinate_location
from app.services.geocoding_service import geocoding_service
from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


def _now_utc() -> datetime:
    return datetime.now(tz=timezone.utc)


def _get_task(db: Session, task_record_id: str, user_id: str) -> Optional[AsyncTask]:
    return db.scalar(
        select(AsyncTask).where(and_(AsyncTask.id == task_record_id, AsyncTask.user_id == user_id))
    )


def _update_task(
    db: Session,
    task: AsyncTask,
    *,
    status: Optional[str] = None,
    stage: Optional[str] = None,
    progress: Optional[int] = None,
    total: Optional[int] = None,
    result: Optional[str] = None,
    error: Optional[str] = None,
    started_at: Optional[datetime] = None,
    completed_at: Optional[datetime] = None,
) -> None:
    if status is not None:
        task.status = status
    if stage is not None:
        task.stage = stage
    if progress is not None:
        task.progress = int(progress)
    if total is not None:
        task.total = int(total)
    if result is not None:
        task.result = result
    if error is not None:
        task.error = error
    if started_at is not None:
        task.started_at = started_at
    if completed_at is not None:
        task.completed_at = completed_at

    db.add(task)
    db.commit()


def _is_in_memory_bind(db: Session) -> bool:
    bind_url = ""
    try:
        bind = db.get_bind()
        if isinstance(bind, Connection):
            bind_url = str(bind.engine.url)
        elif isinstance(bind, Engine):
            bind_url = str(bind.url)
    except Exception:
        bind_url = ""
    return ":memory:" in bind_url


def _mark_new_events_pending_ai(db: Session, events: list[Event]) -> None:
    changed = False
    for event in events:
        if not event.location_name and event.gps_lat is not None and event.gps_lon is not None:
            event.location_name = format_coordinate_location(
                float(event.gps_lat), float(event.gps_lon)
            )
        event.title = ensure_event_title(event)
        event.status = "ai_pending"
        event.ai_error = None
        changed = True
    if changed:
        db.commit()


def _ai_debug_info() -> str:
    try:
        models = ai_service.current_models()
        return (
            f"provider={ai_service.provider_name()},"
            f"visionModel={models.get('vision_model', '')},"
            f"storyModel={models.get('story_model', '')}"
        )
    except Exception:
        return f"provider={ai_service.provider_name()}"


@celery_app.task(name="cluster_user_photos_task")
def cluster_user_photos_task(user_id: str, task_record_id: str) -> str:
    """Cluster all unclustered photos for a user."""

    db: Session = SessionLocal()
    try:
        task = _get_task(db, task_record_id=task_record_id, user_id=user_id)
        if not task:
            raise RuntimeError("task record not found")

        _update_task(
            db, task, status="started", stage="clustering", progress=10, started_at=_now_utc()
        )

        created = cluster_user_photos(user_id=user_id, db=db)
        _mark_new_events_pending_ai(db, created)
        _update_task(db, task, progress=70)

        geocoding_service.update_event_locations(user_id=user_id, db=db)
        _update_task(db, task, stage="geocoding", progress=90)

        msg = f"创建了 {len(created)} 个事件"
        _update_task(
            db,
            task,
            status="success",
            stage="geocoding",
            progress=100,
            result=msg,
            completed_at=_now_utc(),
        )
        return msg
    except Exception as e:
        try:
            task = _get_task(db, task_record_id=task_record_id, user_id=user_id)
            if task:
                _update_task(db, task, status="failure", error=str(e), completed_at=_now_utc())
        except Exception:
            logger.exception("Failed updating task failure state")
        raise
    finally:
        db.close()


@celery_app.task(name="update_event_location_task")
def update_event_location_task(event_id: str) -> bool:
    db: Session = SessionLocal()
    try:
        event = db.scalar(select(Event).where(Event.id == event_id))
        if not event:
            return False
        if event.gps_lat is None or event.gps_lon is None:
            return False

        name = geocoding_service.get_location_name(float(event.gps_lat), float(event.gps_lon))
        if not name:
            return False

        event.location_name = name
        db.commit()
        return True
    finally:
        db.close()


@celery_app.task(name="process_new_photos_task")
def process_new_photos_task(user_id: str, photo_ids: list[str], task_record_id: str) -> dict:
    """Process newly uploaded photos (clustering + geocoding + AI generation)."""

    db: Session = SessionLocal()
    try:
        task = _get_task(db, task_record_id=task_record_id, user_id=user_id)
        if not task:
            raise RuntimeError("task record not found")

        _update_task(
            db,
            task,
            status="started",
            stage="clustering",
            progress=10,
            total=len(photo_ids),
            started_at=_now_utc(),
        )

        created = cluster_user_photos(user_id=user_id, db=db)
        _mark_new_events_pending_ai(db, created)
        _update_task(db, task, stage="clustering", progress=65)

        updated_locations = geocoding_service.update_event_locations(user_id=user_id, db=db)
        _update_task(db, task, stage="geocoding", progress=80)

        ai_success_count = 0
        ai_failed_count = 0
        if created:
            _update_task(db, task, stage="ai", progress=85)
            total_events = len(created)
            for idx, event in enumerate(created, start=1):
                ok, _ = generate_event_story_for_event(db=db, user_id=user_id, event_id=event.id)
                if ok:
                    ai_success_count += 1
                else:
                    ai_failed_count += 1
                progress = 85 + int((idx / total_events) * 14)
                _update_task(db, task, stage="ai", progress=min(progress, 99))

        debug_info = _ai_debug_info()
        result = {
            "photos": len(photo_ids),
            "events": len(created),
            "updatedLocations": updated_locations,
            "aiGenerated": ai_success_count,
            "aiFailed": ai_failed_count,
            "provider": ai_service.provider_name(),
            "models": ai_service.current_models(),
        }

        _update_task(
            db,
            task,
            status="success",
            stage="ai" if created else "geocoding",
            progress=100,
            result=(
                f"创建了 {len(created)} 个事件，AI 生成成功 {ai_success_count} 个，失败 {ai_failed_count} 个 ({debug_info})"
            ),
            completed_at=_now_utc(),
        )
        return result
    except Exception as e:
        try:
            task = _get_task(db, task_record_id=task_record_id, user_id=user_id)
            if task:
                _update_task(db, task, status="failure", error=str(e), completed_at=_now_utc())
        except Exception:
            logger.exception("Failed updating task failure state")
        raise
    finally:
        db.close()


@celery_app.task(name="generate_event_story_task")
def generate_event_story_task(user_id: str, event_id: str, task_record_id: str) -> dict:
    """Generate AI story for one event."""

    db: Session = SessionLocal()
    try:
        task = _get_task(db, task_record_id=task_record_id, user_id=user_id)
        if not task:
            raise RuntimeError("task record not found")

        _update_task(
            db,
            task,
            status="started",
            stage="ai",
            progress=15,
            total=1,
            started_at=_now_utc(),
        )

        ok, reason = generate_event_story_for_event(db=db, user_id=user_id, event_id=event_id)

        debug_info = _ai_debug_info()

        if ok:
            _update_task(
                db,
                task,
                status="success",
                stage="ai",
                progress=100,
                result=f"AI 故事生成完成 ({debug_info})",
                completed_at=_now_utc(),
            )
            return {"eventId": event_id, "success": True, "provider": ai_service.provider_name()}

        error_message = f"{reason or 'ai_story_generation_failed'} ({debug_info})"
        _update_task(
            db,
            task,
            status="failure",
            stage="ai",
            progress=100,
            error=error_message,
            completed_at=_now_utc(),
        )
        return {
            "eventId": event_id,
            "success": False,
            "error": reason,
            "provider": ai_service.provider_name(),
        }
    finally:
        db.close()


def trigger_clustering_task(user_id: str, db: Session) -> Optional[str]:
    """Create task record and enqueue processing.

    Returns the Celery task id.
    """

    photo_ids = list(
        db.scalars(
            select(Photo.id).where(
                and_(
                    Photo.user_id == user_id,
                    Photo.event_id.is_(None),
                    Photo.status.in_(["uploaded", "noise"]),
                )
            )
        ).all()
    )

    task = AsyncTask(
        user_id=user_id,
        task_id=None,
        task_type="clustering",
        status="pending",
        stage="pending",
        progress=0,
        total=len(photo_ids),
        result=None,
        error=None,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    if _is_in_memory_bind(db):
        task.status = "failure"
        task.error = "async tasks unsupported for in-memory database"
        task.completed_at = _now_utc()
        db.commit()
        return None

    try:
        async_result = celery_app.send_task(
            "process_new_photos_task",
            kwargs={
                "user_id": user_id,
                "photo_ids": photo_ids,
                "task_record_id": task.id,
            },
        )
    except Exception as e:
        task.status = "failure"
        task.error = str(e)
        task.completed_at = _now_utc()
        db.commit()
        return None

    task.task_id = async_result.id
    db.commit()
    return async_result.id


def trigger_event_story_task(user_id: str, event_id: str, db: Session) -> Optional[str]:
    """Create async task for regenerating event AI story."""

    task = AsyncTask(
        user_id=user_id,
        task_id=None,
        task_type="ai_story",
        status="pending",
        stage="pending",
        progress=0,
        total=1,
        result=None,
        error=None,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    if _is_in_memory_bind(db):
        ok, reason = generate_event_story_for_event(db=db, user_id=user_id, event_id=event_id)
        debug_info = _ai_debug_info()
        task.status = "success" if ok else "failure"
        task.stage = "ai"
        task.progress = 100
        task.result = f"AI 故事生成完成 ({debug_info})" if ok else None
        task.error = None if ok else f"{reason} ({debug_info})"
        task.started_at = _now_utc()
        task.completed_at = _now_utc()
        db.commit()
        return None

    try:
        async_result = celery_app.send_task(
            "generate_event_story_task",
            kwargs={
                "user_id": user_id,
                "event_id": event_id,
                "task_record_id": task.id,
            },
        )
    except Exception as e:
        task.status = "failure"
        task.error = str(e)
        task.completed_at = _now_utc()
        db.commit()
        return None

    task.task_id = async_result.id
    db.commit()
    return async_result.id


def _generate_ai_story(db: Session, user_id: str, event_id: str) -> None:
    """Backward-compatible helper for tests and legacy call sites."""
    generate_event_story_for_event(db=db, user_id=user_id, event_id=event_id)
