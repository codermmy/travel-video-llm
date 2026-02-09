from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.core.config import settings
from app.db.base import Base
from app.db.session import get_db
from app.models.event import Event
from app.models.photo import Photo
from app.models.user import User
from main import create_app

engine = create_engine(
    "sqlite+pysqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def override_get_db():
    db: Session = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


Base.metadata.create_all(bind=engine)

app = create_app()
app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def _seed_user_and_photos() -> str:
    db: Session = TestingSessionLocal()
    try:
        user = User(device_id="admin-test-device-001", auth_type="device")
        db.add(user)
        db.flush()

        event = Event(
            user_id=user.id,
            title="old event",
            start_time=datetime(2024, 1, 1, 10, 0, 0, tzinfo=timezone.utc),
            end_time=datetime(2024, 1, 1, 10, 30, 0, tzinfo=timezone.utc),
            photo_count=2,
            status="clustered",
        )
        db.add(event)
        db.flush()

        base_time = datetime(2024, 1, 1, 10, 0, 0, tzinfo=timezone.utc)
        for i in range(8):
            db.add(
                Photo(
                    user_id=user.id,
                    event_id=event.id if i < 2 else None,
                    file_hash=f"{i:064x}",
                    thumbnail_url=f"/uploads/photos/{i}.jpg",
                    gps_lat=30.26 + i * 0.0001,
                    gps_lon=120.21 + i * 0.0001,
                    shoot_time=base_time + timedelta(minutes=i),
                    status="clustered" if i < 2 else "uploaded",
                )
            )

        db.commit()
        return user.id
    finally:
        db.close()


def test_admin_recluster_requires_admin_key() -> None:
    previous = settings.admin_api_key
    settings.admin_api_key = "admin-secret"
    try:
        resp = client.post(
            "/api/v1/admin/recluster",
            json={"allUsers": True},
        )
        assert resp.status_code == 403
        assert resp.json()["detail"] == "admin_key_invalid"
    finally:
        settings.admin_api_key = previous


def test_admin_recluster_for_single_user() -> None:
    user_id = _seed_user_and_photos()

    previous = settings.admin_api_key
    settings.admin_api_key = "admin-secret"
    try:
        resp = client.post(
            "/api/v1/admin/recluster",
            headers={"X-Admin-Key": "admin-secret"},
            json={"userId": user_id},
        )
        assert resp.status_code == 200

        data = resp.json()["data"]
        assert data["userCount"] == 1
        assert data["totalPreviousEvents"] >= 1
        assert data["totalCreatedEvents"] >= 1

        db: Session = TestingSessionLocal()
        try:
            events = db.scalars(select(Event).where(Event.user_id == user_id)).all()
            assert len(events) >= 1

            clustered_or_noise = db.scalars(
                select(Photo).where(
                    Photo.user_id == user_id,
                    Photo.status.in_(["clustered", "noise", "uploaded"]),
                )
            ).all()
            assert len(clustered_or_noise) == 8
        finally:
            db.close()
    finally:
        settings.admin_api_key = previous
