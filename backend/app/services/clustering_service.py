from __future__ import annotations

import logging
import math
import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Optional, Union

import numpy as np
from sklearn.cluster import DBSCAN
from sklearn.feature_extraction.text import HashingVectorizer
from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from app.models.event import Event
from app.models.photo import Photo
from app.services.ai_service import ai_service
from app.services.storage_service import storage_service
from app.utils.geo import calculate_center_point, haversine_distance

logger = logging.getLogger(__name__)

try:
    from hdbscan import HDBSCAN
except Exception:  # pragma: no cover - optional dependency
    HDBSCAN = None  # type: ignore[assignment]

try:
    from sentence_transformers import SentenceTransformer
except Exception:  # pragma: no cover - optional dependency
    SentenceTransformer = None  # type: ignore[assignment]


def _as_float(value: Optional[Union[Decimal, float]]) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def _safe_percentile(values: list[float], percentile: float, default: float) -> float:
    if not values:
        return default
    try:
        result = float(np.percentile(values, percentile))
    except Exception:
        return default
    if math.isnan(result) or math.isinf(result):
        return default
    return result


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


def _to_vector(text: str, vectorizer: HashingVectorizer) -> np.ndarray:
    matrix = vectorizer.transform([text])
    vector = matrix.toarray()[0]
    norm = float(np.linalg.norm(vector))
    if norm == 0.0:
        return vector
    return vector / norm


@dataclass(frozen=True)
class ClusteringConfig:
    # Legacy defaults retained as fallback boundaries.
    time_threshold_hours: int = 48
    distance_threshold_km: float = 50.0
    min_photos_per_event: int = 2  # P0: 从 3 降低到 2，允许更小的旅行事件

    enable_semantic_clustering: bool = True
    enable_temporal_rules: bool = True
    semantic_similarity_threshold: float = 0.65  # P0: 从 0.80 降低到 0.65，提高语义聚类召回率
    merge_short_interval_min: int = 180  # P0: 从 60 增加到 180 分钟 (3 小时)，容忍更长的短间隔合并
    city_jump_threshold_km: float = 50.0  # 降低到 50km，更敏感的城市切换
    hdbscan_min_cluster_size: int = 3  # 降低到 3，适应小事件
    enable_ai_descriptions: bool = False

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

        def _get_float(name: str, default: float) -> float:
            raw = os.getenv(name)
            if raw is None or raw.strip() == "":
                return default
            try:
                return float(raw)
            except ValueError:
                return default

        def _get_bool(name: str, default: bool) -> bool:
            raw = os.getenv(name)
            if raw is None or raw.strip() == "":
                return default
            return raw.strip().lower() in {"1", "true", "yes", "y", "on"}

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
            enable_semantic_clustering=_get_bool(
                "CLUSTERING_ENABLE_SEMANTIC", cls.enable_semantic_clustering
            ),
            enable_temporal_rules=_get_bool(
                "CLUSTERING_ENABLE_TEMPORAL_RULES", cls.enable_temporal_rules
            ),
            semantic_similarity_threshold=_get_float(
                "CLUSTERING_SEMANTIC_THRESHOLD", cls.semantic_similarity_threshold
            ),
            merge_short_interval_min=_get_int(
                "CLUSTERING_MERGE_SHORT_INTERVAL", cls.merge_short_interval_min
            ),
            city_jump_threshold_km=_get_float(
                "CLUSTERING_CITY_JUMP_THRESHOLD", cls.city_jump_threshold_km
            ),
            hdbscan_min_cluster_size=_get_int(
                "CLUSTERING_HDBSCAN_MIN_SIZE", cls.hdbscan_min_cluster_size
            ),
            enable_ai_descriptions=_get_bool(
                "CLUSTERING_ENABLE_AI_DESCRIPTIONS", cls.enable_ai_descriptions
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


class SpacetimeHDBSCAN:
    def __init__(self, config: ClusteringConfig) -> None:
        self.config = config

    def _adaptive_time_threshold(self, photos: list[PhotoData]) -> timedelta:
        if len(photos) < 2:
            return timedelta(hours=self.config.time_threshold_hours)

        sorted_photos = sorted(photos, key=lambda p: p.shoot_time)
        gaps_seconds: list[float] = []

        for idx in range(1, len(sorted_photos)):
            prev = sorted_photos[idx - 1].shoot_time
            curr = sorted_photos[idx].shoot_time
            gap_seconds = max((curr - prev).total_seconds(), 0.0)
            gaps_seconds.append(gap_seconds)

        fallback = timedelta(hours=self.config.time_threshold_hours)
        threshold_seconds = _safe_percentile(
            gaps_seconds,
            percentile=75,
            default=fallback.total_seconds(),
        )

        minimum_seconds = 30 * 60
        maximum_seconds = fallback.total_seconds() * 2
        threshold_seconds = max(minimum_seconds, min(threshold_seconds, maximum_seconds))

        return timedelta(seconds=threshold_seconds)

    def _adaptive_distance_threshold(self, photos: list[PhotoData]) -> float:
        photos_with_gps = [p for p in photos if _photo_has_valid_gps(p)]
        if len(photos_with_gps) < 2:
            return float(self.config.distance_threshold_km)

        ordered = sorted(photos_with_gps, key=lambda p: p.shoot_time)
        distances: list[float] = []

        for idx, left in enumerate(ordered):
            for right in ordered[idx + 1 : idx + 6]:
                distances.append(
                    haversine_distance(
                        left.gps_lat or 0.0,
                        left.gps_lon or 0.0,
                        right.gps_lat or 0.0,
                        right.gps_lon or 0.0,
                    )
                )

        base = float(self.config.distance_threshold_km)
        threshold = _safe_percentile(distances, percentile=80, default=base)

        minimum_km = 0.2
        maximum_km = max(base * 3.0, minimum_km)
        return max(minimum_km, min(threshold, maximum_km))

    def _build_distance_matrix(
        self,
        photos: list[PhotoData],
        *,
        time_threshold: timedelta,
        distance_threshold: float,
    ) -> np.ndarray:
        size = len(photos)
        matrix = np.zeros((size, size), dtype=float)

        time_denominator = max(time_threshold.total_seconds(), 1.0)
        distance_denominator = max(distance_threshold, 0.2)

        for i in range(size):
            for j in range(i + 1, size):
                left = photos[i]
                right = photos[j]

                time_diff_seconds = abs((left.shoot_time - right.shoot_time).total_seconds())

                # P0: 优化小范围 GPS 聚类 - 对于 500m 半径内的照片，放宽时间阈值
                # 这允许在同一景点（如博物馆、公园）内拍摄的照片更容易聚类在一起
                SMALL_RADIUS_KM = 0.5  # 500 米

                spatial_norm = 0.0
                is_small_range = False
                if _photo_has_valid_gps(left) and _photo_has_valid_gps(right):
                    distance_km = haversine_distance(
                        left.gps_lat,
                        left.gps_lon,
                        right.gps_lat,
                        right.gps_lon,
                    )
                    spatial_norm = min(distance_km / distance_denominator, 1.0)
                    is_small_range = distance_km <= SMALL_RADIUS_KM

                # 对于小范围内的照片，放宽时间惩罚（乘以 0.5 系数）
                if is_small_range:
                    time_norm = min((time_diff_seconds * 0.5) / time_denominator, 1.0)
                else:
                    time_norm = min(time_diff_seconds / time_denominator, 1.0)

                combined = math.sqrt((time_norm * time_norm) + (spatial_norm * spatial_norm))
                matrix[i, j] = combined
                matrix[j, i] = combined

        return matrix

    def _derive_fallback_eps(self, distance_matrix: np.ndarray) -> float:
        if distance_matrix.size == 0:
            return 0.9

        upper = distance_matrix[np.triu_indices(distance_matrix.shape[0], k=1)]
        if upper.size == 0:
            return 0.9

        eps = _safe_percentile(upper.tolist(), percentile=70, default=0.9)
        return max(0.35, min(eps, 1.25))

    @staticmethod
    def _label_quality(labels: list[int]) -> tuple[int, int]:
        clustered = sum(1 for label in labels if label >= 0)
        clusters = len({label for label in labels if label >= 0})
        return clustered, clusters

    def _fit_labels(self, distance_matrix: np.ndarray, min_cluster_size: int) -> list[int]:
        eps = self._derive_fallback_eps(distance_matrix)
        min_samples = max(1, min(min_cluster_size, distance_matrix.shape[0]))
        dbscan_labels = (
            DBSCAN(
                eps=eps,
                min_samples=min_samples,
                metric="precomputed",
            )
            .fit_predict(distance_matrix)
            .tolist()
        )

        if HDBSCAN is not None and distance_matrix.shape[0] >= max(2, min_cluster_size):
            try:
                hdbscan_labels = (
                    HDBSCAN(
                        min_cluster_size=min_cluster_size,
                        metric="precomputed",
                        cluster_selection_method="eom",
                        allow_single_cluster=True,
                    )
                    .fit_predict(distance_matrix)
                    .tolist()
                )

                h_clustered, h_clusters = self._label_quality(hdbscan_labels)
                d_clustered, d_clusters = self._label_quality(dbscan_labels)

                if h_clustered > d_clustered:
                    return hdbscan_labels
                if h_clustered == d_clustered and h_clustered > 0 and h_clusters <= d_clusters:
                    return hdbscan_labels

                return dbscan_labels
            except Exception as exc:  # pragma: no cover - dependent on optional package runtime
                logger.warning("HDBSCAN failed, fallback to DBSCAN: %s", exc)

        return dbscan_labels

    def cluster(self, photos: list[PhotoData]) -> tuple[list[list[PhotoData]], set[str]]:
        if not photos:
            return [], set()

        time_threshold = self._adaptive_time_threshold(photos)
        distance_threshold = self._adaptive_distance_threshold(photos)

        matrix = self._build_distance_matrix(
            photos,
            time_threshold=time_threshold,
            distance_threshold=distance_threshold,
        )

        min_cluster_size = max(
            2,
            min(self.config.hdbscan_min_cluster_size, len(photos)),
        )
        labels = self._fit_labels(matrix, min_cluster_size=min_cluster_size)

        clusters: dict[int, list[PhotoData]] = {}
        noise_photo_ids: set[str] = set()

        for idx, label in enumerate(labels):
            if label < 0:
                noise_photo_ids.add(photos[idx].id)
                continue
            clusters.setdefault(label, []).append(photos[idx])

        ordered_clusters = [
            sorted(items, key=lambda item: item.shoot_time)
            for _, items in sorted(clusters.items(), key=lambda item: item[0])
        ]
        ordered_clusters.sort(key=lambda items: items[0].shoot_time)

        return ordered_clusters, noise_photo_ids


class SemanticClustering:
    def __init__(self, config: ClusteringConfig) -> None:
        self.config = config
        self._description_cache: dict[str, str] = {}
        self._hashing_vectorizer = HashingVectorizer(
            n_features=256,
            alternate_sign=False,
            norm="l2",
        )
        self._clip_model: Any = None
        self._clip_model_ready = False

    def _maybe_load_clip_model(self) -> Any:
        if self._clip_model_ready:
            return self._clip_model

        self._clip_model_ready = True
        if SentenceTransformer is None:
            return None

        try:
            self._clip_model = SentenceTransformer(
                "clip-ViT-B-32-multilingual-v1",
                local_files_only=True,
            )
        except Exception:
            self._clip_model = None

        return self._clip_model

    def get_representative_photos(self, cluster: list[PhotoData]) -> list[PhotoData]:
        ordered = sorted(cluster, key=lambda photo: photo.shoot_time)
        total = len(ordered)

        if total <= 5:
            return ordered

        if total <= 10:
            indexes = [0, total // 2, total - 1]
        else:
            indexes = [0, total // 4, total // 2, (3 * total) // 4, total - 1]

        picked = sorted(set(indexes))
        return [ordered[index] for index in picked]

    def _fallback_description(self, photo: PhotoData) -> str:
        location = "unknown"
        if _photo_has_valid_gps(photo):
            location = f"{photo.gps_lat:.4f},{photo.gps_lon:.4f}"

        time_label = photo.shoot_time.strftime("%Y-%m-%d %H:%M")
        return f"travel photo at {location} on {time_label}"

    def _fetch_ai_description(self, photo: PhotoData) -> Optional[str]:
        if not self.config.enable_ai_descriptions:
            return None

        if not ai_service.is_configured():
            return None

        public_url = storage_service.resolve_public_url(photo.thumbnail_url)
        if not public_url:
            return None

        try:
            results = ai_service.analyze_photo_batch(
                [public_url],
                prompt="请简短总结这张旅行照片的主题与场景。",
            )
        except Exception:
            return None

        if not results:
            return None

        first = results[0]
        if not isinstance(first, dict):
            return None

        description = first.get("description")
        if not isinstance(description, str):
            return None

        cleaned = description.strip()
        return cleaned if cleaned else None

    def _get_photo_description(self, photo: PhotoData) -> str:
        cached = self._description_cache.get(photo.id)
        if cached:
            return cached

        description = self._fetch_ai_description(photo) or self._fallback_description(photo)
        self._description_cache[photo.id] = description
        return description

    def _encode_text(self, text: str) -> np.ndarray:
        clip_model = self._maybe_load_clip_model()
        if clip_model is not None:
            try:
                encoded = clip_model.encode([text], normalize_embeddings=True)
                vector = np.asarray(encoded[0], dtype=float)
                norm = float(np.linalg.norm(vector))
                if norm > 0:
                    return vector / norm
            except Exception:
                pass

        return _to_vector(text, self._hashing_vectorizer)

    def compute_cluster_embeddings(self, clusters: list[list[PhotoData]]) -> dict[int, np.ndarray]:
        embeddings: dict[int, np.ndarray] = {}

        for cluster_id, photos in enumerate(clusters):
            representatives = self.get_representative_photos(photos)
            vectors: list[np.ndarray] = []

            for photo in representatives:
                description = self._get_photo_description(photo)
                location_text = "unknown"
                if _photo_has_valid_gps(photo):
                    location_text = f"{photo.gps_lat:.4f},{photo.gps_lon:.4f}"
                context = f"{description}; {photo.shoot_time.isoformat()}; {location_text}"
                vectors.append(self._encode_text(context))

            if not vectors:
                continue

            vector = np.mean(np.stack(vectors, axis=0), axis=0)
            norm = float(np.linalg.norm(vector))
            embeddings[cluster_id] = vector if norm == 0.0 else vector / norm

        return embeddings

    def find_semantic_similar_pairs(
        self,
        cluster_embeddings: dict[int, np.ndarray],
    ) -> list[tuple[int, int, float]]:
        similar_pairs: list[tuple[int, int, float]] = []
        indexes = sorted(cluster_embeddings.keys())

        for left_idx, left_cluster_id in enumerate(indexes):
            for right_cluster_id in indexes[left_idx + 1 :]:
                left = cluster_embeddings[left_cluster_id]
                right = cluster_embeddings[right_cluster_id]

                denominator = float(np.linalg.norm(left) * np.linalg.norm(right))
                if denominator == 0.0:
                    continue
                similarity = float(np.dot(left, right) / denominator)

                if similarity >= self.config.semantic_similarity_threshold:
                    similar_pairs.append((left_cluster_id, right_cluster_id, similarity))

        similar_pairs.sort(key=lambda item: item[2], reverse=True)
        return similar_pairs

    def _cluster_center(self, cluster: list[PhotoData]) -> Optional[tuple[float, float]]:
        points = [
            (photo.gps_lat, photo.gps_lon) for photo in cluster if _photo_has_valid_gps(photo)
        ]
        if not points:
            return None

        cast_points = [(float(lat), float(lon)) for lat, lon in points]
        return calculate_center_point(cast_points)

    def _temporal_gap(self, cluster_a: list[PhotoData], cluster_b: list[PhotoData]) -> timedelta:
        left = sorted(cluster_a, key=lambda photo: photo.shoot_time)
        right = sorted(cluster_b, key=lambda photo: photo.shoot_time)

        end_left = left[-1].shoot_time
        start_right = right[0].shoot_time
        if start_right >= end_left:
            return start_right - end_left

        end_right = right[-1].shoot_time
        start_left = left[0].shoot_time
        if start_left >= end_right:
            return start_left - end_right

        return timedelta(seconds=0)

    def _are_spatiotemporal_adjacent(
        self,
        cluster_a: list[PhotoData],
        cluster_b: list[PhotoData],
    ) -> bool:
        if not cluster_a or not cluster_b:
            return False

        gap = self._temporal_gap(cluster_a, cluster_b)
        time_limit = timedelta(hours=max(self.config.time_threshold_hours // 2, 2))
        if gap > time_limit:
            return False

        center_a = self._cluster_center(cluster_a)
        center_b = self._cluster_center(cluster_b)
        if center_a is None or center_b is None:
            return True

        distance = haversine_distance(center_a[0], center_a[1], center_b[0], center_b[1])
        return distance <= max(self.config.distance_threshold_km, 1.0)

    def merge_semantic_clusters(
        self,
        clusters: list[list[PhotoData]],
    ) -> list[list[PhotoData]]:
        if len(clusters) < 2:
            return clusters

        cluster_embeddings = self.compute_cluster_embeddings(clusters)
        similar_pairs = self.find_semantic_similar_pairs(cluster_embeddings)
        if not similar_pairs:
            return clusters

        parent = {idx: idx for idx in range(len(clusters))}

        def find(item: int) -> int:
            root = item
            while parent[root] != root:
                root = parent[root]

            while parent[item] != item:
                next_item = parent[item]
                parent[item] = root
                item = next_item

            return root

        def union(left: int, right: int) -> None:
            root_left = find(left)
            root_right = find(right)
            if root_left != root_right:
                parent[root_left] = root_right

        for left, right, _ in similar_pairs:
            if self._are_spatiotemporal_adjacent(clusters[left], clusters[right]):
                union(left, right)

        merged: dict[int, list[PhotoData]] = {}
        for index, cluster in enumerate(clusters):
            root = find(index)
            merged.setdefault(root, []).extend(cluster)

        result = [sorted(photos, key=lambda photo: photo.shoot_time) for photos in merged.values()]
        result.sort(key=lambda photos: photos[0].shoot_time)
        return result


class TemporalRules:
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

            # P0: 增强城市跳跃检测 - 对于 > 200km 的跳跃直接拆分（不管时间间隔）
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
    def __init__(self, config: Optional[ClusteringConfig] = None) -> None:
        self.config = config or ClusteringConfig.from_env()
        self._spacetime_clusterer = SpacetimeHDBSCAN(self.config)
        self._semantic_clusterer = SemanticClustering(self.config)
        self._last_noise_photo_ids: set[str] = set()

    def calculate_distance_matrix(self, photos: list[PhotoData]) -> list[list[float]]:
        time_threshold = self._spacetime_clusterer._adaptive_time_threshold(photos)
        distance_threshold = self._spacetime_clusterer._adaptive_distance_threshold(photos)
        matrix = self._spacetime_clusterer._build_distance_matrix(
            photos,
            time_threshold=time_threshold,
            distance_threshold=distance_threshold,
        )
        return matrix.tolist()

    def cluster(self, photos: list[PhotoData]) -> list[list[PhotoData]]:
        if not photos:
            self._last_noise_photo_ids = set()
            return []

        clusters, noise_photo_ids = self._spacetime_clusterer.cluster(photos)

        if self.config.enable_semantic_clustering:
            clusters = self._semantic_clusterer.merge_semantic_clusters(clusters)

        if self.config.enable_temporal_rules and clusters:
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

        clustered_photo_ids = {photo.id for cluster in clusters for photo in cluster}
        self._last_noise_photo_ids = {
            photo.id for photo in photos if photo.id not in clustered_photo_ids
        }
        self._last_noise_photo_ids.update(noise_photo_ids)

        return clusters

    def create_events_from_clusters(
        self,
        user_id: str,
        clusters: list[list[PhotoData]],
        db: Session,
        *,
        noise_photo_ids: Optional[set[str]] = None,
    ) -> list[Event]:
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
