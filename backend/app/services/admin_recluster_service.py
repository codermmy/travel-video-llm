from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.photo import Photo
from app.models.user import User
from app.services.clustering_service import ClusteringConfig, cluster_user_photos
from app.services.geocoding_service import geocoding_service


@dataclass(frozen=True)
class UserReclusterResult:
    user_id: str
    total_photos: int
    previous_events: int
    reset_photos: int
    created_events: int
    noise_photos: int
    uploaded_photos: int
    geocoded_events: int


@dataclass(frozen=True)
class ReclusterRunResult:
    started_at: datetime
    finished_at: datetime
    user_count: int
    total_created_events: int
    total_previous_events: int
    total_reset_photos: int
    total_noise_photos: int
    results: list[UserReclusterResult]


def list_recluster_target_user_ids(
    db: Session,
    *,
    user_id: Optional[str] = None,
    all_users: bool = False,
    limit_users: Optional[int] = None,
) -> list[str]:
    if user_id:
        return [user_id]

    if not all_users:
        return []

    query = select(User.id).order_by(User.created_at.asc())
    if limit_users is not None:
        query = query.limit(limit_users)

    return [value for value in db.scalars(query).all() if value]


def _reset_user_clustering_state(db: Session, user_id: str) -> tuple[int, int, int]:
    events = db.scalars(select(Event).where(Event.user_id == user_id)).all()
    previous_events = len(events)

    photos = db.scalars(select(Photo).where(Photo.user_id == user_id)).all()
    total_photos = len(photos)

    reset_photos = 0
    for photo in photos:
        changed = photo.event_id is not None or photo.status != "uploaded"
        if changed:
            reset_photos += 1
        photo.event_id = None
        photo.status = "uploaded"

    for event in events:
        db.delete(event)

    db.commit()
    return previous_events, total_photos, reset_photos


def recluster_user(
    db: Session,
    *,
    user_id: str,
    config: Optional[ClusteringConfig] = None,
    run_geocoding: bool = False,
) -> UserReclusterResult:
    previous_events, total_photos, reset_photos = _reset_user_clustering_state(
        db=db, user_id=user_id
    )

    created_events = cluster_user_photos(user_id=user_id, db=db, config=config)

    geocoded_events = 0
    if run_geocoding:
        geocoded_events = geocoding_service.update_event_locations(user_id=user_id, db=db)

    noise_photos = int(
        db.scalar(
            select(func.count()).where(
                Photo.user_id == user_id,
                Photo.event_id.is_(None),
                Photo.status == "noise",
            )
        )
        or 0
    )
    uploaded_photos = int(
        db.scalar(
            select(func.count()).where(
                Photo.user_id == user_id,
                Photo.event_id.is_(None),
                Photo.status == "uploaded",
            )
        )
        or 0
    )

    return UserReclusterResult(
        user_id=user_id,
        total_photos=total_photos,
        previous_events=previous_events,
        reset_photos=reset_photos,
        created_events=len(created_events),
        noise_photos=noise_photos,
        uploaded_photos=uploaded_photos,
        geocoded_events=geocoded_events,
    )


def recluster_users(
    db: Session,
    *,
    target_user_ids: list[str],
    config: Optional[ClusteringConfig] = None,
    run_geocoding: bool = False,
) -> ReclusterRunResult:
    started_at = datetime.now(tz=timezone.utc)

    results: list[UserReclusterResult] = []
    for user_id in target_user_ids:
        result = recluster_user(
            db,
            user_id=user_id,
            config=config,
            run_geocoding=run_geocoding,
        )
        results.append(result)

    finished_at = datetime.now(tz=timezone.utc)

    return ReclusterRunResult(
        started_at=started_at,
        finished_at=finished_at,
        user_count=len(results),
        total_created_events=sum(item.created_events for item in results),
        total_previous_events=sum(item.previous_events for item in results),
        total_reset_photos=sum(item.reset_photos for item in results),
        total_noise_photos=sum(item.noise_photos for item in results),
        results=results,
    )
