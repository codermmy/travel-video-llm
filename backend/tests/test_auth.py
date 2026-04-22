from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.db.base import Base
from app.db.session import get_db
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


def test_bootstrap_new_user() -> None:
    response = client.post(
        "/api/v1/auth/bootstrap",
        json={"device_id": "test-device-new-001", "nickname": "Tester"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["device_id"] == "test-device-new-001"
    assert data["data"]["nickname"] == "Tester"
    assert data["data"]["is_new_user"] is True
    assert "token" in data["data"]
    assert data["data"]["auth_type"] == "device"


def test_bootstrap_existing_user() -> None:
    first = client.post(
        "/api/v1/auth/bootstrap",
        json={"device_id": "test-device-existing-001", "nickname": "First"},
    )
    assert first.status_code == 200
    second = client.post(
        "/api/v1/auth/bootstrap",
        json={"device_id": "test-device-existing-001"},
    )
    assert second.status_code == 200
    data = second.json()["data"]
    assert data["device_id"] == "test-device-existing-001"
    assert data["is_new_user"] is False


def test_bootstrap_updates_authenticated_user_to_stable_device_id() -> None:
    first = client.post(
        "/api/v1/auth/bootstrap",
        json={"device_id": "legacy-random-device-id"},
    )
    assert first.status_code == 200
    first_data = first.json()["data"]

    second = client.post(
        "/api/v1/auth/bootstrap",
        headers={"Authorization": f"Bearer {first_data['token']}"},
        json={"device_id": "android:stable-device-001"},
    )
    assert second.status_code == 200
    second_data = second.json()["data"]
    assert second_data["user_id"] == first_data["user_id"]
    assert second_data["device_id"] == "android:stable-device-001"


def test_email_auth_routes_are_removed() -> None:
    routes = [
        "/api/v1/auth/send-verification-code",
        "/api/v1/auth/verify-email",
        "/api/v1/auth/register-email",
        "/api/v1/auth/login",
        "/api/v1/auth/send-reset-code",
        "/api/v1/auth/reset-password",
        "/api/v1/auth/send-verification-code-disabled",
        "/api/v1/auth/verify-email-disabled",
        "/api/v1/auth/register-email-disabled",
        "/api/v1/auth/login-disabled",
        "/api/v1/auth/send-reset-code-disabled",
        "/api/v1/auth/reset-password-disabled",
    ]

    for route in routes:
        response = client.post(route, json={})
        assert response.status_code == 404
