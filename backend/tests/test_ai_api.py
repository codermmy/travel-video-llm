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
from app.tasks.clustering_tasks import _generate_ai_story
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


def test_ai_endpoints(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.api.v1.ai.ai_service.analyze_event_photos",
        lambda event_id, photo_urls, location: {
            "descriptions": ["desc-1"],
            "emotion": "Calm",
        },
    )
    monkeypatch.setattr(
        "app.api.v1.ai.ai_service.generate_event_story",
        lambda event_id, location, start_time, end_time, photo_descriptions: {
            "title": "title",
            "story": "story",
            "emotion": "Happy",
        },
    )

    r1 = client.post(
        "/api/v1/ai/analyze-photos",
        json={"photo_urls": ["https://example.com/1.jpg"], "location": ""},
    )
    assert r1.status_code == 200
    assert r1.json()["emotion"] == "Calm"

    r2 = client.post(
        "/api/v1/ai/generate-story",
        json={
            "event_id": "evt-001",
            "location": "杭州",
            "start_time": "2024-01-01T00:00:00Z",
            "end_time": "2024-01-01T01:00:00Z",
            "photo_descriptions": ["x"],
        },
    )
    assert r2.status_code == 200
    assert r2.json()["title"] == "title"
    assert r2.json()["emotion"] == "Happy"


def test_generate_ai_story_writes_back(monkeypatch) -> None:
    db: Session = TestingSessionLocal()
    try:
        user = User(device_id="ai-story-writeback", auth_type="device")
        db.add(user)
        db.commit()
        db.refresh(user)

        base_time = datetime(2024, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        event = Event(
            user_id=user.id,
            title="",
            start_time=base_time,
            end_time=base_time + timedelta(minutes=10),
            photo_count=2,
            status="clustered",
        )
        db.add(event)
        db.commit()
        db.refresh(event)

        db.add_all(
            [
                Photo(
                    user_id=user.id,
                    event_id=event.id,
                    file_hash=("a" * 63) + "0",
                    thumbnail_url="https://example.com/a.jpg",
                    shoot_time=base_time,
                    status="clustered",
                ),
                Photo(
                    user_id=user.id,
                    event_id=event.id,
                    file_hash=("a" * 63) + "1",
                    thumbnail_url="https://example.com/b.jpg",
                    shoot_time=base_time + timedelta(minutes=1),
                    status="clustered",
                ),
            ]
        )
        db.commit()

        monkeypatch.setattr(
            "app.tasks.clustering_tasks.ai_service.analyze_event_photos",
            lambda event_id, photo_urls, location: {
                "descriptions": ["d1", "d2"],
                "emotion": "Calm",
            },
        )
        monkeypatch.setattr(
            "app.tasks.clustering_tasks.ai_service.generate_event_story",
            lambda event_id, location, start_time, end_time, photo_descriptions: {
                "title": "T",
                "story": "S",
                "emotion": "Epic",
            },
        )

        _generate_ai_story(db=db, user_id=user.id, event_id=event.id)

        updated = db.scalar(select(Event).where(Event.id == event.id))
        assert updated is not None
        assert updated.status == "generated"
        assert updated.title == "T"
        assert updated.story_text == "S"
        assert updated.emotion_tag == "Epic"
    finally:
        db.close()
