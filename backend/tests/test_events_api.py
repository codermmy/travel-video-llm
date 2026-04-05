from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.db.base import Base
from app.db.session import get_db
from app.models.chapter import EventChapter
from app.models.event import Event
from app.models.event_enhancement_asset import EventEnhancementAsset
from app.models.photo import Photo
from app.models.photo_group import PhotoGroup
from app.models.user import User
from app.services.clustering_service import cluster_user_photos
from app.services.event_ai_service import generate_event_story_for_event
from app.services.ai_service import ai_service
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
    assert data["items"][0]["coverPhotoId"] is not None

    # Event detail
    detail = client.get(f"/api/v1/events/{event_id}", headers=headers)
    assert detail.status_code == 200
    d = detail.json()["data"]
    assert d["id"] == event_id
    assert d["photoCount"] == 6
    assert d["coverPhotoId"] is not None
    assert len(d["photos"]) == 6
    assert all(photo["fileHash"] for photo in d["photos"])


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
    assert payload["locationName"] is None


def test_regenerate_story_endpoint_marks_failure_when_ai_unconfigured(monkeypatch) -> None:
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
                vision_status="completed",
            )
        )
        db.commit()
        db.refresh(event)
    finally:
        db.close()

    monkeypatch.setattr("app.services.event_ai_service.ai_service.is_configured", lambda: False)
    monkeypatch.setattr(
        "app.services.event_ai_service.ai_service.configuration_error_code",
        lambda: "provider_api_key_not_configured",
    )

    resp = client.post(f"/api/v1/events/{event.id}/regenerate-story", headers=headers)
    assert resp.status_code == 200
    out = resp.json()["data"]
    assert out["status"] in {"queued", "processed_inline"}

    detail = client.get(f"/api/v1/events/{event.id}", headers=headers)
    assert detail.status_code == 200
    payload = detail.json()["data"]
    assert payload["status"] in {
        "waiting_for_vision",
        "ai_failed",
        "ai_processing",
        "ai_pending",
        "generated",
    }
    if out["status"] == "processed_inline":
        assert payload["status"] in {"waiting_for_vision", "ai_failed"}
        assert payload["aiError"] in {None, "provider_api_key_not_configured"}


def test_create_event_with_photo_ids_rebuilds_summary() -> None:
    token = _register_and_get_token("events-test-device-008")
    headers = {"Authorization": f"Bearer {token}"}

    db: Session = TestingSessionLocal()
    try:
        user = db.scalar(select(User).where(User.device_id == "events-test-device-008"))
        assert user is not None

        photo_ids: list[str] = []
        base_time = datetime(2024, 6, 1, 8, 0, 0, tzinfo=timezone.utc)
        for i in range(2):
            photo = Photo(
                user_id=user.id,
                asset_id=f"asset-create-{i}",
                shoot_time=base_time + timedelta(minutes=i * 15),
                gps_lat=30.25 + (i * 0.001),
                gps_lon=120.21 + (i * 0.001),
                status="uploaded",
            )
            db.add(photo)
            db.flush()
            photo_ids.append(photo.id)
        db.commit()
    finally:
        db.close()

    response = client.post(
        "/api/v1/events",
        headers=headers,
        json={
            "title": "西湖散步",
            "locationName": "杭州",
            "photoIds": photo_ids,
        },
    )
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["title"] == "西湖散步"
    assert payload["photoCount"] == 2
    assert payload["coverPhotoId"] is not None
    assert payload["status"] in {
        "clustered",
        "waiting_for_vision",
        "ai_pending",
        "ai_processing",
        "generated",
        "ai_failed",
    }

    detail = client.get(f"/api/v1/events/{payload['id']}", headers=headers)
    assert detail.status_code == 200
    detail_payload = detail.json()["data"]
    assert len(detail_payload["photos"]) == 2


def test_update_photo_reassigns_event_and_refreshes_summaries() -> None:
    token = _register_and_get_token("events-test-device-009")
    headers = {"Authorization": f"Bearer {token}"}

    db: Session = TestingSessionLocal()
    try:
        user = db.scalar(select(User).where(User.device_id == "events-test-device-009"))
        assert user is not None

        base_time = datetime(2024, 6, 2, 8, 0, 0, tzinfo=timezone.utc)
        event_a = Event(
            user_id=user.id,
            title="事件 A",
            start_time=base_time,
            end_time=base_time,
            photo_count=1,
            status="clustered",
        )
        event_b = Event(
            user_id=user.id,
            title="事件 B",
            start_time=base_time + timedelta(hours=1),
            end_time=base_time + timedelta(hours=1),
            photo_count=1,
            status="clustered",
        )
        db.add_all([event_a, event_b])
        db.flush()

        photo_a = Photo(
            user_id=user.id,
            event_id=event_a.id,
            asset_id="asset-reassign-a",
            shoot_time=base_time,
            status="clustered",
        )
        photo_b = Photo(
            user_id=user.id,
            event_id=event_b.id,
            asset_id="asset-reassign-b",
            shoot_time=base_time + timedelta(hours=1),
            status="clustered",
        )
        db.add_all([photo_a, photo_b])
        db.commit()
        db.refresh(event_a)
        db.refresh(event_b)
        photo_a_id = photo_a.id
        photo_b_id = photo_b.id
        event_a_id = event_a.id
        event_b_id = event_b.id
    finally:
        db.close()

    response = client.patch(
        f"/api/v1/photos/{photo_a_id}",
        headers=headers,
        json={"eventId": event_b_id},
    )
    assert response.status_code == 200
    assert response.json()["data"]["eventId"] == event_b_id

    event_a_detail = client.get(f"/api/v1/events/{event_a_id}", headers=headers)
    event_b_detail = client.get(f"/api/v1/events/{event_b_id}", headers=headers)
    assert event_a_detail.status_code == 404
    assert event_b_detail.status_code == 200

    event_b_payload = event_b_detail.json()["data"]
    assert event_b_payload["photoCount"] == 2
    assert {photo["id"] for photo in event_b_payload["photos"]} == {photo_a_id, photo_b_id}


def test_update_photo_vision_marks_event_stale() -> None:
    token = _register_and_get_token("events-test-device-vision-001")
    headers = {"Authorization": f"Bearer {token}"}

    db: Session = TestingSessionLocal()
    try:
        user = db.scalar(select(User).where(User.device_id == "events-test-device-vision-001"))
        assert user is not None

        base_time = datetime(2024, 6, 2, 8, 0, 0, tzinfo=timezone.utc)
        event = Event(
            user_id=user.id,
            title="事件 A",
            start_time=base_time,
            end_time=base_time + timedelta(minutes=5),
            photo_count=1,
            status="generated",
            event_version=3,
            story_generated_from_version=3,
            story_requested_for_version=3,
            story_freshness="fresh",
            slideshow_generated_from_version=3,
            slideshow_freshness="fresh",
            has_pending_structure_changes=False,
        )
        db.add(event)
        db.flush()

        photo = Photo(
            user_id=user.id,
            event_id=event.id,
            asset_id="asset-vision-refresh",
            shoot_time=base_time,
            status="clustered",
            vision_status="pending",
        )
        db.add(photo)
        db.commit()
        event_id = event.id
        photo_id = photo.id
    finally:
        db.close()

    response = client.patch(
        f"/api/v1/photos/{photo_id}",
        headers=headers,
        json={
            "visionStatus": "completed",
            "vision": {
                "schema_version": "single-device-vision/v1",
                "source_platform": "android-mlkit",
                "generated_at": base_time.isoformat(),
                "scene_category": "lake",
                "object_tags": ["water", "tree"],
                "activity_hint": "walking",
                "people_present": True,
                "people_count_bucket": "1",
                "emotion_hint": "peaceful",
                "ocr_text": "West Lake",
                "landmark_hint": "lake",
                "image_quality_flags": [],
                "cover_score": 0.86,
                "confidence_map": {"scene_category": 0.91},
            },
        },
    )
    assert response.status_code == 200

    detail = client.get(f"/api/v1/events/{event_id}", headers=headers)
    assert detail.status_code == 200
    payload = detail.json()["data"]
    assert payload["eventVersion"] == 4
    assert payload["storyGeneratedFromVersion"] != 3
    assert payload["slideshowGeneratedFromVersion"] != 3


def test_update_event_triggers_story_refresh_for_structural_fields() -> None:
    token = _register_and_get_token("events-test-device-010")
    headers = {"Authorization": f"Bearer {token}"}

    db: Session = TestingSessionLocal()
    try:
        user = db.scalar(select(User).where(User.device_id == "events-test-device-010"))
        assert user is not None

        event = Event(
            user_id=user.id,
            title="旧标题",
            location_name="旧地点",
            start_time=datetime(2024, 6, 3, 8, 0, 0, tzinfo=timezone.utc),
            end_time=datetime(2024, 6, 3, 9, 0, 0, tzinfo=timezone.utc),
            photo_count=1,
            status="clustered",
        )
        db.add(event)
        db.flush()
        db.add(
            Photo(
                user_id=user.id,
                event_id=event.id,
                asset_id="asset-structural-refresh",
                shoot_time=datetime(2024, 6, 3, 8, 30, 0, tzinfo=timezone.utc),
                status="clustered",
            )
        )
        db.commit()
        event_id = event.id
    finally:
        db.close()

    response = client.patch(
        f"/api/v1/events/{event_id}",
        headers=headers,
        json={"title": "新标题", "locationName": "新地点"},
    )
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["title"] == "新标题"
    assert payload["status"] in {
        "waiting_for_vision",
        "ai_pending",
        "ai_processing",
        "generated",
        "ai_failed",
    }


def test_update_event_title_keeps_version_but_marks_manual_override() -> None:
    token = _register_and_get_token("events-test-device-011")
    headers = {"Authorization": f"Bearer {token}"}

    db: Session = TestingSessionLocal()
    try:
        user = db.scalar(select(User).where(User.device_id == "events-test-device-011"))
        assert user is not None

        event = Event(
            user_id=user.id,
            title="原始标题",
            location_name="杭州",
            start_time=datetime(2024, 6, 4, 8, 0, 0, tzinfo=timezone.utc),
            end_time=datetime(2024, 6, 4, 9, 0, 0, tzinfo=timezone.utc),
            photo_count=1,
            status="generated",
            event_version=2,
            story_generated_from_version=2,
            story_requested_for_version=2,
            story_freshness="fresh",
            slideshow_generated_from_version=2,
            slideshow_freshness="fresh",
            has_pending_structure_changes=False,
            title_manually_set=False,
        )
        db.add(event)
        db.commit()
        event_id = event.id
    finally:
        db.close()

    response = client.patch(
        f"/api/v1/events/{event_id}",
        headers=headers,
        json={"title": "手动标题"},
    )
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["title"] == "手动标题"
    assert payload["eventVersion"] == 2
    assert payload["storyFreshness"] == "fresh"
    assert payload["titleManuallySet"] is True


def test_update_event_manual_location_persists_coordinates(monkeypatch) -> None:
    token = _register_and_get_token("events-test-device-manual-location-001")
    headers = {"Authorization": f"Bearer {token}"}

    monkeypatch.setattr(
        "app.api.v1.events.amap_client.get_location_context",
        lambda lat, lon: {
            "display_location": "四川阿坝州",
            "detailed_location": "九寨沟景区",
            "location_tags": "自然景区、山水风光",
        },
    )

    db: Session = TestingSessionLocal()
    try:
        user = db.scalar(select(User).where(User.device_id == "events-test-device-manual-location-001"))
        assert user is not None

        event = Event(
            user_id=user.id,
            title="待补地点",
            location_name=None,
            gps_lat=None,
            gps_lon=None,
            photo_count=0,
            status="generated",
            event_version=2,
            story_generated_from_version=2,
            story_requested_for_version=2,
            story_freshness="fresh",
            slideshow_generated_from_version=2,
            slideshow_freshness="fresh",
            has_pending_structure_changes=False,
        )
        db.add(event)
        db.flush()
        db.add(
            Photo(
                user_id=user.id,
                event_id=event.id,
                asset_id="asset-manual-location",
                shoot_time=datetime(2024, 6, 4, 8, 0, 0, tzinfo=timezone.utc),
                status="clustered",
            )
        )
        db.commit()
        event_id = event.id
    finally:
        db.close()

    response = client.patch(
        f"/api/v1/events/{event_id}",
        headers=headers,
        json={
            "gpsLat": 33.252,
            "gpsLon": 103.918,
            "detailedLocation": "九寨沟景区",
        },
    )
    assert response.status_code == 200
    payload = response.json()["data"]
    assert payload["gpsLat"] == 33.252
    assert payload["gpsLon"] == 103.918
    assert payload["locationName"] == "四川阿坝州"
    assert payload["detailedLocation"] == "九寨沟景区"
    assert payload["locationTags"] == "自然景区、山水风光"


def test_batch_reassign_event_updates_versions_once(monkeypatch) -> None:
    token = _register_and_get_token("events-test-device-012")
    headers = {"Authorization": f"Bearer {token}"}

    db: Session = TestingSessionLocal()
    try:
        user = db.scalar(select(User).where(User.device_id == "events-test-device-012"))
        assert user is not None

        base_time = datetime(2024, 6, 5, 8, 0, 0, tzinfo=timezone.utc)
        event_a = Event(
            user_id=user.id,
            title="事件 A",
            location_name="杭州",
            start_time=base_time,
            end_time=base_time + timedelta(minutes=10),
            photo_count=2,
            status="generated",
            event_version=3,
            story_generated_from_version=3,
            story_requested_for_version=3,
            story_freshness="fresh",
            slideshow_generated_from_version=3,
            slideshow_freshness="fresh",
            has_pending_structure_changes=False,
        )
        event_b = Event(
            user_id=user.id,
            title="事件 B",
            location_name="上海",
            start_time=base_time + timedelta(hours=1),
            end_time=base_time + timedelta(hours=1, minutes=10),
            photo_count=1,
            status="generated",
            event_version=4,
            story_generated_from_version=4,
            story_requested_for_version=4,
            story_freshness="fresh",
            slideshow_generated_from_version=4,
            slideshow_freshness="fresh",
            has_pending_structure_changes=False,
        )
        db.add_all([event_a, event_b])
        db.flush()

        photos = [
            Photo(
                user_id=user.id,
                event_id=event_a.id,
                asset_id="asset-batch-a1",
                shoot_time=base_time,
                status="clustered",
                vision_status="completed",
            ),
            Photo(
                user_id=user.id,
                event_id=event_a.id,
                asset_id="asset-batch-a2",
                shoot_time=base_time + timedelta(minutes=5),
                status="clustered",
                vision_status="completed",
            ),
            Photo(
                user_id=user.id,
                event_id=event_b.id,
                asset_id="asset-batch-b1",
                shoot_time=base_time + timedelta(hours=1),
                status="clustered",
                vision_status="completed",
            ),
        ]
        db.add_all(photos)
        db.commit()
        photo_ids = [photos[0].id, photos[1].id]
        event_a_id = event_a.id
        event_b_id = event_b.id
    finally:
        db.close()

    monkeypatch.setattr("app.services.event_ai_service.ai_service.is_configured", lambda: False)
    monkeypatch.setattr(
        "app.services.event_ai_service.ai_service.configuration_error_code",
        lambda: "provider_api_key_not_configured",
    )

    response = client.post(
        "/api/v1/photos/batch/reassign-event",
        headers=headers,
        json={"photoIds": photo_ids, "eventId": event_b_id},
    )
    assert response.status_code == 200
    assert response.json()["data"]["updated"] == 2
    assert response.json()["data"]["deletedEventIds"] == [event_a_id]

    event_a_detail = client.get(f"/api/v1/events/{event_a_id}", headers=headers)
    event_b_detail = client.get(f"/api/v1/events/{event_b_id}", headers=headers)
    assert event_a_detail.status_code == 404
    assert event_b_detail.status_code == 200

    event_b_payload = event_b_detail.json()["data"]
    assert event_b_payload["eventVersion"] == 5
    assert event_b_payload["storyFreshness"] == "stale"
    assert event_b_payload["photoCount"] == 3


def test_create_event_deletes_source_event_when_all_selected_photos_moved() -> None:
    token = _register_and_get_token("events-test-device-014")
    headers = {"Authorization": f"Bearer {token}"}

    db: Session = TestingSessionLocal()
    try:
        user = db.scalar(select(User).where(User.device_id == "events-test-device-014"))
        assert user is not None

        base_time = datetime(2024, 6, 6, 8, 0, 0, tzinfo=timezone.utc)
        source_event = Event(
            user_id=user.id,
            title="原事件",
            location_name="南京",
            start_time=base_time,
            end_time=base_time + timedelta(minutes=10),
            photo_count=2,
            status="generated",
            event_version=2,
            story_generated_from_version=2,
            story_requested_for_version=2,
            story_freshness="fresh",
            slideshow_generated_from_version=2,
            slideshow_freshness="fresh",
            has_pending_structure_changes=False,
        )
        db.add(source_event)
        db.flush()

        photos = [
            Photo(
                user_id=user.id,
                event_id=source_event.id,
                asset_id="asset-create-move-a",
                shoot_time=base_time,
                status="clustered",
                vision_status="completed",
            ),
            Photo(
                user_id=user.id,
                event_id=source_event.id,
                asset_id="asset-create-move-b",
                shoot_time=base_time + timedelta(minutes=5),
                status="clustered",
                vision_status="completed",
            ),
        ]
        db.add_all(photos)
        db.commit()
        source_event_id = source_event.id
        photo_ids = [photo.id for photo in photos]
    finally:
        db.close()

    response = client.post(
        "/api/v1/events",
        headers=headers,
        json={"title": "新事件", "photoIds": photo_ids},
    )
    assert response.status_code == 200

    source_event_detail = client.get(f"/api/v1/events/{source_event_id}", headers=headers)
    assert source_event_detail.status_code == 404


class _StructuredStoryProviderStub:
    def provider_name(self) -> str:
        return "stub"

    def is_configured(self) -> bool:
        return True

    def configuration_error_code(self) -> str:
        return "stub_not_configured"

    def current_models(self) -> dict[str, str]:
        return {"story_model": "stub-story", "vision_model": "none"}

    def get_last_error_code(self) -> None:
        return None

    def analyze_image(self, image_url: str, prompt: str = "") -> dict | None:
        _ = image_url
        _ = prompt
        return {
            "description": "湖边步道、树影和水面反光清晰可见",
            "emotion": "Peaceful",
        }

    def generate_event_story(
        self,
        location: str,
        date_range: str,
        photo_descriptions: list[str],
        detailed_location: str = "",
        location_tags: str = "",
        structured_summary: str = "",
        timeline_clues: list[str] | None = None,
    ) -> dict:
        assert location
        assert date_range
        assert photo_descriptions
        assert "主要场景" in structured_summary
        assert timeline_clues
        assert detailed_location
        assert location_tags
        return {
            "title": "西湖午后散步",
            "full_story": "午后的行程沿着湖边展开，脚步和风景顺着时间慢慢铺开。",
            "emotion": "Peaceful",
        }

    def generate_story(self, prompt: str, max_tokens: int = 500) -> str | None:
        _ = max_tokens
        if "请为照片生成中文短文案" in prompt:
            return "湖边 · 散步 · 微风"
        if "请写一个章节故事" in prompt:
            return json.dumps(
                {
                    "chapter_title": "湖边片段",
                    "chapter_story": "沿着湖岸慢慢前行，风景和步伐被时间轻轻串在一起。",
                    "slideshow_caption": "湖边散步",
                },
                ensure_ascii=False,
            )
        if "请基于结构化旅行线索写一条微故事" in prompt:
            return "风从湖面吹来，脚步也慢了下来"
        if "请为旅行章节生成引言和总结" in prompt:
            return json.dumps(
                {
                    "intro": "这一章从湖边的步行开始，空气和光线都很轻。",
                    "summary": "这一段停在湖风和散步的节奏里。",
                },
                ensure_ascii=False,
            )
        if "用户这次主动上传了少量代表图" in prompt:
            return json.dumps(
                {
                    "title": "西湖增强版午后散步",
                    "full_story": "湖边步道、树影和水面反光把这段午后拉得更长，风声和脚步沿着岸线慢慢展开，连停顿都显得更清晰。",
                    "emotion": "Peaceful",
                },
                ensure_ascii=False,
            )
        return "旅途仍在继续"


def test_generate_event_story_uses_structured_signals_without_public_urls() -> None:
    original_client = ai_service.client
    ai_service.client = _StructuredStoryProviderStub()

    db: Session = TestingSessionLocal()
    try:
        user = User(device_id="events-test-device-005", auth_type="device")
        db.add(user)
        db.flush()

        event = Event(
            user_id=user.id,
            title="",
            location_name="杭州西湖",
            gps_lat=30.259,
            gps_lon=120.215,
            start_time=datetime(2024, 5, 1, 14, 0, 0, tzinfo=timezone.utc),
            end_time=datetime(2024, 5, 1, 15, 0, 0, tzinfo=timezone.utc),
            photo_count=2,
            status="ai_pending",
        )
        db.add(event)
        db.flush()

        vision_payload = {
            "schema_version": "single-device-vision/v1",
            "source_platform": "android-mlkit",
            "generated_at": datetime(2024, 5, 1, 14, 0, 0, tzinfo=timezone.utc).isoformat(),
            "scene_category": "lake",
            "object_tags": ["water", "tree", "walkway"],
            "activity_hint": "walking",
            "people_present": True,
            "people_count_bucket": "1",
            "emotion_hint": "peaceful",
            "ocr_text": "West Lake",
            "landmark_hint": "lake",
            "image_quality_flags": [],
            "cover_score": 0.82,
            "confidence_map": {"scene_category": 0.9},
        }
        for index in range(2):
            db.add(
                Photo(
                    user_id=user.id,
                    event_id=event.id,
                    file_hash=f"{index + 2:064x}",
                    thumbnail_url=None,
                    shoot_time=datetime(2024, 5, 1, 14, index * 10, 0, tzinfo=timezone.utc),
                    status="clustered",
                    visual_desc="lake | walking | water / tree / walkway | West Lake",
                    vision_result=vision_payload,
                )
            )
        db.commit()

        ok, reason = generate_event_story_for_event(db=db, user_id=user.id, event_id=event.id)
        assert ok is True
        assert reason is None

        db.refresh(event)
        assert event.status == "generated"
        assert event.full_story
        assert event.title == "西湖午后散步"
        assert event.emotion_tag == "Peaceful"

        photos = db.query(Photo).filter(Photo.event_id == event.id).all()
        assert all(photo.caption for photo in photos)
        assert all(photo.micro_story for photo in photos)
    finally:
        ai_service.client = original_client
        db.close()


def test_generate_event_story_persists_location_context(monkeypatch) -> None:
    original_client = ai_service.client
    ai_service.client = _StructuredStoryProviderStub()

    monkeypatch.setattr(
        "app.services.event_ai_service.amap_client.get_location_context",
        lambda lat, lon: {
            "display_location": "杭州西湖",
            "detailed_location": "西湖风景名胜区",
            "location_tags": "湖光山色、城市漫游",
        },
    )

    db: Session = TestingSessionLocal()
    try:
        user = User(device_id="events-test-device-location-context-001", auth_type="device")
        db.add(user)
        db.flush()

        event = Event(
            user_id=user.id,
            title="",
            location_name="30.2590, 120.2150",
            gps_lat=30.259,
            gps_lon=120.215,
            start_time=datetime(2024, 5, 1, 14, 0, 0, tzinfo=timezone.utc),
            end_time=datetime(2024, 5, 1, 15, 0, 0, tzinfo=timezone.utc),
            photo_count=2,
            status="ai_pending",
        )
        db.add(event)
        db.flush()

        vision_payload = {
            "schema_version": "single-device-vision/v1",
            "source_platform": "android-mlkit",
            "generated_at": datetime(2024, 5, 1, 14, 0, 0, tzinfo=timezone.utc).isoformat(),
            "scene_category": "lake",
            "object_tags": ["water", "tree", "walkway"],
            "activity_hint": "walking",
            "people_present": True,
            "people_count_bucket": "1",
            "emotion_hint": "peaceful",
            "ocr_text": "West Lake",
            "landmark_hint": "lake",
            "image_quality_flags": [],
            "cover_score": 0.82,
            "confidence_map": {"scene_category": 0.9},
        }
        for index in range(2):
            db.add(
                Photo(
                    user_id=user.id,
                    event_id=event.id,
                    file_hash=f"{index + 200:064x}",
                    thumbnail_url=None,
                    shoot_time=datetime(2024, 5, 1, 14, index * 10, 0, tzinfo=timezone.utc),
                    status="clustered",
                    visual_desc="lake | walking | water / tree / walkway | West Lake",
                    vision_result=vision_payload,
                )
            )
        db.commit()

        ok, reason = generate_event_story_for_event(db=db, user_id=user.id, event_id=event.id)
        assert ok is True
        assert reason is None

        db.refresh(event)
        assert event.status == "generated"
        assert event.location_name == "杭州西湖"
        assert event.detailed_location == "西湖风景名胜区"
        assert event.location_tags == "湖光山色、城市漫游"
    finally:
        ai_service.client = original_client
        db.close()


def test_event_enhancement_upload_and_retry_flow() -> None:
    original_client = ai_service.client
    ai_service.client = _StructuredStoryProviderStub()

    token = _register_and_get_token("events-test-device-006")
    headers = {"Authorization": f"Bearer {token}"}

    db: Session = TestingSessionLocal()
    try:
        user = db.scalar(select(User).where(User.device_id == "events-test-device-006"))
        assert user is not None

        event = Event(
            user_id=user.id,
            title="",
            location_name="杭州西湖",
            gps_lat=30.259,
            gps_lon=120.215,
            start_time=datetime(2024, 5, 1, 14, 0, 0, tzinfo=timezone.utc),
            end_time=datetime(2024, 5, 1, 15, 0, 0, tzinfo=timezone.utc),
            photo_count=4,
            status="generated",
        )
        db.add(event)
        db.flush()
        event_id = event.id

        photo_ids: list[str] = []
        for index in range(4):
            photo = Photo(
                user_id=user.id,
                event_id=event.id,
                file_hash=f"{index + 10:064x}",
                thumbnail_url=None,
                shoot_time=datetime(2024, 5, 1, 14, index * 10, 0, tzinfo=timezone.utc),
                status="clustered",
                local_path=f"/tmp/local-{index}.jpg",
                vision_result={
                    "schema_version": "single-device-vision/v1",
                    "source_platform": "android-mlkit",
                    "generated_at": datetime(2024, 5, 1, 14, 0, 0, tzinfo=timezone.utc).isoformat(),
                    "scene_category": "lake",
                    "object_tags": ["water", "tree", "walkway"],
                    "activity_hint": "walking",
                    "people_present": True,
                    "people_count_bucket": "1",
                    "emotion_hint": "peaceful",
                    "ocr_text": "West Lake",
                    "landmark_hint": "lake",
                    "image_quality_flags": [],
                    "cover_score": 0.9 - (index * 0.1),
                    "confidence_map": {"scene_category": 0.9},
                },
            )
            db.add(photo)
            db.flush()
            photo_ids.append(photo.id)
        db.commit()
    finally:
        db.close()

    files = [
        ("photoIds", (None, photo_ids[0])),
        ("photoIds", (None, photo_ids[1])),
        ("photoIds", (None, photo_ids[2])),
        ("files", ("one.jpg", b"fake-image-one", "image/jpeg")),
        ("files", ("two.jpg", b"fake-image-two", "image/jpeg")),
        ("files", ("three.jpg", b"fake-image-three", "image/jpeg")),
    ]
    resp = client.post(
        f"/api/v1/events/{event_id}/enhance-story",
        headers=headers,
        files=files,
    )
    assert resp.status_code == 200
    payload = resp.json()["data"]
    assert payload["enhancement"]["assetCount"] == 3

    detail = client.get(f"/api/v1/events/{event_id}", headers=headers)
    assert detail.status_code == 200
    detail_payload = detail.json()["data"]
    assert detail_payload["enhancement"]["canRetry"] is True
    assert detail_payload["title"] == "西湖增强版午后散步"

    summary = client.get("/api/v1/events/enhancement-storage/summary", headers=headers)
    assert summary.status_code == 200
    summary_payload = summary.json()["data"]
    assert summary_payload["assetCount"] == 3
    assert summary_payload["eventCount"] == 1

    retry = client.post(
        f"/api/v1/events/{event_id}/enhance-story",
        headers=headers,
        files=[("reuseExisting", (None, "true"))],
    )
    assert retry.status_code == 200

    cleared = client.delete("/api/v1/events/enhancement-storage", headers=headers)
    assert cleared.status_code == 200
    assert cleared.json()["data"]["assetCount"] == 0

    db = TestingSessionLocal()
    try:
        remaining = db.scalars(select(EventEnhancementAsset)).all()
        assert remaining == []
    finally:
        db.close()
        ai_service.client = original_client


def test_regenerate_story_replaces_existing_chapters_and_groups() -> None:
    original_client = ai_service.client
    ai_service.client = _StructuredStoryProviderStub()

    db: Session = TestingSessionLocal()
    try:
        db.execute(text("PRAGMA foreign_keys=ON"))
        user = User(device_id="events-test-device-013", auth_type="device")
        db.add(user)
        db.flush()

        event = Event(
            user_id=user.id,
            title="旧标题",
            location_name="杭州西湖",
            gps_lat=30.259,
            gps_lon=120.215,
            start_time=datetime(2024, 5, 1, 14, 0, 0, tzinfo=timezone.utc),
            end_time=datetime(2024, 5, 1, 15, 40, 0, tzinfo=timezone.utc),
            photo_count=12,
            status="generated",
            event_version=1,
            story_generated_from_version=1,
            story_requested_for_version=1,
            story_freshness="fresh",
            slideshow_generated_from_version=1,
            slideshow_freshness="fresh",
            has_pending_structure_changes=False,
        )
        db.add(event)
        db.flush()

        old_chapter = EventChapter(
            user_id=user.id,
            event_id=event.id,
            chapter_index=1,
            chapter_title="旧章节",
            chapter_story="旧故事",
            slideshow_caption="旧字幕",
            photo_start_index=0,
            photo_end_index=2,
        )
        db.add(old_chapter)
        db.flush()

        db.add(
            PhotoGroup(
                user_id=user.id,
                event_id=event.id,
                chapter_id=old_chapter.id,
                group_index=1,
                group_theme="旧分组",
                group_emotion="Peaceful",
                group_scene_desc="{}",
                photo_start_index=0,
                photo_end_index=2,
            )
        )

        for index in range(12):
            db.add(
                Photo(
                    user_id=user.id,
                    event_id=event.id,
                    file_hash=f"{index + 100:064x}",
                    shoot_time=datetime(2024, 5, 1, 14, index * 5, 0, tzinfo=timezone.utc),
                    status="clustered",
                    vision_status="completed",
                    vision_result={
                        "scene_category": "lake",
                        "object_tags": ["water", "tree", "walkway"],
                        "activity_hint": "walking",
                        "emotion_hint": "peaceful",
                        "landmark_hint": "lake",
                    },
                )
            )

        db.commit()

        ok, reason = generate_event_story_for_event(db=db, user_id=user.id, event_id=event.id)

        assert ok is True
        assert reason is None

        db.refresh(event)
        assert event.status == "generated"

        chapters = db.scalars(select(EventChapter).where(EventChapter.event_id == event.id)).all()
        groups = db.scalars(select(PhotoGroup).where(PhotoGroup.event_id == event.id)).all()
        assert chapters
        assert groups
        assert all(group.chapter_id for group in groups)
    finally:
        ai_service.client = original_client
        db.close()
