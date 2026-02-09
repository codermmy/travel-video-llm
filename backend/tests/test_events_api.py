from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.db.base import Base
from app.db.session import get_db
from app.models.event import Event
from app.models.photo import Photo
from app.models.user import User
from app.services.clustering_service import cluster_user_photos
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


def _register_and_get_token(device_id: str = "events-test-device-001") -> str:
    resp = client.post("/api/v1/auth/register", json={"device_id": device_id})
    assert resp.status_code == 200
    data = resp.json()["data"]
    return data["token"]


def test_event_list_and_detail() -> None:
    token = _register_and_get_token()
    headers = {"Authorization": f"Bearer {token}"}

    db: Session = TestingSessionLocal()
    try:
        user = db.scalar(select(User).where(User.device_id == "events-test-device-001"))
        assert user is not None

        base_time = datetime(2024, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        for i in range(6):
            db.add(
                Photo(
                    user_id=user.id,
                    file_hash=f"{'d' * 63}{i}",
                    thumbnail_url=f"/uploads/photos/e{i}.jpg",
                    gps_lat=30.259 + (i * 0.0001),
                    gps_lon=120.215 + (i * 0.0001),
                    shoot_time=base_time + timedelta(minutes=i),
                    status="uploaded",
                )
            )
        db.commit()

        created = cluster_user_photos(user_id=user.id, db=db)
        assert len(created) == 1
        event_id = created[0].id
    finally:
        db.close()

    # List events
    resp = client.get("/api/v1/events", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["total"] == 1
    assert len(data["items"]) == 1
    assert data["items"][0]["id"] == event_id

    # Event detail
    detail = client.get(f"/api/v1/events/{event_id}", headers=headers)
    assert detail.status_code == 200
    d = detail.json()["data"]
    assert d["id"] == event_id
    assert d["photoCount"] == 6
    assert len(d["photos"]) == 6


def test_event_stats() -> None:
    token = _register_and_get_token("events-test-device-002")
    headers = {"Authorization": f"Bearer {token}"}

    db: Session = TestingSessionLocal()
    try:
        user = db.scalar(select(User).where(User.device_id == "events-test-device-002"))
        assert user is not None

        base_time = datetime(2024, 1, 2, 0, 0, 0, tzinfo=timezone.utc)
        for i in range(5):
            db.add(
                Photo(
                    user_id=user.id,
                    file_hash=f"{'e' * 63}{i}",
                    thumbnail_url=f"/uploads/photos/s{i}.jpg",
                    gps_lat=31.0,
                    gps_lon=121.0,
                    shoot_time=base_time + timedelta(minutes=i),
                    status="uploaded",
                )
            )
        db.commit()

        created = cluster_user_photos(user_id=user.id, db=db)
        assert len(created) == 1
    finally:
        db.close()

    stats = client.get("/api/v1/events/stats", headers=headers)
    assert stats.status_code == 200
    s = stats.json()["data"]
    assert s["total"] == 1
    assert s["clustered"] == 1


def test_event_detail_fallback_title_and_location() -> None:
    token = _register_and_get_token("events-test-device-003")
    headers = {"Authorization": f"Bearer {token}"}

    db: Session = TestingSessionLocal()
    try:
        user = db.scalar(select(User).where(User.device_id == "events-test-device-003"))
        assert user is not None

        event = Event(
            user_id=user.id,
            title="",
            location_name=None,
            gps_lat=30.259,
            gps_lon=120.215,
            start_time=datetime(2024, 5, 1, 8, 0, 0, tzinfo=timezone.utc),
            end_time=datetime(2024, 5, 1, 9, 0, 0, tzinfo=timezone.utc),
            photo_count=0,
            status="clustered",
        )
        db.add(event)
        db.commit()
        db.refresh(event)
    finally:
        db.close()

    detail = client.get(f"/api/v1/events/{event.id}", headers=headers)
    assert detail.status_code == 200
    payload = detail.json()["data"]
    assert payload["title"]
    assert payload["locationName"] == "30.2590, 120.2150"


def test_regenerate_story_endpoint_marks_failure_when_ai_unconfigured() -> None:
    token = _register_and_get_token("events-test-device-004")
    headers = {"Authorization": f"Bearer {token}"}

    db: Session = TestingSessionLocal()
    try:
        user = db.scalar(select(User).where(User.device_id == "events-test-device-004"))
        assert user is not None

        event = Event(
            user_id=user.id,
            title="",
            location_name="杭州",
            gps_lat=30.259,
            gps_lon=120.215,
            start_time=datetime(2024, 5, 1, 8, 0, 0, tzinfo=timezone.utc),
            end_time=datetime(2024, 5, 1, 9, 0, 0, tzinfo=timezone.utc),
            photo_count=1,
            status="clustered",
        )
        db.add(event)
        db.flush()

        db.add(
            Photo(
                user_id=user.id,
                event_id=event.id,
                file_hash="f" * 64,
                thumbnail_url="https://example.com/demo.jpg",
                status="clustered",
            )
        )
        db.commit()
        db.refresh(event)
    finally:
        db.close()

    resp = client.post(f"/api/v1/events/{event.id}/regenerate-story", headers=headers)
    assert resp.status_code == 200
    out = resp.json()["data"]
    assert out["status"] in {"queued", "processed_inline"}

    detail = client.get(f"/api/v1/events/{event.id}", headers=headers)
    assert detail.status_code == 200
    payload = detail.json()["data"]
    assert payload["status"] in {"ai_failed", "ai_processing", "ai_pending", "generated"}
    if out["status"] == "processed_inline":
        assert payload["status"] == "ai_failed"
        assert payload["aiError"] == "openai_api_key_not_configured"
