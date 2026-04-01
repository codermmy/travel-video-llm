from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.db.base import Base
from app.db.session import get_db
from app.models.event import Event
from app.models.event_enhancement_asset import EventEnhancementAsset
from app.models.photo import Photo
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
