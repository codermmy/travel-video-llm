from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.db.base import Base
from app.db.session import get_db
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


def _register_and_get_token(device_id: str = "photo-test-device-001") -> str:
    resp = client.post("/api/v1/auth/register", json={"device_id": device_id})
    assert resp.status_code == 200
    data = resp.json()["data"]
    return data["token"]


def test_photo_upload_and_duplicate_check() -> None:
    token = _register_and_get_token()
    headers = {"Authorization": f"Bearer {token}"}

    file_hash = "a" * 64
    shoot_time = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc).isoformat()

    # Upload metadata
    upload = client.post(
        "/api/v1/photos/upload/metadata",
        headers=headers,
        json={
            "photos": [
                {
                    "hash": file_hash,
                    "thumbnailPath": "/tmp/thumb.jpg",
                    "gpsLat": 30.259,
                    "gpsLon": 120.215,
                    "shootTime": shoot_time,
                    "fileSize": 12345,
                }
            ]
        },
    )
    assert upload.status_code == 200
    upload_data = upload.json()["data"]
    assert upload_data["uploaded"] == 1
    assert upload_data["failed"] == 0

    # Duplicate check
    dup = client.post(
        "/api/v1/photos/check-duplicates",
        headers=headers,
        json={"hashes": [file_hash]},
    )
    assert dup.status_code == 200
    dup_data = dup.json()["data"]
    assert dup_data["newHashes"] == []
    assert dup_data["existingHashes"] == [file_hash]
    assert dup_data["totalCount"] == 1


def test_photo_list_and_stats() -> None:
    token = _register_and_get_token("photo-test-device-002")
    headers = {"Authorization": f"Bearer {token}"}

    # Upload two photos, one with GPS and one without
    hash1 = "b" * 64
    hash2 = "c" * 64
    upload = client.post(
        "/api/v1/photos/upload/metadata",
        headers=headers,
        json={
            "photos": [
                {
                    "hash": hash1,
                    "thumbnailPath": "/tmp/t1.jpg",
                    "gpsLat": 1.0,
                    "gpsLon": 2.0,
                },
                {"hash": hash2, "thumbnailPath": "/tmp/t2.jpg"},
            ]
        },
    )
    assert upload.status_code == 200

    # List
    lst = client.get("/api/v1/photos", headers=headers)
    assert lst.status_code == 200
    data = lst.json()["data"]
    assert data["total"] == 2
    assert len(data["items"]) == 2

    # Stats
    stats = client.get("/api/v1/photos/stats/summary", headers=headers)
    assert stats.status_code == 200
    s = stats.json()["data"]
    assert s["total"] == 2
    assert s["withGps"] == 1
    assert s["withoutGps"] == 1


def test_upload_metadata_without_triggering_clustering_task() -> None:
    token = _register_and_get_token("photo-test-device-003")
    headers = {"Authorization": f"Bearer {token}"}

    upload = client.post(
        "/api/v1/photos/upload/metadata",
        headers=headers,
        json={
            "triggerClustering": False,
            "photos": [
                {
                    "hash": "d" * 64,
                    "thumbnailPath": "/tmp/no-trigger.jpg",
                }
            ],
        },
    )
    assert upload.status_code == 200
    data = upload.json()["data"]
    assert data["uploaded"] == 1
    assert data["taskId"] is None


def test_upload_metadata_accepts_more_than_fifty_items() -> None:
    token = _register_and_get_token("photo-test-device-004")
    headers = {"Authorization": f"Bearer {token}"}

    photos = []
    for i in range(51):
        photos.append(
            {
                "hash": f"{i:064x}",
                "thumbnailPath": f"/tmp/bulk-{i}.jpg",
            }
        )

    upload = client.post(
        "/api/v1/photos/upload/metadata",
        headers=headers,
        json={
            "triggerClustering": False,
            "photos": photos,
        },
    )
    assert upload.status_code == 200
    data = upload.json()["data"]
    assert data["uploaded"] == 51
    assert data["failed"] == 0
