from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import and_, select
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models.photo import Photo
from app.models.task import AsyncTask
from app.services.ai_service import ai_service
from app.services.clustering_service import cluster_user_photos
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
    progress: Optional[int] = None,
    total: Optional[int] = None,
    result: Optional[str] = None,
    error: Optional[str] = None,
    started_at: Optional[datetime] = None,
    completed_at: Optional[datetime] = None,
) -> None:
    if status is not None:
        task.status = status
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


@celery_app.task(name="cluster_user_photos_task")
def cluster_user_photos_task(user_id: str, task_record_id: str) -> str:
    """Cluster all unclustered photos for a user."""

    db: Session = SessionLocal()
    try:
        task = _get_task(db, task_record_id=task_record_id, user_id=user_id)
        if not task:
            raise RuntimeError("task record not found")

        _update_task(db, task, status="started", progress=10, started_at=_now_utc())

        created = cluster_user_photos(user_id=user_id, db=db)
        _update_task(db, task, progress=70)

        # Update location names for newly created events.
        geocoding_service.update_event_locations(user_id=user_id, db=db)
        _update_task(db, task, progress=90)

        msg = f"创建了 {len(created)} 个事件"
        _update_task(
            db,
            task,
            status="success",
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
        from app.models.event import Event

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
    """Process newly uploaded photos (clustering + geocoding)."""

    db: Session = SessionLocal()
    try:
        task = _get_task(db, task_record_id=task_record_id, user_id=user_id)
        if not task:
            raise RuntimeError("task record not found")

        _update_task(
            db,
            task,
            status="started",
            progress=10,
            total=len(photo_ids),
            started_at=_now_utc(),
        )

        created = cluster_user_photos(user_id=user_id, db=db)
        _update_task(db, task, progress=70)

        updated_locations = geocoding_service.update_event_locations(user_id=user_id, db=db)
        _update_task(db, task, progress=90)

        # Best-effort AI story generation for newly created events.
        if ai_service.client.is_configured():
            for event in created:
                try:
                    _generate_ai_story(db=db, user_id=user_id, event_id=event.id)
                except Exception:
                    logger.exception("AI story generation failed for event %s", event.id)
        _update_task(db, task, progress=95)

        result = {
            "photos": len(photo_ids),
            "events": len(created),
            "updatedLocations": updated_locations,
        }

        _update_task(
            db,
            task,
            status="success",
            progress=100,
            result=f"创建了 {len(created)} 个事件",
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
                    Photo.status == "uploaded",
                )
            )
        ).all()
    )

    task = AsyncTask(
        user_id=user_id,
        task_id=None,
        task_type="clustering",
        status="pending",
        progress=0,
        total=len(photo_ids),
        result=None,
        error=None,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    # Tests use in-memory SQLite; do not enqueue real Celery tasks because the
    # worker uses the default database_url and won't see the in-memory task row.
    bind_url = ""
    try:
        bind = db.get_bind()
        if isinstance(bind, Connection):
            bind_url = str(bind.engine.url)
        elif isinstance(bind, Engine):
            bind_url = str(bind.url)
    except Exception:
        bind_url = ""
    if ":memory:" in bind_url:
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


def _generate_ai_story(db: Session, user_id: str, event_id: str) -> None:
    from app.models.event import Event

    event = db.scalar(select(Event).where(and_(Event.id == event_id, Event.user_id == user_id)))
    if not event:
        return

    start = event.start_time
    end = event.end_time
    if not start or not end:
        return

    photos = list(
        db.scalars(
            select(Photo)
            .where(and_(Photo.user_id == user_id, Photo.event_id == event_id))
            .order_by(Photo.shoot_time.asc().nullslast(), Photo.created_at.asc())
        ).all()
    )
    if not photos:
        return

    # Only absolute URLs are usable by external AI services.
    photo_urls = [
        (p.thumbnail_url or "") for p in photos if (p.thumbnail_url or "").startswith("http")
    ]
    if not photo_urls:
        return

    analysis = ai_service.analyze_event_photos(
        event_id=event_id,
        photo_urls=photo_urls,
        location=event.location_name or "",
    )
    descriptions = [str(d) for d in analysis.get("descriptions", []) if d]

    story = ai_service.generate_event_story(
        event_id=event_id,
        location=event.location_name or "",
        start_time=start.isoformat(),
        end_time=end.isoformat(),
        photo_descriptions=descriptions,
    )
    if not story:
        return

    event.title = str(story.get("title") or event.title or "")
    event.story_text = str(story.get("story") or "")
    emotion = story.get("emotion")
    if isinstance(emotion, str) and emotion:
        event.emotion_tag = emotion
    event.status = "generated"
    db.commit()
