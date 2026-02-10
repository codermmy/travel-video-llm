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


def _fetch_verification_code(email: str) -> str:
    db: Session = TestingSessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == email.lower()))
        assert user is not None
        assert user.verification_code is not None
        return user.verification_code
    finally:
        db.close()


def _fetch_reset_code(email: str) -> str:
    db: Session = TestingSessionLocal()
    try:
        user = db.scalar(select(User).where(User.email == email.lower()))
        assert user is not None
        assert user.reset_code is not None
        return user.reset_code
    finally:
        db.close()


def test_register_new_user() -> None:
    response = client.post(
        "/api/v1/auth/register",
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


def test_register_existing_user() -> None:
    first = client.post(
        "/api/v1/auth/register",
        json={"device_id": "test-device-existing-001", "nickname": "First"},
    )
    assert first.status_code == 200
    second = client.post(
        "/api/v1/auth/register",
        json={"device_id": "test-device-existing-001"},
    )
    assert second.status_code == 200
    data = second.json()["data"]
    assert data["device_id"] == "test-device-existing-001"
    assert data["is_new_user"] is False


def test_register_email_requires_code_and_succeeds() -> None:
    email = "test@example.com"

    send_res = client.post(
        "/api/v1/auth/send-verification-code",
        json={"email": email, "purpose": "register"},
    )
    assert send_res.status_code == 200

    code = _fetch_verification_code(email)

    register_res = client.post(
        "/api/v1/auth/register-email",
        json={
            "email": email,
            "password": "testPass123",
            "verification_code": code,
            "nickname": "EmailUser",
        },
    )
    assert register_res.status_code == 200
    data = register_res.json()["data"]
    assert data["email"] == email
    assert data["nickname"] == "EmailUser"
    assert data["is_new_user"] is True
    assert data["auth_type"] == "email"


def test_register_email_duplicate() -> None:
    email = "duplicate@example.com"
    client.post(
        "/api/v1/auth/send-verification-code",
        json={"email": email, "purpose": "register"},
    )
    code = _fetch_verification_code(email)

    first = client.post(
        "/api/v1/auth/register-email",
        json={"email": email, "password": "testPass123", "verification_code": code},
    )
    assert first.status_code == 200

    send_again = client.post(
        "/api/v1/auth/send-verification-code",
        json={"email": email, "purpose": "register"},
    )
    assert send_again.status_code == 409
    detail = send_again.json()["detail"]
    assert detail["code"] == "EMAIL_ALREADY_EXISTS"


def test_login_email_success() -> None:
    email = "login@example.com"
    client.post(
        "/api/v1/auth/send-verification-code",
        json={"email": email, "purpose": "register"},
    )
    code = _fetch_verification_code(email)
    client.post(
        "/api/v1/auth/register-email",
        json={"email": email, "password": "loginPass123", "verification_code": code},
    )

    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "loginPass123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["email"] == email
    assert data["data"]["is_new_user"] is False


def test_login_email_wrong_password() -> None:
    email = "wrongpass@example.com"
    client.post(
        "/api/v1/auth/send-verification-code",
        json={"email": email, "purpose": "register"},
    )
    code = _fetch_verification_code(email)
    client.post(
        "/api/v1/auth/register-email",
        json={"email": email, "password": "correctPass123", "verification_code": code},
    )

    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "wrongPass123"},
    )
    assert response.status_code == 401
    detail = response.json()["detail"]
    assert detail["code"] == "INVALID_PASSWORD"


def test_reset_password_flow() -> None:
    email = "reset@example.com"
    client.post(
        "/api/v1/auth/send-verification-code",
        json={"email": email, "purpose": "register"},
    )
    code = _fetch_verification_code(email)
    client.post(
        "/api/v1/auth/register-email",
        json={"email": email, "password": "oldPass123", "verification_code": code},
    )

    send_reset = client.post(
        "/api/v1/auth/send-reset-code",
        json={"email": email, "purpose": "reset_password"},
    )
    assert send_reset.status_code == 200

    reset_code = _fetch_reset_code(email)
    reset_res = client.post(
        "/api/v1/auth/reset-password",
        json={"email": email, "code": reset_code, "new_password": "newPass123"},
    )
    assert reset_res.status_code == 200

    login = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "newPass123"},
    )
    assert login.status_code == 200


def test_email_case_insensitive() -> None:
    email = "case@example.com"
    client.post(
        "/api/v1/auth/send-verification-code",
        json={"email": email, "purpose": "register"},
    )
    code = _fetch_verification_code(email)
    client.post(
        "/api/v1/auth/register-email",
        json={"email": email, "password": "testPass123", "verification_code": code},
    )

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "CASE@EXAMPLE.COM", "password": "testPass123"},
    )
    assert response.status_code == 200
