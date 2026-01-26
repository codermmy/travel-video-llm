from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.db.base import Base
from app.models.photo import Photo
from app.models.user import User
from app.services.clustering_service import cluster_user_photos

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


def test_cluster_creates_single_event() -> None:
    db: Session = TestingSessionLocal()
    try:
        user = _create_user(db)

        base_time = datetime(2024, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        photo_ids: list[str] = []

        for i in range(10):
            p = Photo(
                user_id=user.id,
                file_hash=f"{'a' * 63}{i % 10}",
                thumbnail_url=f"/uploads/photos/t{i}.jpg",
                gps_lat=30.259 + (i * 0.0001),
                gps_lon=120.215 + (i * 0.0001),
                shoot_time=base_time + timedelta(minutes=i),
                status="uploaded",
            )
            db.add(p)
            db.flush()
            photo_ids.append(p.id)
        db.commit()

        events = cluster_user_photos(user_id=user.id, db=db)
        assert len(events) == 1
        event = events[0]
        assert event.photo_count == 10
        assert event.start_time == base_time
        assert event.end_time == base_time + timedelta(minutes=9)
        assert event.status == "clustered"

        # Cover photo: middle by chronological order
        assert event.cover_photo_id == photo_ids[len(photo_ids) // 2]

        # Photos updated
        photos = (
            db.query(Photo).filter(Photo.user_id == user.id).order_by(Photo.shoot_time.asc()).all()
        )
        assert all(p.event_id == event.id for p in photos)
        assert all(p.status == "clustered" for p in photos)
    finally:
        db.close()


def test_cluster_skips_insufficient_photos() -> None:
    db: Session = TestingSessionLocal()
    try:
        user = _create_user(db)
        base_time = datetime(2024, 1, 2, 0, 0, 0, tzinfo=timezone.utc)
        for i in range(4):
            db.add(
                Photo(
                    user_id=user.id,
                    file_hash=f"{'b' * 63}{i}",
                    thumbnail_url=f"/uploads/photos/s{i}.jpg",
                    gps_lat=30.0,
                    gps_lon=120.0,
                    shoot_time=base_time + timedelta(minutes=i),
                    status="uploaded",
                )
            )
        db.commit()

        events = cluster_user_photos(user_id=user.id, db=db)
        assert events == []
        photos = db.query(Photo).filter(Photo.user_id == user.id).all()
        assert all(p.event_id is None for p in photos)
    finally:
        db.close()


def test_cluster_works_without_gps() -> None:
    db: Session = TestingSessionLocal()
    try:
        user = _create_user(db)
        base_time = datetime(2024, 1, 3, 0, 0, 0, tzinfo=timezone.utc)
        for i in range(6):
            db.add(
                Photo(
                    user_id=user.id,
                    file_hash=f"{'c' * 63}{i}",
                    thumbnail_url=f"/uploads/photos/nogps{i}.jpg",
                    gps_lat=None,
                    gps_lon=None,
                    shoot_time=base_time + timedelta(hours=i),
                    status="uploaded",
                )
            )
        db.commit()

        events = cluster_user_photos(user_id=user.id, db=db)
        assert len(events) == 1
        event = events[0]
        assert event.gps_lat is None
        assert event.gps_lon is None
    finally:
        db.close()
