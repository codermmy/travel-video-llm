from __future__ import annotations

from collections import defaultdict
from typing import Optional

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.photo import Photo


class EventService:
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

    def get_event_detail(self, event_id: str, user_id: str, db: Session) -> Optional[Event]:
        return db.scalar(select(Event).where(and_(Event.id == event_id, Event.user_id == user_id)))

    def get_event_photos(self, event_id: str, user_id: str, db: Session) -> list[Photo]:
        return list(
            db.scalars(
                select(Photo)
                .where(and_(Photo.user_id == user_id, Photo.event_id == event_id))
                .order_by(Photo.shoot_time.asc().nullslast(), Photo.created_at.asc())
            ).all()
        )

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
            if value is not None and hasattr(event, key):
                setattr(event, key, value)

        db.commit()
        db.refresh(event)
        return event

    def delete_event(self, event_id: str, user_id: str, db: Session) -> bool:
        event = self.get_event_detail(event_id=event_id, user_id=user_id, db=db)
        if not event:
            return False

        photos = db.scalars(
            select(Photo).where(and_(Photo.user_id == user_id, Photo.event_id == event_id))
        ).all()
        for p in photos:
            p.event_id = None
            if p.status == "clustered":
                p.status = "uploaded"

        db.delete(event)
        db.commit()
        return True

    def get_event_stats(self, user_id: str, db: Session) -> dict:
        base = select(Event).where(Event.user_id == user_id)
        total = db.scalar(select(func.count()).select_from(base.subquery())) or 0

        by_emotion: dict[str, int] = {"Happy": 0, "Calm": 0, "Epic": 0, "Romantic": 0}
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
            "clustered": int(by_status.get("clustered", 0)),
            "aiPending": int(by_status.get("ai_pending", 0)),
            "aiProcessing": int(by_status.get("ai_processing", 0)),
            "generated": int(by_status.get("generated", 0)),
            "aiFailed": int(by_status.get("ai_failed", 0)),
        }


event_service = EventService()
