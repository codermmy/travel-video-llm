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


def _register_and_get_token(device_id: str, nickname: str) -> tuple[str, str]:
    response = client.post(
        "/api/v1/auth/register",
        json={"device_id": device_id, "nickname": nickname},
    )
    assert response.status_code == 200
    data = response.json()["data"]
    return data["token"], data["user_id"]


def test_get_and_update_current_user() -> None:
    token, _ = _register_and_get_token("users-me-001", "测试用户")
    headers = {"Authorization": f"Bearer {token}"}

    me = client.get("/api/v1/users/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["data"]["nickname"] == "测试用户"

    update = client.patch(
        "/api/v1/users/me",
        headers=headers,
        json={"nickname": "世界旅行家", "username": "traveler_01"},
    )
    assert update.status_code == 200
    payload = update.json()["data"]
    assert payload["nickname"] == "世界旅行家"
    assert payload["username"] == "traveler_01"


def test_query_users_by_id_username_and_nickname() -> None:
    token, user_id = _register_and_get_token("users-query-001", "旅行者小王")
    headers = {"Authorization": f"Bearer {token}"}

    update = client.patch(
        "/api/v1/users/me",
        headers=headers,
        json={"username": "query_user"},
    )
    assert update.status_code == 200

    by_id = client.get(f"/api/v1/users/{user_id}", headers=headers)
    assert by_id.status_code == 200
    assert by_id.json()["data"]["id"] == user_id

    by_username = client.get("/api/v1/users/by-username/query_user", headers=headers)
    assert by_username.status_code == 200
    assert by_username.json()["data"]["id"] == user_id

    by_nickname = client.get("/api/v1/users/by-nickname/旅行", headers=headers)
    assert by_nickname.status_code == 200
    search_data = by_nickname.json()["data"]
    assert search_data["total"] >= 1
    assert any(item["id"] == user_id for item in search_data["users"])


def test_username_conflict_returns_409() -> None:
    token_a, _ = _register_and_get_token("users-conflict-a", "A用户")
    token_b, _ = _register_and_get_token("users-conflict-b", "B用户")

    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    first = client.patch(
        "/api/v1/users/me", headers=headers_a, json={"username": "same_name"}
    )
    assert first.status_code == 200

    second = client.patch(
        "/api/v1/users/me", headers=headers_b, json={"username": "same_name"}
    )
    assert second.status_code == 409


def test_upload_avatar_uses_dedicated_user_endpoint() -> None:
    token, _ = _register_and_get_token("users-avatar-001", "头像用户")
    headers = {"Authorization": f"Bearer {token}"}
    file_hash = "a" * 64

    response = client.post(
        "/api/v1/users/me/avatar",
        headers=headers,
        params={"file_hash": file_hash},
        files={"file": ("avatar.jpg", b"avatar-bytes", "image/jpeg")},
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["avatar_url"] == f"/uploads/avatars/{data['id']}/{file_hash}.jpg"

    legacy = client.post(
        "/api/v1/photos/upload/file",
        headers=headers,
        params={"file_hash": file_hash},
        files={"file": ("avatar.jpg", b"avatar-bytes", "image/jpeg")},
    )
    assert legacy.status_code == 404
