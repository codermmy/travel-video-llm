from __future__ import annotations

import logging
import re
from typing import Optional, Tuple

from sqlalchemy import and_, delete, select
from sqlalchemy.orm import Session

from app.integrations.amap import amap_client
from app.models.chapter import EventChapter
from app.models.event import Event
from app.models.photo import Photo
from app.models.photo_group import PhotoGroup
from app.services.ai_service import ai_service
from app.services.chapter_ai_service import generate_chapter_story
from app.services.event_enrichment import (
    ensure_event_title,
    format_coordinate_location,
    split_into_chapters,
)
from app.services.event_service import event_service
from app.services.photo_group_service import photo_group_service
from app.services.photo_ai_service import generate_photo_caption
from app.services.story_signal_service import (
    aggregate_story_signals,
    build_photo_story_seed,
    sample_story_items,
)

logger = logging.getLogger(__name__)

LARGE_EVENT_LOCAL_TEXT_ONLY_THRESHOLD = 40
MAX_EVENT_STORY_DESCRIPTIONS = 36
MAX_EVENT_STORY_TIMELINE_CLUES = 24


def _should_use_local_text_only(photo_count: int) -> bool:
    return photo_count > LARGE_EVENT_LOCAL_TEXT_ONLY_THRESHOLD


def _build_local_photo_caption(seed_desc: str) -> str | None:
    text = seed_desc.strip()
    if not text:
        return None

    parts = [p.strip() for p in re.split(r"[，。；、,;\s]+", text) if p.strip()]
    if not parts:
        return text[:100]
    return " · ".join(parts[:4])[:100]


def _ensure_location_context(event: Event) -> tuple[str, str, str]:
    detailed_location = event.detailed_location or event.location_name or ""
    location_tags = event.location_tags or ""
    display_location = event.location_name or detailed_location or ""

    if event.gps_lat is not None and event.gps_lon is not None:
        context = amap_client.get_location_context(
            float(event.gps_lat), float(event.gps_lon)
        )
        detailed_location = context.get("detailed_location") or detailed_location
        location_tags = context.get("location_tags") or location_tags
        display_location = context.get("display_location") or display_location

    if not detailed_location:
        fallback = format_coordinate_location(
            float(event.gps_lat) if event.gps_lat is not None else None,
            float(event.gps_lon) if event.gps_lon is not None else None,
        )
        detailed_location = fallback or "未知地点"

    event.detailed_location = detailed_location
    event.location_tags = location_tags or "旅途见闻、当下感受"
    if not event.location_name and display_location:
        event.location_name = display_location

    location_value = str(event.location_name or detailed_location or "未知地点")
    detailed_value = str(event.detailed_location or detailed_location or "未知地点")
    tags_value = str(event.location_tags or "")
    return (location_value, detailed_value, tags_value)


def _save_photo_captions(
    photos: list[Photo],
    *,
    use_ai_caption: bool = True,
) -> None:
    if not photos:
        return

    for photo in photos:
        seed_desc = build_photo_story_seed(photo)
        caption = generate_photo_caption(seed_desc) if (seed_desc and use_ai_caption) else None
        if caption:
            photo.caption = caption
            continue

        if photo.caption:
            continue

        fallback = _build_local_photo_caption(seed_desc)
        if fallback:
            photo.caption = fallback


def _save_event_chapters(
    db: Session,
    *,
    event: Event,
    photos: list[Photo],
    detailed_location: str,
    location_tags: str,
    narrative_boost: str = "",
    use_ai_micro_story: bool = True,
) -> None:
    db.execute(delete(PhotoGroup).where(PhotoGroup.event_id == event.id))
    db.execute(delete(EventChapter).where(EventChapter.event_id == event.id))

    chapter_slices = split_into_chapters(photos, chunk_size=10)
    total_chapters = len(chapter_slices)

    for chapter_number, (start_idx, end_idx, chapter_photos) in enumerate(
        chapter_slices, start=1
    ):
        generated = generate_chapter_story(
            event=event,
            chapter_index=chapter_number,
            total_chapters=total_chapters,
            chapter_photos=chapter_photos,
            detailed_location=detailed_location,
            location_tags=location_tags,
            narrative_boost=narrative_boost,
        )
        if not generated:
            continue

        chapter = EventChapter(
            user_id=event.user_id,
            event_id=event.id,
            chapter_index=chapter_number,
            chapter_title=generated.chapter_title,
            chapter_story=generated.chapter_story,
            chapter_intro=None,
            chapter_summary=None,
            slideshow_caption=generated.slideshow_caption,
            photo_start_index=start_idx,
            photo_end_index=end_idx,
        )
        db.add(chapter)
        db.flush()

        chapter_summary = photo_group_service.create_for_chapter(
            db,
            user_id=event.user_id,
            event_id=event.id,
            chapter=chapter,
            chapter_photos=chapter_photos,
            chapter_start_index=start_idx,
            chapter_index=chapter_number,
            total_chapters=total_chapters,
            use_ai_micro_story=use_ai_micro_story,
        )
        chapter.chapter_intro = chapter_summary.get("intro")
        chapter.chapter_summary = chapter_summary.get("summary")


def generate_event_story_for_event(
    db: Session,
    user_id: str,
    event_id: str,
    *,
    target_version: Optional[int] = None,
    strict_ai: bool = True,
) -> Tuple[bool, Optional[str]]:
    event = db.scalar(
        select(Event).where(and_(Event.id == event_id, Event.user_id == user_id))
    )
    if not event:
        return False, "event_not_found"

    generation_version = target_version or event.event_version
    if event.event_version != generation_version:
        return True, "event_version_outdated"

    photos = list(
        db.scalars(
            select(Photo)
            .where(and_(Photo.user_id == user_id, Photo.event_id == event_id))
            .order_by(Photo.shoot_time.asc().nullslast(), Photo.created_at.asc())
        ).all()
    )
    if not photos:
        event_service.mark_story_failed(
            event=event,
            target_version=generation_version,
            reason="event_has_no_photos",
        )
        event.title = ensure_event_title(event)
        db.commit()
        return False, event.ai_error

    if not ai_service.is_configured():
        reason = ai_service.configuration_error_code()
        if strict_ai:
            event_service.mark_story_failed(
                event=event,
                target_version=generation_version,
                reason=reason,
            )
            event.title = ensure_event_title(event)
            db.commit()
            return False, reason
        return False, reason

    if not event_service.mark_story_processing(
        event=event,
        target_version=generation_version,
    ):
        db.rollback()
        return True, "event_version_outdated"
    event.title = ensure_event_title(event)
    db.commit()

    location, detailed_location, location_tags = _ensure_location_context(event)
    signals = aggregate_story_signals(photos)
    descriptions = sample_story_items(
        [str(d) for d in signals.get("photo_descriptions", []) if d],
        MAX_EVENT_STORY_DESCRIPTIONS,
    )
    timeline_clues = sample_story_items(
        [
            str(item)
            for item in signals.get("timeline_clues", [])
            if isinstance(item, str) and item.strip()
        ],
        MAX_EVENT_STORY_TIMELINE_CLUES,
    )
    use_ai_per_photo_copy = not _should_use_local_text_only(len(photos))

    if not event.start_time or not event.end_time:
        event_service.mark_story_failed(
            event=event,
            target_version=generation_version,
            reason="event_date_range_missing",
        )
        event.title = ensure_event_title(event)
        db.commit()
        return False, event.ai_error

    story = ai_service.generate_event_story(
        event_id=event_id,
        location=location,
        start_time=event.start_time.isoformat(),
        end_time=event.end_time.isoformat(),
        photo_descriptions=descriptions,
        detailed_location=detailed_location,
        location_tags=location_tags,
        structured_summary=str(signals.get("structured_summary") or ""),
        timeline_clues=timeline_clues,
    )
    if not story:
        event_service.mark_story_failed(
            event=event,
            target_version=generation_version,
            reason=ai_service.last_error_code or "story_generation_failed",
        )
        event.title = ensure_event_title(event)
        db.commit()
        return False, event.ai_error

    db.refresh(event)
    if event.event_version != generation_version:
        return True, "event_version_outdated"

    if not event.title_manually_set:
        event.title = str(story.get("title") or ensure_event_title(event))
    full_story = str(story.get("full_story") or story.get("story") or "").strip()
    event.full_story = full_story or None
    event.story_text = full_story or None

    emotion = story.get("emotion") or signals.get("dominant_emotion")
    if isinstance(emotion, str) and emotion:
        event.emotion_tag = emotion

    _save_photo_captions(photos, use_ai_caption=use_ai_per_photo_copy)
    _save_event_chapters(
        db,
        event=event,
        photos=photos,
        detailed_location=detailed_location,
        location_tags=location_tags,
        narrative_boost="",
        use_ai_micro_story=use_ai_per_photo_copy,
    )

    event_service.mark_story_generated(event=event, target_version=generation_version)
    db.commit()
    return True, None
