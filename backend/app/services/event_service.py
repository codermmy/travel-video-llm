from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from typing import Iterable, Optional, TypedDict

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.models.chapter import EventChapter
from app.models.event import Event
from app.models.photo import Photo
from app.models.photo_group import PhotoGroup
from app.utils.geo import calculate_center_point


class EventVisionSummaryData(TypedDict):
    status: str
    total: int
    pending: int
    processing: int
    completed: int
    failed: int
    unsupported: int
    story_ready: bool


class EventService:
    @staticmethod
    def _photo_time_value(photo: Photo):
        return photo.shoot_time or photo.created_at

    @staticmethod
    def _normalize_event_version(event: Event) -> int:
        return int(event.event_version or 1)

    def is_story_ready(self, vision_summary: EventVisionSummaryData) -> bool:
        return bool(vision_summary["story_ready"])

    def get_user_events(
        self,
        user_id: str,
        db: Session,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[Event], int]:
        query = select(Event).where(Event.user_id == user_id)

        total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
        events = db.scalars(
            query.order_by(Event.start_time.desc().nullslast(), Event.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        ).all()
        return list(events), int(total)

    def get_event_detail(
        self, event_id: str, user_id: str, db: Session
    ) -> Optional[Event]:
        return db.scalar(
            select(Event).where(and_(Event.id == event_id, Event.user_id == user_id))
        )

    def create_event(
        self,
        *,
        user_id: str,
        db: Session,
        title: Optional[str] = None,
        location_name: Optional[str] = None,
        photo_ids: Optional[list[str]] = None,
    ) -> Event:
        has_initial_photos = bool(photo_ids)
        event = Event(
            user_id=user_id,
            title=title or "",
            location_name=location_name,
            status="ai_pending" if has_initial_photos else "waiting_for_vision",
            ai_error=None,
            event_version=1,
            story_freshness="stale",
            slideshow_freshness="stale",
            has_pending_structure_changes=has_initial_photos,
            title_manually_set=title is not None,
        )
        db.add(event)
        db.flush()

        if photo_ids:
            photos = list(
                db.scalars(
                    select(Photo).where(
                        and_(Photo.user_id == user_id, Photo.id.in_(photo_ids))
                    )
                ).all()
            )
            for photo in photos:
                photo.event_id = event.id
                photo.status = "clustered"

        db.commit()
        db.refresh(event)
        return event

    def get_event_photos(self, event_id: str, user_id: str, db: Session) -> list[Photo]:
        return list(
            db.scalars(
                select(Photo)
                .where(and_(Photo.user_id == user_id, Photo.event_id == event_id))
                .order_by(Photo.shoot_time.asc().nullslast(), Photo.created_at.asc())
            ).all()
        )

    def get_event_chapters(
        self, event_id: str, user_id: str, db: Session
    ) -> list[EventChapter]:
        return list(
            db.scalars(
                select(EventChapter)
                .where(
                    and_(
                        EventChapter.user_id == user_id,
                        EventChapter.event_id == event_id,
                    )
                )
                .order_by(EventChapter.chapter_index.asc())
            ).all()
        )

    def get_event_photo_groups(
        self, event_id: str, user_id: str, db: Session
    ) -> list[PhotoGroup]:
        return list(
            db.scalars(
                select(PhotoGroup)
                .where(
                    and_(PhotoGroup.user_id == user_id, PhotoGroup.event_id == event_id)
                )
                .order_by(PhotoGroup.chapter_id.asc(), PhotoGroup.group_index.asc())
            ).all()
        )

    def build_event_vision_summary_from_counts(
        self,
        *,
        total: int,
        counts: dict[str, int] | defaultdict[str, int],
    ) -> EventVisionSummaryData:
        pending = int(counts.get("pending", 0))
        processing = int(counts.get("processing", 0))
        completed = int(counts.get("completed", 0))
        failed = int(counts.get("failed", 0))
        unsupported = int(counts.get("unsupported", 0))
        story_ready = total > 0 and pending == 0 and processing == 0 and completed > 0

        if total == 0:
            status = "pending"
        elif processing > 0 or (completed > 0 and pending > 0):
            status = "processing"
        elif pending > 0:
            status = "pending"
        elif story_ready and failed == 0 and unsupported == 0:
            status = "completed"
        elif story_ready:
            status = "partial"
        elif unsupported > 0 and failed == 0:
            status = "unsupported"
        else:
            status = "failed"

        return {
            "status": status,
            "total": int(total),
            "pending": pending,
            "processing": processing,
            "completed": completed,
            "failed": failed,
            "unsupported": unsupported,
            "story_ready": story_ready,
        }

    def build_event_vision_summary(self, photos: list[Photo]) -> EventVisionSummaryData:
        counts: defaultdict[str, int] = defaultdict(int)
        for photo in photos:
            counts[str(photo.vision_status or "pending")] += 1
        return self.build_event_vision_summary_from_counts(total=len(photos), counts=counts)

    def resolve_event_runtime_status(
        self,
        *,
        event: Event,
        vision_summary: EventVisionSummaryData,
    ) -> str:
        if not self.is_story_ready(vision_summary):
            return "waiting_for_vision"

        current_version = self._normalize_event_version(event)
        if (
            event.story_generated_from_version == current_version
            and event.story_freshness == "fresh"
        ):
            return "generated"

        if (
            event.status == "ai_processing"
            and event.story_requested_for_version == current_version
        ):
            return "ai_processing"

        if event.status == "ai_failed" and event.story_requested_for_version == current_version:
            return "ai_failed"

        return "ai_pending"

    def repair_generated_event_state(self, event: Event) -> bool:
        current_version = self._normalize_event_version(event)
        if (
            event.story_generated_from_version == current_version
            and event.story_freshness == "fresh"
            and event.status != "generated"
        ):
            event.status = "generated"
            event.ai_error = None
            if event.slideshow_generated_from_version != current_version:
                event.slideshow_generated_from_version = current_version
            if event.slideshow_freshness != "fresh":
                event.slideshow_freshness = "fresh"
            return True
        return False

    def can_generate_story(
        self,
        event: Event,
        *,
        vision_summary: Optional[EventVisionSummaryData] = None,
    ) -> bool:
        story_ready = (
            self.is_story_ready(vision_summary)
            if vision_summary is not None
            else event.status != "waiting_for_vision"
        )
        return bool(
            event.photo_count > 0
            and event.start_time is not None
            and event.end_time is not None
            and story_ready
        )

    def mark_structure_changed(self, event: Event) -> None:
        event.event_version = self._normalize_event_version(event) + 1
        event.story_freshness = "stale"
        event.slideshow_freshness = "stale"
        event.has_pending_structure_changes = True
        event.status = "ai_pending"
        event.ai_error = None

    def mark_events_structure_changed(
        self,
        *,
        event_ids: Iterable[str | None],
        user_id: str,
        db: Session,
    ) -> list[str]:
        changed_ids: list[str] = []
        seen_ids = {event_id for event_id in event_ids if event_id}
        for event_id in seen_ids:
            event = self.get_event_detail(event_id=event_id, user_id=user_id, db=db)
            if not event:
                continue
            self.mark_structure_changed(event)
            changed_ids.append(event_id)

        if changed_ids:
            db.commit()

        return changed_ids

    def should_request_story_refresh(self, event: Event, *, force: bool = False) -> bool:
        current_version = self._normalize_event_version(event)
        if not self.can_generate_story(event):
            return False
        if force:
            return True
        if event.story_requested_for_version != current_version:
            return True
        return False

    def mark_event_pending_story_refresh(
        self,
        *,
        event_id: str,
        user_id: str,
        db: Session,
        force: bool = False,
    ) -> Optional[Event]:
        event = self.get_event_detail(event_id=event_id, user_id=user_id, db=db)
        if not event:
            return None

        if self.should_request_story_refresh(event, force=force):
            event.status = "ai_pending"
            event.ai_error = None
            event.story_requested_for_version = self._normalize_event_version(event)
            db.commit()
            db.refresh(event)

        return event

    def mark_story_processing(
        self,
        *,
        event: Event,
        target_version: int,
    ) -> bool:
        if self._normalize_event_version(event) != target_version:
            return False
        event.status = "ai_processing"
        event.ai_error = None
        event.story_requested_for_version = target_version
        return True

    def mark_story_generated(self, *, event: Event, target_version: int) -> bool:
        if self._normalize_event_version(event) != target_version:
            return False
        event.story_generated_from_version = target_version
        event.story_requested_for_version = target_version
        event.story_freshness = "fresh"
        event.slideshow_generated_from_version = target_version
        event.slideshow_freshness = "fresh"
        event.has_pending_structure_changes = False
        event.status = "generated"
        event.ai_error = None
        return True

    def mark_story_failed(self, *, event: Event, target_version: int, reason: str) -> bool:
        if self._normalize_event_version(event) != target_version:
            return False
        event.status = "ai_failed"
        event.ai_error = reason
        event.story_requested_for_version = target_version
        event.story_freshness = (
            "fresh"
            if event.story_generated_from_version == target_version
            else "stale"
        )
        event.slideshow_freshness = (
            "fresh"
            if event.slideshow_generated_from_version == target_version
            else "stale"
        )
        return True

    def refresh_event_summary(
        self,
        *,
        event_id: str,
        user_id: str,
        db: Session,
    ) -> Optional[Event]:
        event = self.get_event_detail(event_id=event_id, user_id=user_id, db=db)
        if not event:
            return None

        photos = list(
            db.scalars(
                select(Photo)
                .where(and_(Photo.user_id == user_id, Photo.event_id == event_id))
                .order_by(Photo.shoot_time.asc().nullslast(), Photo.created_at.asc())
            ).all()
        )
        photos.sort(key=self._photo_time_value)
        vision_summary = self.build_event_vision_summary(photos)

        event.photo_count = len(photos)

        if photos:
            event.start_time = self._photo_time_value(photos[0])
            event.end_time = self._photo_time_value(photos[-1])

            cover_photo = photos[len(photos) // 2]
            event.cover_photo_id = cover_photo.id
            event.cover_photo_url = cover_photo.thumbnail_url

            gps_points = [
                (float(photo.gps_lat), float(photo.gps_lon))
                for photo in photos
                if photo.gps_lat is not None and photo.gps_lon is not None
            ]
            if gps_points:
                center = calculate_center_point(gps_points)
                event.gps_lat = Decimal(str(center[0]))
                event.gps_lon = Decimal(str(center[1]))
            elif event.gps_lat is None or event.gps_lon is None:
                event.gps_lat = None
                event.gps_lon = None

            for index, photo in enumerate(photos):
                photo.photo_index = index
                photo.status = "clustered"
        else:
            event.start_time = None
            event.end_time = None
            event.cover_photo_id = None
            event.cover_photo_url = None
            event.gps_lat = None
            event.gps_lon = None
            event.story_freshness = "stale"
            event.slideshow_freshness = "stale"
            event.status = "waiting_for_vision"
            event.ai_error = None

        if photos:
            event.status = self.resolve_event_runtime_status(
                event=event,
                vision_summary=vision_summary,
            )
            self.repair_generated_event_state(event)
            if event.status == "waiting_for_vision":
                event.ai_error = None

        db.commit()
        db.refresh(event)
        return event

    def delete_empty_event(self, event_id: str, user_id: str, db: Session) -> bool:
        event = self.get_event_detail(event_id=event_id, user_id=user_id, db=db)
        if not event:
            return False

        remaining_photos = db.scalar(
            select(func.count())
            .select_from(Photo)
            .where(and_(Photo.user_id == user_id, Photo.event_id == event_id))
        )
        if int(remaining_photos or 0) > 0:
            return False

        db.delete(event)
        db.commit()
        return True

    def update_event(
        self,
        event_id: str,
        user_id: str,
        db: Session,
        **fields,
    ) -> Optional[Event]:
        event = self.get_event_detail(event_id=event_id, user_id=user_id, db=db)
        if not event:
            return None

        for key, value in fields.items():
            if hasattr(event, key):
                setattr(event, key, value)

        db.commit()
        db.refresh(event)
        return event

    def delete_event(self, event_id: str, user_id: str, db: Session) -> bool:
        event = self.get_event_detail(event_id=event_id, user_id=user_id, db=db)
        if not event:
            return False

        photos = db.scalars(
            select(Photo).where(
                and_(Photo.user_id == user_id, Photo.event_id == event_id)
            )
        ).all()
        for photo in photos:
            photo.event_id = None
            if photo.status == "clustered":
                photo.status = "uploaded"

        db.delete(event)
        db.commit()
        return True

    def get_event_stats(self, user_id: str, db: Session) -> dict:
        base = select(Event).where(Event.user_id == user_id)
        total = db.scalar(select(func.count()).select_from(base.subquery())) or 0

        by_emotion: dict[str, int] = {
            "Joyful": 0,
            "Exciting": 0,
            "Adventurous": 0,
            "Epic": 0,
            "Romantic": 0,
            "Peaceful": 0,
            "Nostalgic": 0,
            "Thoughtful": 0,
            "Melancholic": 0,
            "Solitary": 0,
        }
        for emotion, count in db.execute(
            select(Event.emotion_tag, func.count())
            .where(Event.user_id == user_id, Event.emotion_tag.isnot(None))
            .group_by(Event.emotion_tag)
        ).all():
            if emotion in by_emotion:
                by_emotion[emotion] = int(count)

        by_status = defaultdict(int)
        for status, count in db.execute(
            select(Event.status, func.count())
            .where(Event.user_id == user_id)
            .group_by(Event.status)
        ).all():
            by_status[str(status)] = int(count)

        return {
            "total": int(total),
            "byEmotion": by_emotion,
            "clustered": int(by_status.get("clustered", 0) + by_status.get("waiting_for_vision", 0)),
            "aiPending": int(by_status.get("ai_pending", 0)),
            "aiProcessing": int(by_status.get("ai_processing", 0)),
            "generated": int(by_status.get("generated", 0)),
            "aiFailed": int(by_status.get("ai_failed", 0)),
        }


event_service = EventService()
