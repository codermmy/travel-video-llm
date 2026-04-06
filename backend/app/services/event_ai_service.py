from __future__ import annotations

from difflib import SequenceMatcher
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
    get_event_location_text,
    is_coordinate_location_text,
    split_into_chapters,
)
from app.services.event_service import event_service
from app.services.photo_group_service import photo_group_service
from app.services.photo_ai_service import generate_photo_caption
from app.services.story_signal_service import (
    EVENT_TITLE_MAX_CHARS,
    EVENT_STORY_MAX_CHARS,
    HERO_SUMMARY_MAX_CHARS,
    HERO_TITLE_MAX_CHARS,
    aggregate_story_signals,
    build_photo_story_seed,
    normalize_story_output_text,
    sample_story_items,
)

logger = logging.getLogger(__name__)

LARGE_EVENT_LOCAL_TEXT_ONLY_THRESHOLD = 40
MAX_EVENT_STORY_DESCRIPTIONS = 36
MAX_EVENT_STORY_TIMELINE_CLUES = 24


def _normalize_event_title_text(text: str) -> str:
    return normalize_story_output_text(text, EVENT_TITLE_MAX_CHARS)


def _normalize_event_story_text(text: str) -> str:
    return normalize_story_output_text(text, EVENT_STORY_MAX_CHARS)


def _normalize_hero_title_text(text: str) -> str:
    return normalize_story_output_text(text, HERO_TITLE_MAX_CHARS)


def _normalize_hero_summary_text(text: str) -> str:
    return normalize_story_output_text(text, HERO_SUMMARY_MAX_CHARS)


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


def _normalize_similarity_text(text: str) -> str:
    return re.sub(r"[\s，。；、,.!?！？:：·\-_~/|]+", "", str(text or "")).lower()


def _is_high_overlap(
    candidate: str,
    baseline: str,
    *,
    min_ratio: float,
    min_coverage: float,
) -> bool:
    left = _normalize_similarity_text(candidate)
    right = _normalize_similarity_text(baseline)
    if not left or not right:
        return False
    if left == right:
        return True

    shorter, longer = sorted((left, right), key=len)
    if (
        len(shorter) >= 6
        and shorter in longer
        and (len(shorter) / len(longer)) >= min_coverage
    ):
        return True

    return SequenceMatcher(None, left, right).ratio() >= min_ratio


def _should_use_hero_title_fallback(hero_title: str, title: str) -> bool:
    return _is_high_overlap(
        hero_title,
        title,
        min_ratio=0.82,
        min_coverage=0.75,
    )


def _should_use_hero_summary_fallback(hero_summary: str, full_story: str) -> bool:
    return _is_high_overlap(
        hero_summary,
        full_story,
        min_ratio=0.72,
        min_coverage=0.58,
    )


def _simplify_hero_location_label(location: str) -> str:
    source = re.split(r"[·,，]", str(location or "").strip())[0].strip()
    if not source:
        return ""
    city_match = re.match(r"^(.+?)(?:市|州|盟|地区)$", source)
    if city_match and city_match.group(1):
        return city_match.group(1)
    return source[:10]


def _ensure_location_context(event: Event) -> tuple[str, str, str]:
    existing_location_name = str(event.location_name or "").strip()
    existing_detailed_location = str(event.detailed_location or "").strip()
    normalized_location_name = (
        ""
        if is_coordinate_location_text(existing_location_name)
        else existing_location_name
    )
    normalized_detailed_location = (
        ""
        if is_coordinate_location_text(existing_detailed_location)
        else existing_detailed_location
    )
    detailed_location = normalized_detailed_location or normalized_location_name or ""
    location_tags = event.location_tags or ""
    display_location = normalized_location_name or normalized_detailed_location or ""

    if event.gps_lat is not None and event.gps_lon is not None:
        context = amap_client.get_location_context(
            float(event.gps_lat), float(event.gps_lon)
        )
        detailed_location = context.get("detailed_location") or detailed_location
        location_tags = context.get("location_tags") or location_tags
        display_location = context.get("display_location") or display_location

    if not detailed_location:
        detailed_location = normalized_location_name or "旅途中的一站"
    if not display_location:
        display_location = normalized_location_name or detailed_location or "旅途中的一站"

    event.detailed_location = detailed_location
    event.location_tags = location_tags or "旅途见闻、当下感受"
    if display_location and (
        not event.location_name
        or is_coordinate_location_text(str(event.location_name).strip())
    ):
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
        caption = (
            generate_photo_caption(seed_desc)
            if (seed_desc and use_ai_caption)
            else None
        )
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


def _build_hero_title_fallback(event: Event) -> str:
    location = _simplify_hero_location_label(get_event_location_text(event) or "")
    month_label = f"{int(event.start_time.strftime('%m'))}月" if event.start_time else ""
    if month_label and location:
        candidate = f"{month_label}{location}的回望"
    elif location:
        candidate = f"{location}的回望"
    elif month_label:
        candidate = f"{month_label}旅途回望"
    else:
        candidate = "旅途回望"

    fallback = _normalize_hero_title_text(candidate)
    title_text = _normalize_event_title_text(ensure_event_title(event))
    if fallback and not _should_use_hero_title_fallback(fallback, title_text):
        return fallback
    return _normalize_hero_title_text("旅途回望") or title_text


def _build_hero_summary_fallback(event: Event) -> str:
    location = _simplify_hero_location_label(get_event_location_text(event) or "")
    month_label = f"{int(event.start_time.strftime('%m'))}月" if event.start_time else ""
    if month_label and location:
        candidate = f"{month_label}{location}这一程不急着抵达，只让风景把心绪慢慢放轻。"
    elif location:
        candidate = f"这一路经过{location}，也把风景和心绪慢慢收进了回望里。"
    elif month_label:
        candidate = f"{month_label}这一程不急着抵达，只让沿途风景把心绪慢慢放轻。"
    else:
        candidate = "这一程不急着抵达，只让沿途风景把心绪慢慢放轻。"
    return _normalize_hero_summary_text(candidate) or "这段回忆正在慢慢展开。"


def _apply_story_payload_to_event(
    *,
    event: Event,
    story: dict[str, object],
    fallback_emotion: str | None = None,
) -> None:
    generated_title = _normalize_event_title_text(
        str(story.get("title") or ensure_event_title(event))
    )
    full_story = _normalize_event_story_text(
        str(story.get("full_story") or story.get("story") or "")
    )
    if not event.title_manually_set:
        event.title = (
            generated_title
            or _normalize_event_title_text(ensure_event_title(event))
            or ensure_event_title(event)
        )
    event.full_story = full_story or None
    event.story_text = full_story or None

    hero_title = _normalize_hero_title_text(
        str(story.get("hero_title") or story.get("heroTitle") or "")
    )
    hero_summary = _normalize_hero_summary_text(
        str(story.get("hero_summary") or story.get("heroSummary") or "")
    )
    if not hero_title or _should_use_hero_title_fallback(hero_title, event.title or ""):
        hero_title = _build_hero_title_fallback(event)
    if not hero_summary or _should_use_hero_summary_fallback(hero_summary, full_story):
        hero_summary = _build_hero_summary_fallback(event)

    event.hero_title = hero_title or None
    event.hero_summary = hero_summary or None

    emotion = str(story.get("emotion") or fallback_emotion or "").strip()
    if emotion:
        event.emotion_tag = emotion


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
    location_context_snapshot = {
        "location_name": event.location_name,
        "detailed_location": event.detailed_location,
        "location_tags": event.location_tags,
    }
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

    if location_context_snapshot["location_name"] and (
        not event.location_name or is_coordinate_location_text(event.location_name)
    ):
        event.location_name = location_context_snapshot["location_name"]
    if location_context_snapshot["detailed_location"] and (
        not event.detailed_location
        or is_coordinate_location_text(event.detailed_location)
    ):
        event.detailed_location = location_context_snapshot["detailed_location"]
    if location_context_snapshot["location_tags"] and not event.location_tags:
        event.location_tags = location_context_snapshot["location_tags"]

    _apply_story_payload_to_event(
        event=event,
        story=story,
        fallback_emotion=str(signals.get("dominant_emotion") or "").strip() or None,
    )

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
