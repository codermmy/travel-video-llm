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


def test_register_email_success() -> None:
    """测试邮箱注册成功场景。"""
    response = client.post(
        "/api/v1/auth/register-email",
        json={"email": "test@example.com", "password": "testPass123", "nickname": "EmailUser"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["email"] == "test@example.com"
    assert data["data"]["nickname"] == "EmailUser"
    assert data["data"]["is_new_user"] is True
    assert data["data"]["auth_type"] == "email"
    assert "token" in data["data"]


def test_register_email_duplicate() -> None:
    """测试邮箱重复注册场景。"""
    # 第一次注册
    first = client.post(
        "/api/v1/auth/register-email",
        json={"email": "duplicate@example.com", "password": "testPass123"},
    )
    assert first.status_code == 200

    # 第二次注册相同邮箱
    second = client.post(
        "/api/v1/auth/register-email",
        json={"email": "duplicate@example.com", "password": "anotherPass123"},
    )
    assert second.status_code == 409
    detail = second.json()["detail"]
    assert detail["code"] == "EMAIL_ALREADY_EXISTS"


def test_register_email_invalid_format() -> None:
    """测试邮箱格式校验。"""
    response = client.post(
        "/api/v1/auth/register-email",
        json={"email": "invalid-email", "password": "testPass123"},
    )
    assert response.status_code == 422


def test_register_email_weak_password() -> None:
    """测试密码强度校验。"""
    # 密码太短
    response = client.post(
        "/api/v1/auth/register-email",
        json={"email": "test2@example.com", "password": "short1"},
    )
    assert response.status_code == 422

    # 密码不含数字
    response = client.post(
        "/api/v1/auth/register-email",
        json={"email": "test3@example.com", "password": "onlyletters"},
    )
    assert response.status_code == 422

    # 密码不含字母
    response = client.post(
        "/api/v1/auth/register-email",
        json={"email": "test4@example.com", "password": "12345678"},
    )
    assert response.status_code == 422


def test_login_email_success() -> None:
    """测试邮箱登录成功场景。"""
    # 先注册
    client.post(
        "/api/v1/auth/register-email",
        json={"email": "login@example.com", "password": "loginPass123", "nickname": "LoginUser"},
    )

    # 登录
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "login@example.com", "password": "loginPass123"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert data["data"]["email"] == "login@example.com"
    assert data["data"]["is_new_user"] is False
    assert "token" in data["data"]


def test_login_email_user_not_found() -> None:
    """测试账号不存在场景。"""
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "nonexistent@example.com", "password": "testPass123"},
    )
    assert response.status_code == 401
    detail = response.json()["detail"]
    assert detail["code"] == "USER_NOT_FOUND"


def test_login_email_wrong_password() -> None:
    """测试密码错误场景。"""
    # 先注册
    client.post(
        "/api/v1/auth/register-email",
        json={"email": "wrongpass@example.com", "password": "correctPass123"},
    )

    # 错误密码登录
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "wrongpass@example.com", "password": "wrongPass123"},
    )
    assert response.status_code == 401
    detail = response.json()["detail"]
    assert detail["code"] == "INVALID_PASSWORD"


def test_email_case_insensitive() -> None:
    """测试邮箱大小写不敏感。"""
    # 注册小写邮箱
    client.post(
        "/api/v1/auth/register-email",
        json={"email": "case@example.com", "password": "testPass123"},
    )

    # 用大写邮箱登录
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "CASE@EXAMPLE.COM", "password": "testPass123"},
    )
    assert response.status_code == 200
