from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401
from app.db.base import Base
from app.db.session import get_db
from app.models.task import AsyncTask
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


def _register_and_get_token(device_id: str = "tasks-test-device-001") -> str:
    resp = client.post("/api/v1/auth/register", json={"device_id": device_id})
    assert resp.status_code == 200
    data = resp.json()["data"]
    return data["token"]


def test_task_status_api() -> None:
    token = _register_and_get_token()
    headers = {"Authorization": f"Bearer {token}"}

    db: Session = TestingSessionLocal()
    try:
        user = db.scalar(select(User).where(User.device_id == "tasks-test-device-001"))
        assert user is not None

        task = AsyncTask(
            user_id=user.id,
            task_id="celery-task-001",
            task_type="clustering",
            status="success",
            progress=100,
            total=3,
            result="创建了 1 个事件",
            error=None,
        )
        db.add(task)
        db.commit()
    finally:
        db.close()

    resp = client.get("/api/v1/tasks/status/celery-task-001", headers=headers)
    assert resp.status_code == 200
    data = resp.json()["data"]
    assert data["taskId"] == "celery-task-001"
    assert data["taskType"] == "clustering"
    assert data["status"] == "success"
    assert data["progress"] == 100
    assert data["total"] == 3
    assert data["result"] == "创建了 1 个事件"
