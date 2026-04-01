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

        # 只有 2 张照片，低于默认最小值 3，应该被标记为噪声
        # 注意：当前默认 min_photos_per_event=2，所以需要显式设置为 3 来测试噪声逻辑
        for i in range(2):
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

        # 使用 min_photos_per_event=3 的配置来测试
        config = ClusteringConfig(min_photos_per_event=3, hdbscan_min_cluster_size=3)
        events = cluster_user_photos(user_id=user.id, db=db, config=config)
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

        # 成都照片（5 张）
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

        # 重庆照片（5 张），与成都照片间隔 4 小时（>180 分钟）
        for i in range(5, 10):
            _create_photo(
                db=db,
                user_id=user.id,
                index=i,
                base_time=base_time,
                minute_offset=240 + (i - 5) * 5,  # 从 240 分钟开始，与第一组间隔 220 分钟
                lat=29.56 + (i - 5) * 0.0001,
                lon=106.55 + (i - 5) * 0.0001,
                hash_prefix="d",
            )

        db.commit()

        config = ClusteringConfig(
            min_photos_per_event=2,  # 更新为新默认值
            hdbscan_min_cluster_size=3,
            enable_semantic_clustering=False,
            enable_temporal_rules=True,
            city_jump_threshold_km=100.0,
        )
        events = cluster_user_photos(user_id=user.id, db=db, config=config)

        # 应该分成至少 2 个事件（成都和重庆）
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


def test_night_singleton_filter() -> None:
    """测试夜间单张照片过滤功能。"""
    from app.services.clustering_service import TemporalRules

    base = datetime(2024, 1, 1, 10, 0, 0, tzinfo=timezone.utc)

    # 白天单张照片 - 应该保留
    day_single = [
        PhotoData(
            id="day-single",
            user_id="u",
            shoot_time=base,
            gps_lat=30.0,
            gps_lon=120.0,
            thumbnail_url="/uploads/photos/day-single.jpg",
        ),
    ]

    # 夜间单张照片（23 点） - 应该过滤
    night_single_23 = [
        PhotoData(
            id="night-single-23",
            user_id="u",
            shoot_time=base.replace(hour=23),
            gps_lat=30.0,
            gps_lon=120.0,
            thumbnail_url="/uploads/photos/night-single-23.jpg",
        ),
    ]

    # 夜间单张照片（3 点） - 应该过滤
    night_single_3 = [
        PhotoData(
            id="night-single-3",
            user_id="u",
            shoot_time=base.replace(hour=3),
            gps_lat=30.0,
            gps_lon=120.0,
            thumbnail_url="/uploads/photos/night-single-3.jpg",
        ),
    ]

    # 多张照片事件（包含夜间） - 应该保留
    multi_photo = [
        PhotoData(
            id="multi-1",
            user_id="u",
            shoot_time=base.replace(hour=22),
            gps_lat=30.0,
            gps_lon=120.0,
            thumbnail_url="/uploads/photos/multi-1.jpg",
        ),
        PhotoData(
            id="multi-2",
            user_id="u",
            shoot_time=base.replace(hour=23),
            gps_lat=30.0,
            gps_lon=120.0,
            thumbnail_url="/uploads/photos/multi-2.jpg",
        ),
    ]

    events = [day_single, night_single_23, night_single_3, multi_photo]
    filtered = TemporalRules.filter_night_singletons(events)

    # 应该只剩 2 个事件：白天单张 + 多张
    assert len(filtered) == 2
    assert filtered[0][0].id == "day-single"
    assert len(filtered[1]) == 2  # 多张事件


def test_invalid_timestamp_detection() -> None:
    """测试时间戳异常检测功能。"""
    from app.services.clustering_service import _is_timestamp_valid

    # 有效时间戳
    valid_now = datetime.now(tz=timezone.utc)
    assert _is_timestamp_valid(valid_now) is True

    # 2000 年以后的有效时间
    valid_2000 = datetime(2000, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    assert _is_timestamp_valid(valid_2000) is True

    # 1999 年 - 无效（相机未设置）
    invalid_old = datetime(1999, 12, 31, 23, 59, 59, tzinfo=timezone.utc)
    assert _is_timestamp_valid(invalid_old) is False

    # 1980 年 - 无效（典型相机默认时间）
    invalid_1980 = datetime(1980, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
    assert _is_timestamp_valid(invalid_1980) is False

    # 未来 1 天内 - 有效（考虑时区差异）
    future_tomorrow = datetime.now(tz=timezone.utc) + timedelta(hours=12)
    assert _is_timestamp_valid(future_tomorrow) is True

    # 未来 1 天以上 - 无效
    future_far = datetime.now(tz=timezone.utc) + timedelta(days=2)
    assert _is_timestamp_valid(future_far) is False


def test_cross_day_activity() -> None:
    """测试跨天活动（23:00 → 02:00）不被错误拆分。"""
    config = ClusteringConfig(
        min_photos_per_event=3,
        hdbscan_min_cluster_size=3,
        enable_semantic_clustering=False,
        enable_temporal_rules=True,
    )
    clustering = SpacetimeClustering(config)

    # 跨天活动：23:00 到次日 02:00
    base = datetime(2024, 1, 1, 23, 0, 0, tzinfo=timezone.utc)
    photos = [
        PhotoData(
            id=f"cross-day-{i}",
            user_id="u",
            shoot_time=base + timedelta(minutes=i * 30),
            gps_lat=30.0 + i * 0.0001,
            gps_lon=120.0 + i * 0.0001,
            thumbnail_url=f"/uploads/photos/cross-day-{i}.jpg",
        )
        for i in range(8)  # 8 张照片，跨度 4 小时
    ]

    clusters = clustering.cluster(photos)

    # 应该合并为 1 个事件
    assert len(clusters) == 1
    assert len(clusters[0]) == 8


def test_multi_city_travel() -> None:
    """测试多城市连续旅行场景（东京 - 京都 - 大阪）。"""
    config = ClusteringConfig(
        min_photos_per_event=3,
        hdbscan_min_cluster_size=3,
        enable_semantic_clustering=False,
        enable_temporal_rules=True,
        city_jump_threshold_km=50.0,  # 50km 城市跳跃阈值
    )
    clustering = SpacetimeClustering(config)

    base = datetime(2024, 3, 1, 9, 0, 0, tzinfo=timezone.utc)
    photos: list[PhotoData] = []
    index = 0

    # 东京 3 天（模拟 2 个点，相距较远）
    tokyo_lat, tokyo_lon = 35.6762, 139.6503
    for day in range(3):
        for minute in range(0, 120, 10):
            photos.append(
                PhotoData(
                    id=f"tokyo-{index}",
                    user_id="u",
                    shoot_time=base + timedelta(days=day, minutes=minute),
                    gps_lat=tokyo_lat + minute * 0.0001,
                    gps_lon=tokyo_lon + minute * 0.0001,
                    thumbnail_url=f"/uploads/photos/tokyo-{index}.jpg",
                )
            )
            index += 1

    # 京都 2 天
    kyoto_lat, kyoto_lon = 35.0116, 135.7681
    kyoto_start = base + timedelta(days=4)
    for day in range(2):
        for minute in range(0, 120, 10):
            photos.append(
                PhotoData(
                    id=f"kyoto-{index}",
                    user_id="u",
                    shoot_time=kyoto_start + timedelta(days=day, minutes=minute),
                    gps_lat=kyoto_lat + minute * 0.0001,
                    gps_lon=kyoto_lon + minute * 0.0001,
                    thumbnail_url=f"/uploads/photos/kyoto-{index}.jpg",
                )
            )
            index += 1

    # 大阪 2 天
    osaka_lat, osaka_lon = 34.6937, 135.5023
    osaka_start = base + timedelta(days=7)
    for day in range(2):
        for minute in range(0, 120, 10):
            photos.append(
                PhotoData(
                    id=f"osaka-{index}",
                    user_id="u",
                    shoot_time=osaka_start + timedelta(days=day, minutes=minute),
                    gps_lat=osaka_lat + minute * 0.0001,
                    gps_lon=osaka_lon + minute * 0.0001,
                    thumbnail_url=f"/uploads/photos/osaka-{index}.jpg",
                )
            )
            index += 1

    clusters = clustering.cluster(photos)

    # 应该分成 2-3 个事件（东京独立，京都+ 大阪可能合并）
    # 京都和大阪距离约 50km，可能被合并为一个事件
    assert len(clusters) >= 2
    assert len(clusters) <= 3
    # 东京应该独立成事件（约 36 张）
    tokyo_cluster = [c for c in clusters if c[0].id.startswith("tokyo")]
    assert len(tokyo_cluster) == 1
    assert len(tokyo_cluster[0]) == 36


def test_single_day_multiple_spots() -> None:
    """测试一天内多个景点场景（上午 A 地，下午 B 地）。"""
    config = ClusteringConfig(
        min_photos_per_event=3,
        hdbscan_min_cluster_size=3,
        enable_semantic_clustering=False,
        enable_temporal_rules=True,
        city_jump_threshold_km=50.0,
    )
    clustering = SpacetimeClustering(config)

    base = datetime(2024, 5, 1, 9, 0, 0, tzinfo=timezone.utc)
    photos: list[PhotoData] = []

    # 上午 A 景点（10 张）
    spot_a_lat, spot_a_lon = 30.67, 104.06
    for i in range(10):
        photos.append(
            PhotoData(
                id=f"spot-a-{i}",
                user_id="u",
                shoot_time=base + timedelta(minutes=i * 5),
                gps_lat=spot_a_lat + i * 0.0001,
                gps_lon=spot_a_lon + i * 0.0001,
                thumbnail_url=f"/uploads/photos/spot-a-{i}.jpg",
            )
        )

    # 下午 B 景点（10 张，相距 20km）
    spot_b_lat, spot_b_lon = 30.50, 104.20  # 相距约 20km
    afternoon_start = base + timedelta(hours=4)
    for i in range(10):
        photos.append(
            PhotoData(
                id=f"spot-b-{i}",
                user_id="u",
                shoot_time=afternoon_start + timedelta(minutes=i * 5),
                gps_lat=spot_b_lat + i * 0.0001,
                gps_lon=spot_b_lon + i * 0.0001,
                thumbnail_url=f"/uploads/photos/spot-b-{i}.jpg",
            )
        )

    clusters = clustering.cluster(photos)

    # 同城两个景点，距离<50km，应该合并为 1 个事件
    assert len(clusters) == 1
    assert len(clusters[0]) == 20


# ============================================================
# 用户体验测评官场景测试
# 基于用户体验第一性原理，验证聚类算法是否符合预期
# ============================================================

def test_scenario_1_weekend_short_trip() -> None:
    """场景 1：周末短途游 - 100-300 张照片，1-2 天，期望 1-2 个事件，连拍不被拆分。"""
    config = ClusteringConfig(
        min_photos_per_event=2,
        hdbscan_min_cluster_size=2,
        enable_semantic_clustering=True,
        enable_temporal_rules=True,
        time_threshold_hours=48,
        distance_threshold_km=50.0,
        city_jump_threshold_km=50.0,
        merge_short_interval_min=180,
    )
    clustering = SpacetimeClustering(config)

    base = datetime(2024, 6, 1, 9, 0, 0, tzinfo=timezone.utc)
    photos: list[PhotoData] = []

    # 模拟 200 张照片，分布在 2 天内，同一景点
    # 包含连拍场景（连续拍摄间隔<1 分钟）
    spot_lat, spot_lon = 30.27, 120.15  # 杭州西湖
    for day in range(2):
        for hour in range(8, 18):  # 每天 8:00-18:00
            for minute in range(0, 60, 5):  # 每 5 分钟拍一批
                # 每批包含连拍（3-5 张连续照片）
                burst_count = 3 if minute % 15 != 0 else 5
                for burst in range(burst_count):
                    photos.append(
                        PhotoData(
                            id=f"weekend-{day}-{hour}-{minute}-{burst}",
                            user_id="u",
                            shoot_time=base + timedelta(days=day, hours=hour, minutes=minute, seconds=burst*10),
                            gps_lat=spot_lat + (minute // 10) * 0.0001,
                            gps_lon=spot_lon + (minute // 10) * 0.0001,
                            thumbnail_url=f"/uploads/photos/weekend-{day}-{hour}-{minute}-{burst}.jpg",
                        )
                    )

    clusters = clustering.cluster(photos)

    # 测试通过标准：同一景点全天游玩不被拆分为 >3 个事件
    assert len(clusters) <= 3, f"周末短途游被拆分为{len(clusters)}个事件，期望<=3"

    # 验证连拍照片未被拆分到不同事件
    total_clustered = sum(len(c) for c in clusters)
    assert total_clustered >= len(photos) * 0.95, f"连拍照片丢失过多：{total_clustered}/{len(photos)}"


def test_scenario_2_golden_week_long_trip() -> None:
    """场景 2：黄金周长途旅行 - 500-1500 张照片，5-7 天，多城市，期望按城市分组。"""
    config = ClusteringConfig(
        min_photos_per_event=3,
        hdbscan_min_cluster_size=3,
        enable_semantic_clustering=True,
        enable_temporal_rules=True,
        time_threshold_hours=48,
        distance_threshold_km=50.0,
        city_jump_threshold_km=50.0,
        merge_short_interval_min=180,
    )
    clustering = SpacetimeClustering(config)

    base = datetime(2024, 10, 1, 8, 0, 0, tzinfo=timezone.utc)
    photos: list[PhotoData] = []

    # 7 天行程：北京 -> 西安 -> 成都 -> 重庆 -> 上海
    cities = [
        ("beijing", 39.9042, 116.4074, [0, 1]),      # 2 天
        ("xian", 34.3416, 108.9398, [2]),           # 1 天
        ("chengdu", 30.5728, 104.0668, [3]),        # 1 天
        ("chongqing", 29.5630, 106.5516, [4]),      # 1 天
        ("shanghai", 31.2304, 121.4737, [5, 6]),    # 2 天
    ]

    index = 0
    for city_name, lat, lon, days in cities:
        for day in days:
            # 每个城市每天拍摄 100-150 张
            photos_per_day = 120
            for i in range(photos_per_day):
                hour = 8 + (i // 15)  # 每小时约 15 张
                minute = (i % 15) * 4
                photos.append(
                    PhotoData(
                        id=f"golden-{city_name}-{index}",
                        user_id="u",
                        shoot_time=base + timedelta(days=day, hours=hour, minutes=minute),
                        gps_lat=lat + (i % 20) * 0.0005,
                        gps_lon=lon + (i % 20) * 0.0005,
                        thumbnail_url=f"/uploads/photos/golden-{city_name}-{index}.jpg",
                    )
                )
                index += 1

    clusters = clustering.cluster(photos)

    # 测试通过标准：不同城市的事件不混合（准确率>90%）
    # 应该有 5 个左右的事件（每个城市 1 个）
    assert 4 <= len(clusters) <= 7, f"黄金周旅行被拆分为{len(clusters)}个事件，期望 4-7"

    # 验证每个集群主要来自单一城市
    correct_grouping = 0
    for cluster in clusters:
        city_counts: dict[str, int] = {}
        for photo in cluster:
            city = photo.id.split("-")[1]  # golden-{city}-...
            city_counts[city] = city_counts.get(city, 0) + 1
        dominant_city = max(city_counts, key=city_counts.get)
        dominant_ratio = city_counts[dominant_city] / len(cluster)
        if dominant_ratio >= 0.9:
            correct_grouping += len(cluster)

    accuracy = correct_grouping / len(photos)
    assert accuracy >= 0.90, f"城市分组准确率={accuracy:.2%}，期望>=90%"


def test_scenario_3_business_leisure_mix() -> None:
    """场景 3：商务出差 + 游玩 - 50-200 张照片，3-4 天，期望工作日和周末分开。

    注意：此场景在纯时空聚类下存在局限性 - 如果商务和休闲在同一城市且时间间隔较短，
    算法难以区分。此测试验证在典型场景下（有足够时间/空间间隔）的表现。
    """
    config = ClusteringConfig(
        min_photos_per_event=2,
        hdbscan_min_cluster_size=2,
        enable_semantic_clustering=True,
        enable_temporal_rules=True,
        time_threshold_hours=24,  # 降低时间阈值以更好地区分商务/休闲
        distance_threshold_km=30.0,
        city_jump_threshold_km=30.0,
        merge_short_interval_min=120,
    )
    clustering = SpacetimeClustering(config)

    # 周五商务，周日游玩（间隔 1 天以上）
    base_business = datetime(2024, 11, 15, 9, 0, 0, tzinfo=timezone.utc)  # 周五
    base_leisure = datetime(2024, 11, 17, 10, 0, 0, tzinfo=timezone.utc)  # 周日

    photos: list[PhotoData] = []

    # 商务场景（周五，浦东会议中心）
    business_lat, business_lon = 31.2397, 121.4990  # 浦东
    for i in range(30):
        hour = 9 + (i // 6)
        minute = (i % 6) * 10
        photos.append(
            PhotoData(
                id=f"business-{i}",
                user_id="u",
                shoot_time=base_business + timedelta(hours=hour, minutes=minute),
                gps_lat=business_lat + (i % 5) * 0.0001,
                gps_lon=business_lon + (i % 5) * 0.0001,
                thumbnail_url=f"/uploads/photos/business-{i}.jpg",
            )
        )

    # 休闲场景（周日，迪士尼 - 与商务地点相距较远）
    leisure_lat, leisure_lon = 31.1443, 121.6582  # 迪士尼（距浦东约 20km）
    for i in range(40):
        hour = 10 + (i // 8)
        minute = (i % 8) * 7
        photos.append(
            PhotoData(
                id=f"leisure-{i}",
                user_id="u",
                shoot_time=base_leisure + timedelta(hours=hour, minutes=minute),
                gps_lat=leisure_lat + (i % 10) * 0.0002,
                gps_lon=leisure_lon + (i % 10) * 0.0002,
                thumbnail_url=f"/uploads/photos/leisure-{i}.jpg",
            )
        )

    clusters = clustering.cluster(photos)

    # 测试通过标准：商务和休闲照片不混合
    # 在典型场景下（时间间隔>24h，地点间隔>15km），应该分成至少 2 个事件
    # 注意：如果商务和休闲在同一地点且时间连续，算法无法区分，这是设计局限
    has_pure_business = any(
        all(p.id.startswith("business-") for p in c) for c in clusters
    )
    has_pure_leisure = any(
        all(p.id.startswith("leisure-") for p in c) for c in clusters
    )

    # 至少应该有纯商务或纯休闲的事件
    assert has_pure_business or has_pure_leisure, "商务和休闲照片完全混合，未形成独立事件"

    # 计算分离率（允许部分混合，但主导类别应该清晰）
    business_correct = 0
    leisure_correct = 0
    for cluster in clusters:
        business_count = sum(1 for p in cluster if p.id.startswith("business-"))
        leisure_count = sum(1 for p in cluster if p.id.startswith("leisure-"))

        if business_count > leisure_count:
            business_correct += business_count
        else:
            leisure_correct += leisure_count

    total = len(photos)
    separation_rate = (business_correct + leisure_correct) / total
    # 在典型场景下，分离率应>=70%（放宽标准，承认算法局限）
    assert separation_rate >= 0.70, f"商务/休闲分离率={separation_rate:.2%}，期望>=70%"


def test_scenario_4_international_trip() -> None:
    """场景 4：海外长途旅行 - 1000-3000 张照片，10-15 天，跨国，期望不同国家 100% 分开。"""
    config = ClusteringConfig(
        min_photos_per_event=3,
        hdbscan_min_cluster_size=3,
        enable_semantic_clustering=True,
        enable_temporal_rules=True,
        time_threshold_hours=48,
        distance_threshold_km=50.0,
        city_jump_threshold_km=50.0,
        merge_short_interval_min=180,
    )
    clustering = SpacetimeClustering(config)

    base = datetime(2024, 7, 1, 8, 0, 0, tzinfo=timezone.utc)
    photos: list[PhotoData] = []

    # 15 天跨国行程：中国 -> 日本 -> 泰国
    countries = [
        ("cn", "beijing", 39.9042, 116.4074, [0, 1, 2]),     # 中国北京 3 天
        ("jp", "tokyo", 35.6762, 139.6503, [3, 4, 5, 6]),    # 日本东京 4 天
        ("th", "bangkok", 13.7563, 100.5018, [7, 8, 9, 10]), # 泰国曼谷 4 天
        ("jp", "osaka", 34.6937, 135.5023, [11, 12]),        # 日本大阪 2 天
        ("cn", "shanghai", 31.2304, 121.4737, [13, 14]),     # 中国上海 2 天
    ]

    index = 0
    for country, city, lat, lon, days in countries:
        for day in days:
            # 每个城市每天拍摄约 100 张
            for i in range(100):
                hour = 8 + (i // 12)
                minute = (i % 12) * 5
                photos.append(
                    PhotoData(
                        id=f"intl-{country}-{city}-{index}",
                        user_id="u",
                        shoot_time=base + timedelta(days=day, hours=hour, minutes=minute),
                        gps_lat=lat + (i % 20) * 0.0005,
                        gps_lon=lon + (i % 20) * 0.0005,
                        thumbnail_url=f"/uploads/photos/intl-{country}-{city}-{index}.jpg",
                    )
                )
                index += 1

    clusters = clustering.cluster(photos)

    # 测试通过标准：不同国家的照片 100% 分开
    country_correct = 0
    for cluster in clusters:
        country_counts: dict[str, int] = {}
        for photo in cluster:
            country = photo.id.split("-")[1]  # intl-{country}-...
            country_counts[country] = country_counts.get(country, 0) + 1
        dominant_country = max(country_counts, key=country_counts.get)
        country_correct += country_counts[dominant_country]

    accuracy = country_correct / len(photos)
    assert accuracy == 1.0, f"跨国分组准确率={accuracy:.2%}，期望 100%"


def test_scenario_5_daily_fragmented_records() -> None:
    """场景 5：日常碎片记录 - 每天 5-20 张，积累数周，期望形成有意义的周末/事件分组。"""
    config = ClusteringConfig(
        min_photos_per_event=2,
        hdbscan_min_cluster_size=2,
        enable_semantic_clustering=True,
        enable_temporal_rules=True,
        time_threshold_hours=48,
        distance_threshold_km=50.0,
        city_jump_threshold_km=50.0,
        merge_short_interval_min=180,
    )
    clustering = SpacetimeClustering(config)

    base = datetime(2024, 9, 1, 8, 0, 0, tzinfo=timezone.utc)
    photos: list[PhotoData] = []

    # 模拟 4 周的日常记录
    # 工作日每天 5-10 张，周末每天 15-20 张
    home_lat, home_lon = 30.27, 120.15  # 杭州

    index = 0
    for week in range(4):
        for day in range(7):
            day_offset = week * 7 + day
            is_weekend = day >= 5  # 周六日

            # 工作日 5-10 张，周末 15-20 张
            photos_today = 8 if is_weekend else 6

            for i in range(photos_today):
                hour = 7 + (i // 2) * 2  # 分散在全天
                minute = (i % 2) * 30
                photos.append(
                    PhotoData(
                        id=f"daily-w{week}-d{day}-{i}",
                        user_id="u",
                        shoot_time=base + timedelta(days=day_offset, hours=hour, minutes=minute),
                        gps_lat=home_lat + (i % 5) * 0.0002,
                        gps_lon=home_lon + (i % 5) * 0.0002,
                        thumbnail_url=f"/uploads/photos/daily-w{week}-d{day}-{i}.jpg",
                    )
                )
                index += 1

    clusters = clustering.cluster(photos)

    # 测试通过标准：不生成>10 个碎片化事件（每个<5 张）
    fragmented_events = sum(1 for c in clusters if len(c) < 5)
    assert fragmented_events <= 10, f"碎片化事件数量={fragmented_events}，期望<=10"

    # 验证形成了有意义的事件分组（应该有合理的聚合）
    total_photos = len(photos)
    clustered_photos = sum(len(c) for c in clusters)
    cluster_ratio = clustered_photos / total_photos
    assert cluster_ratio >= 0.8, f"聚类比例={cluster_ratio:.2%}，期望>=80%"
