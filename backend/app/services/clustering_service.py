from __future__ import annotations

import math
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional, Union

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.photo import Photo
from app.utils.geo import calculate_center_point, haversine_distance


def _as_float(value: Optional[Union[Decimal, float]]) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


@dataclass(frozen=True)
class ClusteringConfig:
    time_threshold_hours: int = 48
    distance_threshold_km: int = 50
    min_photos_per_event: int = 5
    eps: float = 1.0

    @classmethod
    def from_env(cls) -> "ClusteringConfig":
        def _get_int(name: str, default: int) -> int:
            raw = os.getenv(name)
            if raw is None or raw.strip() == "":
                return default
            try:
                return int(raw)
            except ValueError:
                return default

        return cls(
            time_threshold_hours=_get_int(
                "CLUSTERING_TIME_THRESHOLD_HOURS", cls.time_threshold_hours
            ),
            distance_threshold_km=_get_int(
                "CLUSTERING_DISTANCE_THRESHOLD_KM", cls.distance_threshold_km
            ),
            min_photos_per_event=_get_int(
                "CLUSTERING_MIN_PHOTOS_PER_EVENT", cls.min_photos_per_event
            ),
        )


@dataclass(frozen=True)
class PhotoData:
    id: str
    user_id: str
    shoot_time: datetime
    gps_lat: Optional[float]
    gps_lon: Optional[float]
    thumbnail_url: Optional[str]


class SpacetimeClustering:
    def __init__(self, config: Optional[ClusteringConfig] = None) -> None:
        self.config = config or ClusteringConfig.from_env()

    def _photo_distance(self, a: PhotoData, b: PhotoData) -> float:
        time_threshold = timedelta(hours=self.config.time_threshold_hours)
        time_diff = abs(a.shoot_time - b.shoot_time)
        time_norm = min(time_diff / time_threshold, 1.0) if time_threshold.total_seconds() else 1.0

        spatial_norm = 0.0
        if (
            a.gps_lat is not None
            and a.gps_lon is not None
            and b.gps_lat is not None
            and b.gps_lon is not None
        ):
            dist_km = haversine_distance(a.gps_lat, a.gps_lon, b.gps_lat, b.gps_lon)
            spatial_norm = min(dist_km / float(self.config.distance_threshold_km), 1.0)

        return math.sqrt(time_norm * time_norm + spatial_norm * spatial_norm)

    def calculate_distance_matrix(self, photos: list[PhotoData]) -> list[list[float]]:
        n = len(photos)
        matrix: list[list[float]] = [[0.0 for _ in range(n)] for _ in range(n)]
        for i in range(n):
            for j in range(i + 1, n):
                d = self._photo_distance(photos[i], photos[j])
                matrix[i][j] = d
                matrix[j][i] = d
        return matrix

    def cluster(self, photos: list[PhotoData]) -> list[list[PhotoData]]:
        if not photos:
            return []

        n = len(photos)
        dist = self.calculate_distance_matrix(photos)
        eps = self.config.eps
        min_samples = self.config.min_photos_per_event

        labels: list[int] = [-1] * n
        visited: list[bool] = [False] * n
        cluster_id = 0

        def neighbors(idx: int) -> list[int]:
            return [j for j in range(n) if dist[idx][j] <= eps]

        for i in range(n):
            if visited[i]:
                continue
            visited[i] = True
            neigh = neighbors(i)
            if len(neigh) < min_samples:
                labels[i] = -1
                continue

            labels[i] = cluster_id
            queue = list(neigh)

            qpos = 0
            while qpos < len(queue):
                j = queue[qpos]
                qpos += 1
                if not visited[j]:
                    visited[j] = True
                    neigh2 = neighbors(j)
                    if len(neigh2) >= min_samples:
                        for k in neigh2:
                            if k not in queue:
                                queue.append(k)
                if labels[j] == -1:
                    labels[j] = cluster_id

            cluster_id += 1

        clusters: dict[int, list[PhotoData]] = {}
        for idx, lbl in enumerate(labels):
            if lbl == -1:
                continue
            clusters.setdefault(lbl, []).append(photos[idx])

        # Deterministic ordering
        return [sorted(items, key=lambda p: p.shoot_time) for _, items in sorted(clusters.items())]

    def create_events_from_clusters(
        self, user_id: str, clusters: list[list[PhotoData]], db: Session
    ) -> list[Event]:
        created: list[Event] = []

        for cluster_photos in clusters:
            if len(cluster_photos) < self.config.min_photos_per_event:
                continue

            sorted_photos = sorted(cluster_photos, key=lambda p: p.shoot_time)
            start_time = sorted_photos[0].shoot_time
            end_time = sorted_photos[-1].shoot_time
            cover_photo = sorted_photos[len(sorted_photos) // 2]

            gps_points = [
                (p.gps_lat, p.gps_lon)
                for p in sorted_photos
                if p.gps_lat is not None and p.gps_lon is not None
            ]
            center = (
                calculate_center_point([(lat, lon) for lat, lon in gps_points])
                if gps_points
                else None
            )

            event = Event(
                user_id=user_id,
                title="",
                start_time=start_time,
                end_time=end_time,
                photo_count=len(sorted_photos),
                cover_photo_id=cover_photo.id,
                cover_photo_url=cover_photo.thumbnail_url,
                status="clustered",
            )
            if center:
                event.gps_lat = Decimal(str(center[0]))
                event.gps_lon = Decimal(str(center[1]))

            db.add(event)
            db.flush()  # get event.id

            # Update photo associations
            photo_ids = [p.id for p in sorted_photos]
            for photo in db.scalars(
                select(Photo).where(and_(Photo.user_id == user_id, Photo.id.in_(photo_ids)))
            ).all():
                photo.event_id = event.id
                photo.status = "clustered"

            created.append(event)

        db.commit()
        for e in created:
            db.refresh(e)
            # SQLite in tests drops tzinfo; normalize to UTC so callers
            # consistently see timezone-aware datetimes.
            if e.start_time is not None and e.start_time.tzinfo is None:
                e.start_time = e.start_time.replace(tzinfo=timezone.utc)
            if e.end_time is not None and e.end_time.tzinfo is None:
                e.end_time = e.end_time.replace(tzinfo=timezone.utc)
        return created


def cluster_user_photos(
    user_id: str, db: Session, config: Optional[ClusteringConfig] = None
) -> list[Event]:
    clustering = SpacetimeClustering(config)

    photos = db.scalars(
        select(Photo).where(
            and_(
                Photo.user_id == user_id,
                Photo.event_id.is_(None),
                Photo.status == "uploaded",
            )
        )
    ).all()

    if not photos:
        return []

    photo_data: list[PhotoData] = []
    for p in photos:
        shoot_time = p.shoot_time or p.created_at or datetime.now(tz=timezone.utc)
        if shoot_time.tzinfo is None:
            shoot_time = shoot_time.replace(tzinfo=timezone.utc)
        photo_data.append(
            PhotoData(
                id=p.id,
                user_id=p.user_id,
                shoot_time=shoot_time,
                gps_lat=_as_float(p.gps_lat),
                gps_lon=_as_float(p.gps_lon),
                thumbnail_url=p.thumbnail_url,
            )
        )

    clusters = clustering.cluster(photo_data)
    return clustering.create_events_from_clusters(user_id=user_id, clusters=clusters, db=db)


def recluster_event(event_id: str, user_id: str, db: Session) -> list[Event]:
    event = db.scalar(select(Event).where(and_(Event.id == event_id, Event.user_id == user_id)))
    if not event:
        return []

    # Release existing associations
    photos = db.scalars(
        select(Photo).where(and_(Photo.user_id == user_id, Photo.event_id == event_id))
    ).all()
    for p in photos:
        p.event_id = None
        p.status = "uploaded"

    db.delete(event)
    db.commit()

    # Re-run clustering on all unclustered photos.
    return cluster_user_photos(user_id=user_id, db=db)
