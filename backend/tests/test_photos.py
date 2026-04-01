from __future__ import annotations

from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.db.base import Base
from app.db.session import get_db
from app.models.photo import Photo
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


def test_photo_upload_and_metadata_duplicate_check() -> None:
    token = _register_and_get_token()
    headers = {"Authorization": f"Bearer {token}"}

    shoot_time = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc).isoformat()

    # Upload metadata
    upload = client.post(
        "/api/v1/photos/upload/metadata",
        headers=headers,
        json={
            "photos": [
                {
                    "assetId": "asset-photo-001",
                    "gpsLat": 30.259,
                    "gpsLon": 120.215,
                    "shootTime": shoot_time,
                    "fileSize": 12345,
                    "vision": {
                        "schema_version": "single-device-vision/v1",
                        "source_platform": "android-mlkit",
                        "generated_at": shoot_time,
                        "scene_category": "city_walk",
                        "object_tags": ["street", "building"],
                        "activity_hint": "walking",
                        "people_present": True,
                        "people_count_bucket": "2-3",
                        "emotion_hint": "relaxed",
                        "ocr_text": "West Lake",
                        "landmark_hint": "hangzhou",
                        "image_quality_flags": [],
                        "cover_score": 0.87,
                        "confidence_map": {"scene_category": 0.8},
                    },
                }
            ]
        },
    )
    assert upload.status_code == 200
    upload_data = upload.json()["data"]
    assert upload_data["uploaded"] == 1
    assert upload_data["failed"] == 0

    dup = client.post(
        "/api/v1/photos/check-duplicates-by-metadata",
        headers=headers,
        json={
            "photos": [
                {
                    "gpsLat": 30.259,
                    "gpsLon": 120.215,
                    "shootTime": shoot_time,
                    "filename": "asset-photo-001",
                }
            ]
        },
    )
    assert dup.status_code == 200
    dup_data = dup.json()["data"]
    assert dup_data["newItems"] == []
    assert dup_data["existingIndices"] == [0]
    assert dup_data["totalCount"] == 1


def test_photo_list_and_stats() -> None:
    token = _register_and_get_token("photo-test-device-002")
    headers = {"Authorization": f"Bearer {token}"}

    # Upload two photos, one with GPS and one without
    upload = client.post(
        "/api/v1/photos/upload/metadata",
        headers=headers,
        json={
            "photos": [
                {
                    "assetId": "asset-gps-001",
                    "gpsLat": 1.0,
                    "gpsLon": 2.0,
                },
                {"assetId": "asset-nogps-001"},
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
                    "assetId": "asset-no-trigger-001",
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
                "assetId": f"asset-bulk-{i}",
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


def test_metadata_duplicate_check_matches_same_time_and_gps() -> None:
    token = _register_and_get_token("photo-test-device-005")
    headers = {"Authorization": f"Bearer {token}"}

    shoot_time = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc).isoformat()

    upload = client.post(
        "/api/v1/photos/upload/metadata",
        headers=headers,
        json={
            "triggerClustering": False,
            "photos": [
                {
                    "assetId": "asset-dedup-001",
                    "gpsLat": 30.259,
                    "gpsLon": 120.215,
                    "shootTime": shoot_time,
                }
            ],
        },
    )
    assert upload.status_code == 200

    response = client.post(
        "/api/v1/photos/check-duplicates-by-metadata",
        headers=headers,
        json={
            "photos": [
                {
                    "gpsLat": 30.259,
                    "gpsLon": 120.215,
                    "shootTime": shoot_time,
                    "filename": "dup.jpg",
                }
            ]
        },
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["newItems"] == []
    assert data["newIndices"] == []
    assert data["existingIndices"] == [0]
    assert data["totalCount"] == 1


def test_metadata_duplicate_check_treats_missing_shoot_time_as_new() -> None:
    token = _register_and_get_token("photo-test-device-006")
    headers = {"Authorization": f"Bearer {token}"}

    upload = client.post(
        "/api/v1/photos/upload/metadata",
        headers=headers,
        json={
            "triggerClustering": False,
            "photos": [
                {
                    "assetId": "asset-no-time-001",
                    "gpsLat": 30.259,
                    "gpsLon": 120.215,
                }
            ],
        },
    )
    assert upload.status_code == 200

    response = client.post(
        "/api/v1/photos/check-duplicates-by-metadata",
        headers=headers,
        json={
            "photos": [
                {
                    "gpsLat": 30.259,
                    "gpsLon": 120.215,
                    "filename": "new.jpg",
                }
            ]
        },
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["newIndices"] == [0]
    assert data["existingIndices"] == []


def test_upload_metadata_persists_on_device_vision_payload() -> None:
    token = _register_and_get_token("photo-test-device-007")
    headers = {"Authorization": f"Bearer {token}"}

    shoot_time = datetime(2024, 1, 1, 12, 0, 0, tzinfo=timezone.utc).isoformat()

    upload = client.post(
        "/api/v1/photos/upload/metadata",
        headers=headers,
        json={
            "triggerClustering": False,
            "photos": [
                {
                    "assetId": "asset-vision-001",
                    "gpsLat": 30.259,
                    "gpsLon": 120.215,
                    "shootTime": shoot_time,
                    "vision": {
                        "schema_version": "single-device-vision/v1",
                        "source_platform": "android-mlkit",
                        "generated_at": shoot_time,
                        "scene_category": "beach",
                        "object_tags": ["sea", "sand", "person"],
                        "activity_hint": "beach_walk",
                        "people_present": True,
                        "people_count_bucket": "1",
                        "emotion_hint": "joyful",
                        "ocr_text": "West Lake",
                        "landmark_hint": "lake",
                        "image_quality_flags": [],
                        "cover_score": 0.91,
                        "confidence_map": {"scene_category": 0.88},
                    },
                }
            ],
        },
    )
    assert upload.status_code == 200
    assert upload.json()["data"]["uploaded"] == 1

    lst = client.get("/api/v1/photos", headers=headers)
    assert lst.status_code == 200
    item = lst.json()["data"]["items"][0]
    assert item["assetId"] == "asset-vision-001"
    assert item["thumbnailUrl"] is None
    assert item["vision"]["scene_category"] == "beach"
    assert item["caption"] is None

    db: Session = TestingSessionLocal()
    try:
        photo = db.query(Photo).filter_by(asset_id="asset-vision-001").one()
        assert photo.visual_desc is not None
        assert "beach" in photo.visual_desc
        assert photo.emotion_tag == "joyful"
        assert photo.vision_result["scene_category"] == "beach"
    finally:
        db.close()
