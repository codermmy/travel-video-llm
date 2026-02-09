from __future__ import annotations

import logging
from typing import Optional, Tuple

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.photo import Photo
from app.services.ai_service import ai_service
from app.services.event_enrichment import (
    ensure_event_title,
    format_coordinate_location,
    get_event_location_text,
)
from app.services.storage_service import storage_service

logger = logging.getLogger(__name__)


def generate_event_story_for_event(
    db: Session,
    user_id: str,
    event_id: str,
    *,
    strict_ai: bool = True,
) -> Tuple[bool, Optional[str]]:
    event = db.scalar(select(Event).where(and_(Event.id == event_id, Event.user_id == user_id)))
    if not event:
        return False, "event_not_found"

    photos = list(
        db.scalars(
            select(Photo)
            .where(and_(Photo.user_id == user_id, Photo.event_id == event_id))
            .order_by(Photo.shoot_time.asc().nullslast(), Photo.created_at.asc())
        ).all()
    )
    if not photos:
        event.status = "ai_failed"
        event.ai_error = "event_has_no_photos"
        event.title = ensure_event_title(event)
        db.commit()
        return False, event.ai_error

    if not ai_service.is_configured():
        reason = ai_service.configuration_error_code()
        if strict_ai:
            event.status = "ai_failed"
            event.ai_error = reason
            event.title = ensure_event_title(event)
            db.commit()
            return False, reason
        return False, reason

    event.status = "ai_processing"
    event.ai_error = None
    if not event.location_name and event.gps_lat is not None and event.gps_lon is not None:
        event.location_name = format_coordinate_location(float(event.gps_lat), float(event.gps_lon))
    event.title = ensure_event_title(event)
    db.commit()

    public_urls: list[str] = []
    for photo in photos:
        resolved = storage_service.resolve_public_url(photo.thumbnail_url)
        if resolved:
            public_urls.append(resolved)

    if not public_urls:
        event.status = "ai_failed"
        event.ai_error = "photos_are_not_publicly_accessible_for_ai"
        event.title = ensure_event_title(event)
        db.commit()
        return False, event.ai_error

    location = get_event_location_text(event) or "未知地点"

    analysis = ai_service.analyze_event_photos(
        event_id=event_id,
        photo_urls=public_urls,
        location=location,
    )
    descriptions = [str(d) for d in analysis.get("descriptions", []) if d]

    if not event.start_time or not event.end_time:
        event.status = "ai_failed"
        event.ai_error = "event_date_range_missing"
        event.title = ensure_event_title(event)
        db.commit()
        return False, event.ai_error

    story = ai_service.generate_event_story(
        event_id=event_id,
        location=location,
        start_time=event.start_time.isoformat(),
        end_time=event.end_time.isoformat(),
        photo_descriptions=descriptions,
    )
    if not story:
        event.status = "ai_failed"
        event.ai_error = ai_service.last_error_code or "story_generation_failed"
        event.title = ensure_event_title(event)
        db.commit()
        return False, event.ai_error

    event.title = str(story.get("title") or ensure_event_title(event))
    event.story_text = str(story.get("story") or "").strip() or None

    emotion = story.get("emotion")
    if isinstance(emotion, str) and emotion:
        event.emotion_tag = emotion

    event.status = "generated"
    event.ai_error = None
    db.commit()
    return True, None
