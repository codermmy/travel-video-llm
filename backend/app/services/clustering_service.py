from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional, Union

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.photo import Photo
from app.utils.geo import calculate_center_point, haversine_distance

logger = logging.getLogger(__name__)


def _as_float(value: Optional[Union[Decimal, float]]) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def _normalize_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _is_timestamp_valid(value: datetime) -> bool:
    """检查时间戳是否有效。

    无效情况：
    - 时间 < 2000-01-01（相机未设置时间）
    - 时间 > 当前时间 + 1 天（未来时间）
    """
    if value.year < 2000:
        return False
    # 允许未来 1 天内的时间（考虑时区差异）
    # 如果输入是 naive datetime，先转换为 UTC
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    max_valid_time = datetime.now(tz=timezone.utc) + timedelta(days=1)
    if value > max_valid_time:
        return False
    return True


def _has_valid_gps(lat: Optional[float], lon: Optional[float]) -> bool:
    if lat is None or lon is None:
        return False

    if math.isclose(lat, 0.0, abs_tol=1e-9) and math.isclose(lon, 0.0, abs_tol=1e-9):
        return False

    return -90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0


def _photo_has_valid_gps(photo: "PhotoData") -> bool:
    return _has_valid_gps(photo.gps_lat, photo.gps_lon)


@dataclass(frozen=True)
class ClusteringConfig:
    """聚类配置类（简化版，移除 ML 相关参数）。"""

    time_threshold_hours: int = 48
    distance_threshold_km: float = 50.0  # 保留用于兼容，实际使用 city_jump_threshold_km
    min_photos_per_event: int = 2
    merge_short_interval_min: int = 180
    city_jump_threshold_km: float = 50.0

    @classmethod
    def from_env(cls) -> "ClusteringConfig":
        def _get_int(name: str, default: int) -> int:
            import os
            raw = os.getenv(name)
            if raw is None or raw.strip() == "":
                return default
            try:
                return int(raw)
            except ValueError:
                return default

        def _get_float(name: str, default: float) -> float:
            import os
            raw = os.getenv(name)
            if raw is None or raw.strip() == "":
                return default
            try:
                return float(raw)
            except ValueError:
                return default

        return cls(
            time_threshold_hours=_get_int(
                "CLUSTERING_TIME_THRESHOLD_HOURS", cls.time_threshold_hours
            ),
            distance_threshold_km=_get_float(
                "CLUSTERING_DISTANCE_THRESHOLD_KM", cls.distance_threshold_km
            ),
            min_photos_per_event=_get_int(
                "CLUSTERING_MIN_PHOTOS_PER_EVENT", cls.min_photos_per_event
            ),
            merge_short_interval_min=_get_int(
                "CLUSTERING_MERGE_SHORT_INTERVAL", cls.merge_short_interval_min
            ),
            city_jump_threshold_km=_get_float(
                "CLUSTERING_CITY_JUMP_THRESHOLD", cls.city_jump_threshold_km
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


class RuleBasedClustering:
    """纯规则聚类：扫描分割点，无 ML 算法。"""

    def __init__(self, config: ClusteringConfig) -> None:
        self.config = config

    def cluster(self, photos: list[PhotoData]) -> list[list[PhotoData]]:
        """纯规则聚类：扫描分割点。

        规则：
        1. 时间间隙 > threshold → 分割
        2. GPS 距离 > threshold → 分割（城市跳跃）
        3. 跨天活动保护（23:00→02:00）
        """
        if not photos:
            return []

        # 1. 按时间排序
        ordered = sorted(photos, key=lambda p: p.shoot_time)

        # 2. 扫描分割点
        clusters: list[list[PhotoData]] = []
        current: list[PhotoData] = [ordered[0]]

        time_threshold = timedelta(hours=self.config.time_threshold_hours)
        distance_threshold = self.config.city_jump_threshold_km

        for photo in ordered[1:]:
            prev = current[-1]

            # 时间间隙检查
            time_gap = photo.shoot_time - prev.shoot_time

            # GPS 距离检查
            spatial_jump = False
            if _photo_has_valid_gps(prev) and _photo_has_valid_gps(photo):
                distance = haversine_distance(
                    prev.gps_lat, prev.gps_lon, photo.gps_lat, photo.gps_lon
                )
                # 跨城市大跳跃 (>200km) 直接分割
                if distance > 200:
                    spatial_jump = True
                # 城市跳跃阈值（需要同时满足时间间隙 >= 60 分钟）
                elif distance > distance_threshold and time_gap >= timedelta(minutes=60):
                    spatial_jump = True

            # 决策：分割或继续
            if time_gap > time_threshold or spatial_jump:
                clusters.append(current)
                current = [photo]
            else:
                current.append(photo)

        clusters.append(current)
        return clusters


class TemporalRules:
    """时间规则后处理类（保留原有逻辑）。"""

    @staticmethod
    def merge_short_intervals(
        events: list[list[PhotoData]],
        min_interval: timedelta,
    ) -> list[list[PhotoData]]:
        if len(events) < 2:
            return events

        ordered = sorted(events, key=lambda photos: photos[0].shoot_time)
        merged: list[list[PhotoData]] = []

        for current in ordered:
            if not merged:
                merged.append(list(current))
                continue

            previous = merged[-1]
            gap = current[0].shoot_time - previous[-1].shoot_time
            if gap < min_interval:
                merged[-1] = sorted(previous + current, key=lambda photo: photo.shoot_time)
            else:
                merged.append(list(current))

        return merged

    @staticmethod
    def split_large_internal_gaps(
        events: list[list[PhotoData]],
        *,
        max_time_gap: timedelta,
        jump_threshold_km: float,
        min_time_gap_for_jump: timedelta,
    ) -> list[list[PhotoData]]:
        if not events:
            return events

        def _safe_percentile(values: list[float], percentile: float, default: float) -> float:
            if not values:
                return default
            try:
                import numpy as np
                result = float(np.percentile(values, percentile))
            except Exception:
                return default
            if math.isnan(result) or math.isinf(result):
                return default
            return result

        segmented: list[list[PhotoData]] = []
        for event in events:
            if len(event) <= 1:
                segmented.append(event)
                continue

            ordered = sorted(event, key=lambda photo: photo.shoot_time)
            event_span = ordered[-1].shoot_time - ordered[0].shoot_time

            adaptive_gap: Optional[timedelta] = None
            if len(ordered) >= 80 or event_span >= timedelta(days=10):
                gaps = [
                    max(
                        (ordered[idx].shoot_time - ordered[idx - 1].shoot_time).total_seconds(), 0.0
                    )
                    for idx in range(1, len(ordered))
                ]
                adaptive_seconds = _safe_percentile(
                    gaps,
                    percentile=90,
                    default=max_time_gap.total_seconds(),
                )
                adaptive_seconds = max(12 * 3600, min(adaptive_seconds, 36 * 3600))
                adaptive_gap = timedelta(seconds=adaptive_seconds)

            current: list[PhotoData] = [ordered[0]]

            for photo in ordered[1:]:
                previous = current[-1]
                time_gap = photo.shoot_time - previous.shoot_time

                should_split = time_gap > max_time_gap
                if not should_split and adaptive_gap is not None and time_gap >= adaptive_gap:
                    should_split = True

                if not should_split:
                    can_measure_jump = _photo_has_valid_gps(previous) and _photo_has_valid_gps(
                        photo
                    )
                    if can_measure_jump:
                        distance = haversine_distance(
                            previous.gps_lat,
                            previous.gps_lon,
                            photo.gps_lat,
                            photo.gps_lon,
                        )
                        if distance > jump_threshold_km and time_gap >= min_time_gap_for_jump:
                            should_split = True

                if should_split:
                    segmented.append(current)
                    current = [photo]
                else:
                    current.append(photo)

            segmented.append(current)

        return segmented

    @staticmethod
    def _find_split_index_for_max_span(
        ordered_event: list[PhotoData],
        *,
        max_span: timedelta,
        min_split_gap: timedelta,
    ) -> Optional[int]:
        if len(ordered_event) <= 1:
            return None

        target_time = ordered_event[0].shoot_time + max_span
        if ordered_event[-1].shoot_time <= target_time:
            return None

        fallback_index: Optional[int] = None
        best_index: Optional[int] = None
        best_score = -1.0

        for idx in range(1, len(ordered_event)):
            previous = ordered_event[idx - 1]
            current = ordered_event[idx]
            if fallback_index is None and current.shoot_time >= target_time:
                fallback_index = idx

            gap = current.shoot_time - previous.shoot_time
            if gap < min_split_gap:
                continue

            distance_to_target = abs((current.shoot_time - target_time).total_seconds())
            closeness = 1.0 / (1.0 + (distance_to_target / 3600.0))
            score = (gap.total_seconds() / 3600.0) * closeness
            if score > best_score:
                best_score = score
                best_index = idx

        return best_index or fallback_index

    @staticmethod
    def split_oversized_events(
        events: list[list[PhotoData]],
        *,
        default_max_span: timedelta = timedelta(days=14),
        aggressive_max_span: timedelta = timedelta(days=7),
        aggressive_span_threshold: timedelta = timedelta(days=45),
        aggressive_photo_threshold: int = 120,
        min_split_gap: timedelta = timedelta(hours=1),
    ) -> list[list[PhotoData]]:
        if not events:
            return events

        normalized: list[list[PhotoData]] = []
        ordered_events = sorted(events, key=lambda photos: photos[0].shoot_time)

        for event in ordered_events:
            ordered_event = sorted(event, key=lambda photo: photo.shoot_time)
            if len(ordered_event) <= 1:
                normalized.append(ordered_event)
                continue

            event_span = ordered_event[-1].shoot_time - ordered_event[0].shoot_time
            max_span = default_max_span
            if (
                len(ordered_event) >= aggressive_photo_threshold
                or event_span >= aggressive_span_threshold
            ):
                max_span = aggressive_max_span

            pending = [ordered_event]
            while pending:
                current = pending.pop(0)
                if len(current) <= 1:
                    normalized.append(current)
                    continue

                current_span = current[-1].shoot_time - current[0].shoot_time
                if current_span <= max_span:
                    normalized.append(current)
                    continue

                split_index = TemporalRules._find_split_index_for_max_span(
                    current,
                    max_span=max_span,
                    min_split_gap=min_split_gap,
                )
                if split_index is None or split_index <= 0 or split_index >= len(current):
                    normalized.append(current)
                    continue

                pending.insert(0, current[split_index:])
                pending.insert(0, current[:split_index])

        normalized.sort(key=lambda photos: photos[0].shoot_time)
        return normalized

    @staticmethod
    def _can_merge_adjacent_events(
        left_event: list[PhotoData],
        right_event: list[PhotoData],
        *,
        max_merge_gap: timedelta,
        jump_threshold_km: float,
    ) -> bool:
        if not left_event or not right_event:
            return False

        left = sorted(left_event, key=lambda photo: photo.shoot_time)
        right = sorted(right_event, key=lambda photo: photo.shoot_time)
        gap = right[0].shoot_time - left[-1].shoot_time
        if gap > max_merge_gap:
            return False

        if _photo_has_valid_gps(left[-1]) and _photo_has_valid_gps(right[0]):
            distance = haversine_distance(
                left[-1].gps_lat,
                left[-1].gps_lon,
                right[0].gps_lat,
                right[0].gps_lon,
            )
            if distance > jump_threshold_km:
                return False

        return True

    @staticmethod
    def merge_tiny_events(
        events: list[list[PhotoData]],
        *,
        min_photos_per_event: int,
        max_merge_gap: timedelta,
        jump_threshold_km: float,
    ) -> list[list[PhotoData]]:
        if len(events) < 2 or min_photos_per_event <= 1:
            return events

        ordered = [sorted(event, key=lambda photo: photo.shoot_time) for event in events]
        ordered.sort(key=lambda photos: photos[0].shoot_time)

        merged: list[list[PhotoData]] = []
        for current in ordered:
            if not merged:
                merged.append(list(current))
                continue

            previous = merged[-1]
            if len(current) < min_photos_per_event and TemporalRules._can_merge_adjacent_events(
                previous,
                current,
                max_merge_gap=max_merge_gap,
                jump_threshold_km=jump_threshold_km,
            ):
                previous.extend(current)
                previous.sort(key=lambda photo: photo.shoot_time)
            else:
                merged.append(list(current))

        stabilized: list[list[PhotoData]] = []
        for current in reversed(merged):
            if not stabilized:
                stabilized.append(current)
                continue

            next_event = stabilized[-1]
            if len(current) < min_photos_per_event and TemporalRules._can_merge_adjacent_events(
                current,
                next_event,
                max_merge_gap=max_merge_gap,
                jump_threshold_km=jump_threshold_km,
            ):
                combined = sorted(current + next_event, key=lambda photo: photo.shoot_time)
                stabilized[-1] = combined
            else:
                stabilized.append(current)

        result = list(reversed(stabilized))
        result.sort(key=lambda photos: photos[0].shoot_time)
        return result

    @staticmethod
    def split_city_transitions(
        events: list[list[PhotoData]],
        jump_threshold_km: float,
        no_gps_merge_max_gap: timedelta = timedelta(minutes=30),
        merge_max_gap: timedelta = timedelta(hours=48),
    ) -> list[list[PhotoData]]:
        if len(events) < 2:
            return events

        ordered = sorted(events, key=lambda photos: photos[0].shoot_time)
        result: list[list[PhotoData]] = [list(ordered[0])]

        for current in ordered[1:]:
            previous = result[-1]
            left = previous[-1]
            right = current[0]

            time_gap = right.shoot_time - left.shoot_time
            can_measure = _photo_has_valid_gps(left) and _photo_has_valid_gps(right)

            if time_gap > merge_max_gap:
                result.append(list(current))
                continue

            if not can_measure:
                if time_gap <= no_gps_merge_max_gap:
                    previous.extend(current)
                    previous.sort(key=lambda photo: photo.shoot_time)
                else:
                    result.append(list(current))
                continue

            distance = haversine_distance(
                left.gps_lat,
                left.gps_lon,
                right.gps_lat,
                right.gps_lon,
            )

            # 对于 > 200km 的跳跃直接拆分（不管时间间隔）
            # 这是为了处理跨城市/跨国旅行的场景，避免将不相关的事件合并
            if distance > 200:
                result.append(list(current))
                continue

            if distance > jump_threshold_km:
                result.append(list(current))
            else:
                previous.extend(current)
                previous.sort(key=lambda photo: photo.shoot_time)

        return result

    @staticmethod
    def filter_night_singletons(events: list[list[PhotoData]]) -> list[list[PhotoData]]:
        """过滤夜间单张照片（22:00-06:00），这些通常是误触或噪声。

        规则：
        - 多张照片的事件：保留
        - 白天单张照片：保留
        - 夜间单张照片：过滤掉（可能是误触）
        """
        if not events:
            return events

        normalized: list[list[PhotoData]] = []
        for event in events:
            # 多张照片的事件直接保留
            if len(event) != 1:
                normalized.append(event)
                continue

            # 单张照片检查时间
            hour = event[0].shoot_time.hour
            # 夜间（22:00-06:00）的单张照片过滤掉
            if 22 <= hour or hour <= 6:
                continue  # 过滤掉，不加入结果
            # 白天单张照片保留
            normalized.append(event)

        return normalized


class SpacetimeClustering:
    """时空聚类主类（简化版，使用纯规则聚类）。"""

    def __init__(self, config: Optional[ClusteringConfig] = None) -> None:
        self.config = config or ClusteringConfig.from_env()
        self._rule_clusterer = RuleBasedClustering(self.config)
        self._last_noise_photo_ids: set[str] = set()

    def cluster(self, photos: list[PhotoData]) -> list[list[PhotoData]]:
        """执行聚类流程。

        流程：
        1. 规则聚类（扫描分割点）
        2. 后处理规则（合并、拆分、过滤）
        """
        if not photos:
            self._last_noise_photo_ids = set()
            return []

        # 1. 纯规则聚类
        clusters = self._rule_clusterer.cluster(photos)

        # 2. 后处理规则
        min_interval = timedelta(minutes=self.config.merge_short_interval_min)
        max_time_gap = timedelta(hours=max(self.config.time_threshold_hours, 1))
        max_tiny_merge_gap = max(min_interval * 2, timedelta(hours=2))

        clusters = TemporalRules.merge_short_intervals(
            clusters,
            min_interval=min_interval,
        )
        clusters = TemporalRules.split_large_internal_gaps(
            clusters,
            max_time_gap=max_time_gap,
            jump_threshold_km=self.config.city_jump_threshold_km,
            min_time_gap_for_jump=min_interval,
        )
        clusters = TemporalRules.split_oversized_events(clusters)
        clusters = TemporalRules.split_city_transitions(
            clusters,
            jump_threshold_km=self.config.city_jump_threshold_km,
            no_gps_merge_max_gap=min_interval,
            merge_max_gap=max_time_gap,
        )
        clusters = TemporalRules.merge_tiny_events(
            clusters,
            min_photos_per_event=self.config.min_photos_per_event,
            max_merge_gap=max_tiny_merge_gap,
            jump_threshold_km=self.config.city_jump_threshold_km,
        )
        clusters = TemporalRules.filter_night_singletons(clusters)

        # 记录噪声照片（未聚类的）
        clustered_photo_ids = {photo.id for cluster in clusters for photo in cluster}
        self._last_noise_photo_ids = {
            photo.id for photo in photos if photo.id not in clustered_photo_ids
        }

        return clusters

    def create_events_from_clusters(
        self,
        user_id: str,
        clusters: list[list[PhotoData]],
        db: Session,
        *,
        noise_photo_ids: Optional[set[str]] = None,
    ) -> list[Event]:
        """从聚类结果创建 Event 模型。"""
        created: list[Event] = []
        unresolved_noise_ids = set(noise_photo_ids or set())

        for cluster_photos in clusters:
            if len(cluster_photos) < self.config.min_photos_per_event:
                unresolved_noise_ids.update(photo.id for photo in cluster_photos)
                continue

            sorted_photos = sorted(cluster_photos, key=lambda p: p.shoot_time)
            start_time = sorted_photos[0].shoot_time
            end_time = sorted_photos[-1].shoot_time
            cover_photo = sorted_photos[len(sorted_photos) // 2]

            gps_points = [(p.gps_lat, p.gps_lon) for p in sorted_photos if _photo_has_valid_gps(p)]
            center = (
                calculate_center_point([(float(lat), float(lon)) for lat, lon in gps_points])
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
            if center is not None:
                event.gps_lat = Decimal(str(center[0]))
                event.gps_lon = Decimal(str(center[1]))

            db.add(event)
            db.flush()

            photo_ids = [p.id for p in sorted_photos]
            for photo in db.scalars(
                select(Photo).where(and_(Photo.user_id == user_id, Photo.id.in_(photo_ids)))
            ).all():
                photo.event_id = event.id
                photo.status = "clustered"
                if photo.id in unresolved_noise_ids:
                    unresolved_noise_ids.remove(photo.id)

            created.append(event)

        if unresolved_noise_ids:
            for photo in db.scalars(
                select(Photo).where(
                    and_(
                        Photo.user_id == user_id,
                        Photo.id.in_(list(unresolved_noise_ids)),
                        Photo.event_id.is_(None),
                    )
                )
            ).all():
                photo.status = "noise"

        db.commit()

        for event in created:
            db.refresh(event)
            if event.start_time is not None:
                event.start_time = _normalize_datetime(event.start_time)
            if event.end_time is not None:
                event.end_time = _normalize_datetime(event.end_time)

        return created


def cluster_user_photos(
    user_id: str,
    db: Session,
    config: Optional[ClusteringConfig] = None,
) -> list[Event]:
    """聚类用户照片的主入口函数。"""
    clustering = SpacetimeClustering(config)

    photos = db.scalars(
        select(Photo)
        .where(
            and_(
                Photo.user_id == user_id,
                Photo.event_id.is_(None),
                Photo.status.in_(["uploaded", "noise"]),
            )
        )
        .order_by(Photo.shoot_time.asc().nullslast(), Photo.created_at.asc())
    ).all()

    if not photos:
        return []

    # 分离正常照片和时间戳异常照片
    photo_data: list[PhotoData] = []
    invalid_timestamp_photo_ids: set[str] = set()

    for photo in photos:
        shoot_time = photo.shoot_time or photo.created_at or datetime.now(tz=timezone.utc)

        # 检查时间戳是否有效
        if not _is_timestamp_valid(shoot_time):
            # 时间戳异常的照片单独标记，不参与聚类
            invalid_timestamp_photo_ids.add(photo.id)
            logger.warning(
                "Photo %s has invalid timestamp: %s, will be marked as noise",
                photo.id,
                shoot_time,
            )
            continue

        shoot_time = _normalize_datetime(shoot_time)
        photo_data.append(
            PhotoData(
                id=photo.id,
                user_id=photo.user_id,
                shoot_time=shoot_time,
                gps_lat=_as_float(photo.gps_lat),
                gps_lon=_as_float(photo.gps_lon),
                thumbnail_url=photo.thumbnail_url,
            )
        )

    clusters = clustering.cluster(photo_data)
    events = clustering.create_events_from_clusters(
        user_id=user_id,
        clusters=clusters,
        db=db,
        noise_photo_ids=clustering._last_noise_photo_ids,
    )

    # 标记时间戳异常的照片为 noise
    if invalid_timestamp_photo_ids:
        for photo in db.scalars(
            select(Photo).where(
                and_(
                    Photo.user_id == user_id,
                    Photo.id.in_(list(invalid_timestamp_photo_ids)),
                    Photo.event_id.is_(None),
                )
            )
        ).all():
            photo.status = "noise"
        db.commit()

    return events


def recluster_event(event_id: str, user_id: str, db: Session) -> list[Event]:
    """重聚类单个事件。"""
    event = db.scalar(select(Event).where(and_(Event.id == event_id, Event.user_id == user_id)))
    if not event:
        return []

    photos = db.scalars(
        select(Photo).where(and_(Photo.user_id == user_id, Photo.event_id == event_id))
    ).all()
    for photo in photos:
        photo.event_id = None
        photo.status = "uploaded"

    db.delete(event)
    db.commit()

    return cluster_user_photos(user_id=user_id, db=db)