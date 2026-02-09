from __future__ import annotations

from datetime import datetime, timedelta, timezone
from time import perf_counter
from uuid import uuid4

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.db.base import Base
from app.models.photo import Photo
from app.models.user import User
from app.services.clustering_service import (
    ClusteringConfig,
    PhotoData,
    SemanticClustering,
    SpacetimeClustering,
    cluster_user_photos,
)

engine = create_engine(
    "sqlite+pysqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

Base.metadata.create_all(bind=engine)


def _create_user(db: Session) -> User:
    user = User(device_id=f"cluster-test-device-{uuid4()}", auth_type="device")
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def _create_photo(
    *,
    db: Session,
    user_id: str,
    index: int,
    base_time: datetime,
    minute_offset: int,
    lat: float | None,
    lon: float | None,
    hash_prefix: str,
) -> Photo:
    photo = Photo(
        user_id=user_id,
        file_hash=f"{hash_prefix}{index:063x}",
        thumbnail_url=f"/uploads/photos/{hash_prefix}{index}.jpg",
        gps_lat=lat,
        gps_lon=lon,
        shoot_time=base_time + timedelta(minutes=minute_offset),
        status="uploaded",
    )
    db.add(photo)
    db.flush()
    return photo


def test_cluster_creates_single_event() -> None:
    db: Session = TestingSessionLocal()
    try:
        user = _create_user(db)

        base_time = datetime(2024, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        photo_ids: list[str] = []

        for i in range(10):
            photo = _create_photo(
                db=db,
                user_id=user.id,
                index=i,
                base_time=base_time,
                minute_offset=i,
                lat=30.259 + (i * 0.0001),
                lon=120.215 + (i * 0.0001),
                hash_prefix="a",
            )
            photo_ids.append(photo.id)
        db.commit()

        events = cluster_user_photos(user_id=user.id, db=db)
        assert len(events) == 1

        event = events[0]
        assert event.photo_count == 10
        assert event.start_time == base_time
        assert event.end_time == base_time + timedelta(minutes=9)
        assert event.status == "clustered"
        assert event.cover_photo_id == photo_ids[len(photo_ids) // 2]

        photos = (
            db.query(Photo).filter(Photo.user_id == user.id).order_by(Photo.shoot_time.asc()).all()
        )
        assert all(photo.event_id == event.id for photo in photos)
        assert all(photo.status == "clustered" for photo in photos)
    finally:
        db.close()


def test_cluster_marks_insufficient_photos_as_noise() -> None:
    db: Session = TestingSessionLocal()
    try:
        user = _create_user(db)
        base_time = datetime(2024, 1, 2, 0, 0, 0, tzinfo=timezone.utc)

        for i in range(4):
            _create_photo(
                db=db,
                user_id=user.id,
                index=i,
                base_time=base_time,
                minute_offset=i,
                lat=30.0,
                lon=120.0,
                hash_prefix="b",
            )
        db.commit()

        events = cluster_user_photos(user_id=user.id, db=db)
        assert events == []

        photos = db.query(Photo).filter(Photo.user_id == user.id).all()
        assert all(photo.event_id is None for photo in photos)
        assert all(photo.status == "noise" for photo in photos)
    finally:
        db.close()


def test_cluster_works_without_gps() -> None:
    db: Session = TestingSessionLocal()
    try:
        user = _create_user(db)
        base_time = datetime(2024, 1, 3, 0, 0, 0, tzinfo=timezone.utc)

        for i in range(6):
            _create_photo(
                db=db,
                user_id=user.id,
                index=i,
                base_time=base_time,
                minute_offset=i * 20,
                lat=None,
                lon=None,
                hash_prefix="c",
            )
        db.commit()

        events = cluster_user_photos(user_id=user.id, db=db)
        assert len(events) == 1
        event = events[0]
        assert event.gps_lat is None
        assert event.gps_lon is None
    finally:
        db.close()


def test_cluster_supports_more_than_fifty_photos_in_single_event() -> None:
    db: Session = TestingSessionLocal()
    try:
        user = _create_user(db)
        base_time = datetime(2024, 1, 5, 8, 0, 0, tzinfo=timezone.utc)

        for i in range(55):
            _create_photo(
                db=db,
                user_id=user.id,
                index=i,
                base_time=base_time,
                minute_offset=i,
                lat=31.2304 + (i * 0.00005),
                lon=121.4737 + (i * 0.00005),
                hash_prefix="e",
            )
        db.commit()

        events = cluster_user_photos(user_id=user.id, db=db)
        assert len(events) == 1
        assert events[0].photo_count == 55
    finally:
        db.close()


def test_temporal_rules_split_large_internal_time_gaps() -> None:
    db: Session = TestingSessionLocal()
    try:
        user = _create_user(db)
        base_time = datetime(2024, 1, 6, 9, 0, 0, tzinfo=timezone.utc)

        for i in range(5):
            _create_photo(
                db=db,
                user_id=user.id,
                index=i,
                base_time=base_time,
                minute_offset=i * 5,
                lat=30.26 + i * 0.0001,
                lon=120.21 + i * 0.0001,
                hash_prefix="f",
            )

        second_start = base_time + timedelta(hours=72)
        for i in range(5, 10):
            _create_photo(
                db=db,
                user_id=user.id,
                index=i,
                base_time=second_start,
                minute_offset=(i - 5) * 6,
                lat=30.80 + (i - 5) * 0.0001,
                lon=121.00 + (i - 5) * 0.0001,
                hash_prefix="f",
            )

        db.commit()

        config = ClusteringConfig(
            min_photos_per_event=3,
            hdbscan_min_cluster_size=3,
            enable_semantic_clustering=False,
            enable_temporal_rules=True,
            time_threshold_hours=48,
        )
        events = cluster_user_photos(user_id=user.id, db=db, config=config)

        assert len(events) >= 2
        counts = sorted(event.photo_count for event in events)
        assert counts[-1] >= 5
    finally:
        db.close()


def test_temporal_rules_do_not_merge_large_no_gps_gaps() -> None:
    db: Session = TestingSessionLocal()
    try:
        user = _create_user(db)
        base_time = datetime(2024, 1, 7, 8, 0, 0, tzinfo=timezone.utc)

        for i in range(5):
            _create_photo(
                db=db,
                user_id=user.id,
                index=i,
                base_time=base_time,
                minute_offset=i * 10,
                lat=None,
                lon=None,
                hash_prefix="g",
            )

        second_start = base_time + timedelta(hours=60)
        for i in range(5, 10):
            _create_photo(
                db=db,
                user_id=user.id,
                index=i,
                base_time=second_start,
                minute_offset=(i - 5) * 10,
                lat=None,
                lon=None,
                hash_prefix="g",
            )

        db.commit()

        config = ClusteringConfig(
            min_photos_per_event=3,
            hdbscan_min_cluster_size=3,
            enable_semantic_clustering=False,
            enable_temporal_rules=True,
            time_threshold_hours=48,
        )
        events = cluster_user_photos(user_id=user.id, db=db, config=config)

        assert len(events) >= 2
    finally:
        db.close()


def test_temporal_rules_split_city_transitions() -> None:
    db: Session = TestingSessionLocal()
    try:
        user = _create_user(db)
        base_time = datetime(2024, 1, 4, 9, 0, 0, tzinfo=timezone.utc)

        for i in range(5):
            _create_photo(
                db=db,
                user_id=user.id,
                index=i,
                base_time=base_time,
                minute_offset=i * 5,
                lat=30.67 + i * 0.0001,
                lon=104.06 + i * 0.0001,
                hash_prefix="d",
            )

        for i in range(5, 10):
            _create_photo(
                db=db,
                user_id=user.id,
                index=i,
                base_time=base_time,
                minute_offset=60 + (i - 5) * 5,
                lat=29.56 + (i - 5) * 0.0001,
                lon=106.55 + (i - 5) * 0.0001,
                hash_prefix="d",
            )

        db.commit()

        config = ClusteringConfig(
            min_photos_per_event=3,
            hdbscan_min_cluster_size=3,
            enable_semantic_clustering=False,
            enable_temporal_rules=True,
            city_jump_threshold_km=100.0,
        )
        events = cluster_user_photos(user_id=user.id, db=db, config=config)

        assert len(events) >= 2
        counts = sorted(event.photo_count for event in events)
        assert counts[-1] >= 5
    finally:
        db.close()


def test_semantic_cluster_merge_for_adjacent_groups() -> None:
    config = ClusteringConfig(
        enable_semantic_clustering=True,
        enable_ai_descriptions=False,
        semantic_similarity_threshold=0.6,
        distance_threshold_km=10.0,
        time_threshold_hours=48,
    )
    semantic = SemanticClustering(config)

    base = datetime(2024, 2, 1, 10, 0, 0, tzinfo=timezone.utc)
    cluster_a = [
        PhotoData(
            id="a1",
            user_id="u",
            shoot_time=base,
            gps_lat=30.60,
            gps_lon=104.05,
            thumbnail_url="/uploads/photos/a1.jpg",
        ),
        PhotoData(
            id="a2",
            user_id="u",
            shoot_time=base + timedelta(minutes=5),
            gps_lat=30.6003,
            gps_lon=104.0502,
            thumbnail_url="/uploads/photos/a2.jpg",
        ),
    ]
    cluster_b = [
        PhotoData(
            id="b1",
            user_id="u",
            shoot_time=base + timedelta(minutes=25),
            gps_lat=30.601,
            gps_lon=104.051,
            thumbnail_url="/uploads/photos/b1.jpg",
        )
    ]

    def fake_description(photo: PhotoData) -> str:
        if photo.id.startswith("a") or photo.id.startswith("b"):
            return "古镇建筑和街景"
        return "餐厅美食"

    semantic._get_photo_description = fake_description  # type: ignore[method-assign]
    merged = semantic.merge_semantic_clusters([cluster_a, cluster_b])

    assert len(merged) == 1
    assert len(merged[0]) == 3


def _make_photo_data(
    *,
    index: int,
    shoot_time: datetime,
    lat: float | None,
    lon: float | None,
    user_id: str = "synthetic-user",
    prefix: str = "synthetic",
) -> PhotoData:
    return PhotoData(
        id=f"{prefix}-{index}",
        user_id=user_id,
        shoot_time=shoot_time,
        gps_lat=lat,
        gps_lon=lon,
        thumbnail_url=f"/uploads/photos/{prefix}-{index}.jpg",
    )


def test_long_span_large_dataset_is_split_into_multiple_reasonable_clusters() -> None:
    config = ClusteringConfig(
        min_photos_per_event=5,
        hdbscan_min_cluster_size=5,
        enable_semantic_clustering=False,
        enable_temporal_rules=True,
        time_threshold_hours=48,
        city_jump_threshold_km=100.0,
    )
    clustering = SpacetimeClustering(config)

    base_time = datetime(2025, 1, 1, 8, 0, 0, tzinfo=timezone.utc)
    day_offsets = [0, 4, 9, 15, 22, 31, 43, 58]
    city_points = [
        (31.2304, 121.4737),
        (30.5728, 104.0668),
        (39.9042, 116.4074),
        (22.5431, 114.0579),
        (34.3416, 108.9398),
        (23.1291, 113.2644),
        (29.5630, 106.5516),
        (30.5728, 104.0668),
    ]

    photos: list[PhotoData] = []
    index = 0
    for day_offset, (base_lat, base_lon) in zip(day_offsets, city_points):
        start = base_time + timedelta(days=day_offset)
        for minute_offset in range(0, 25 * 6, 6):
            lat: float | None
            lon: float | None
            if minute_offset % 24 == 0:
                lat, lon = None, None
            else:
                jitter = (minute_offset // 6) * 0.00015
                lat = base_lat + jitter
                lon = base_lon + jitter
            photos.append(
                _make_photo_data(
                    index=index,
                    shoot_time=start + timedelta(minutes=minute_offset),
                    lat=lat,
                    lon=lon,
                    prefix="long-span",
                )
            )
            index += 1

    clusters = clustering.cluster(photos)

    assert len(clusters) >= 4
    largest_cluster = max(len(cluster) for cluster in clusters)
    assert largest_cluster < 130

    max_span = max(cluster[-1].shoot_time - cluster[0].shoot_time for cluster in clusters)
    assert max_span <= timedelta(days=14)


def test_semantic_similarity_does_not_merge_far_apart_clusters() -> None:
    config = ClusteringConfig(
        enable_semantic_clustering=True,
        enable_ai_descriptions=False,
        semantic_similarity_threshold=0.6,
        distance_threshold_km=20.0,
        time_threshold_hours=48,
    )
    semantic = SemanticClustering(config)

    base = datetime(2024, 2, 2, 10, 0, 0, tzinfo=timezone.utc)
    cluster_a = [
        PhotoData(
            id="sa1",
            user_id="u",
            shoot_time=base,
            gps_lat=39.9042,
            gps_lon=116.4074,
            thumbnail_url="/uploads/photos/sa1.jpg",
        ),
        PhotoData(
            id="sa2",
            user_id="u",
            shoot_time=base + timedelta(minutes=5),
            gps_lat=39.9044,
            gps_lon=116.4076,
            thumbnail_url="/uploads/photos/sa2.jpg",
        ),
    ]
    cluster_b = [
        PhotoData(
            id="sb1",
            user_id="u",
            shoot_time=base + timedelta(minutes=20),
            gps_lat=31.2304,
            gps_lon=121.4737,
            thumbnail_url="/uploads/photos/sb1.jpg",
        )
    ]

    semantic._get_photo_description = lambda _photo: "城市建筑和街景"  # type: ignore[method-assign]
    merged = semantic.merge_semantic_clusters([cluster_a, cluster_b])

    assert len(merged) == 2


def test_event_center_ignores_zero_zero_gps_values() -> None:
    db: Session = TestingSessionLocal()
    try:
        user = _create_user(db)
        base_time = datetime(2024, 1, 8, 10, 0, 0, tzinfo=timezone.utc)

        for i in range(9):
            _create_photo(
                db=db,
                user_id=user.id,
                index=i,
                base_time=base_time,
                minute_offset=i * 4,
                lat=31.2304 + i * 0.0001,
                lon=121.4737 + i * 0.0001,
                hash_prefix="z",
            )

        _create_photo(
            db=db,
            user_id=user.id,
            index=99,
            base_time=base_time,
            minute_offset=50,
            lat=0.0,
            lon=0.0,
            hash_prefix="z",
        )
        db.commit()

        config = ClusteringConfig(
            min_photos_per_event=3,
            hdbscan_min_cluster_size=3,
            enable_semantic_clustering=False,
            enable_temporal_rules=True,
        )
        events = cluster_user_photos(user_id=user.id, db=db, config=config)

        assert len(events) == 1
        event = events[0]
        assert event.gps_lat is not None
        assert event.gps_lon is not None
        assert 30.0 <= float(event.gps_lat) <= 32.0
        assert 120.0 <= float(event.gps_lon) <= 122.0
    finally:
        db.close()


def test_batch_like_upload_ordering_produces_stable_cluster_distribution() -> None:
    config = ClusteringConfig(
        min_photos_per_event=5,
        hdbscan_min_cluster_size=5,
        enable_semantic_clustering=False,
        enable_temporal_rules=True,
        time_threshold_hours=48,
        city_jump_threshold_km=100.0,
    )

    base_time = datetime(2025, 3, 1, 8, 0, 0, tzinfo=timezone.utc)
    session_specs = [
        (0, 31.2304, 121.4737),
        (5, 30.5728, 104.0668),
        (11, 39.9042, 116.4074),
        (18, 22.5431, 114.0579),
    ]

    photos: list[PhotoData] = []
    index = 0
    for day_offset, lat, lon in session_specs:
        start = base_time + timedelta(days=day_offset)
        for minute_offset in range(0, 50 * 4, 4):
            photos.append(
                _make_photo_data(
                    index=index,
                    shoot_time=start + timedelta(minutes=minute_offset),
                    lat=lat + (minute_offset // 4) * 0.0001,
                    lon=lon + (minute_offset // 4) * 0.0001,
                    prefix="batch-consistency",
                )
            )
            index += 1

    ordered_photos = sorted(photos, key=lambda photo: photo.shoot_time)
    batched_order = photos[::3] + photos[1::3] + photos[2::3]

    clustering_ordered = SpacetimeClustering(config)
    clusters_ordered = clustering_ordered.cluster(ordered_photos)

    clustering_batched = SpacetimeClustering(config)
    clusters_batched = clustering_batched.cluster(batched_order)

    ordered_distribution = sorted(len(cluster) for cluster in clusters_ordered)
    batched_distribution = sorted(len(cluster) for cluster in clusters_batched)

    assert ordered_distribution == batched_distribution


def test_clustering_performance_for_thousand_photos() -> None:
    config = ClusteringConfig(
        min_photos_per_event=5,
        hdbscan_min_cluster_size=5,
        enable_semantic_clustering=False,
        enable_temporal_rules=True,
        time_threshold_hours=48,
        city_jump_threshold_km=120.0,
    )
    clustering = SpacetimeClustering(config)

    base_time = datetime(2025, 6, 1, 9, 0, 0, tzinfo=timezone.utc)
    photos: list[PhotoData] = []

    index = 0
    for day_offset in range(0, 40, 4):
        for local_index in range(100):
            minute_offset = local_index * 3
            photos.append(
                _make_photo_data(
                    index=index,
                    shoot_time=base_time + timedelta(days=day_offset, minutes=minute_offset),
                    lat=31.2304 + day_offset * 0.001 + local_index * 0.00005,
                    lon=121.4737 + day_offset * 0.001 + local_index * 0.00005,
                    prefix="perf-1000",
                )
            )
            index += 1

    start = perf_counter()
    clusters = clustering.cluster(photos)
    elapsed = perf_counter() - start

    assert clusters
    assert elapsed < 15.0
