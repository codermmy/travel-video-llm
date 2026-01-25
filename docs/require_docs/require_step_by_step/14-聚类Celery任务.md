# 任务 ID: 14 - 聚类 Celery 任务

## 📋 基本信息

| 项目 | 内容 |
|------|------|
| **任务名称** | 聚类 Celery 任务 |
| **所属阶段** | Stage-04 聚类算法 |
| **预估工期** | 1 天 |
| **前置条件** | Task-13 逆向地理编码 |

---

## 1. 任务目标

实现 Celery 异步任务，用于后台处理聚类、地理编码等耗时操作。

**核心功能**：
- Celery 应用配置
- 聚类任务定义
- 任务状态管理
- 任务进度查询

---

## 2. 前置条件

- [x] Task-13 已完成
- [x] Redis 已安装并运行

---

## 3. 实现细节

### 3.1 涉及文件

```
backend/
├── app/
│   ├── tasks/
│   │   ├── celery_app.py           # ✨ 新建：Celery 应用
│   │   └── clustering_tasks.py      # ✨ 新建：聚类任务
│   ├── models/
│   │   └── task.py                  # ✨ 新建：任务状态模型
│   └── api/
│       └── v1/
│           └── tasks.py             # ✨ 新建：任务状态接口
```

### 3.2 Celery 配置

#### `app/tasks/celery_app.py`

```python
"""
Celery 应用配置
"""
from celery import Celery
from app.config import get_settings

settings = get_settings()

# 创建 Celery 应用
celery_app = Celery(
    "travel_album",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks.clustering_tasks"]
)

# Celery 配置
celery_app.conf.update(
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    timezone='Asia/Shanghai',
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,  # 1小时超时
    worker_prefetch_multiplier=4,
)

# 自动发现任务
celery_app.autodiscover_tasks(['app.tasks'])
```

#### `app/tasks/__init__.py`

```python
"""
任务模块
"""
from app.tasks.celery_app import celery_app

__all__ = ['celery_app']
```

### 3.3 任务状态模型

#### `app/models/task.py`

```python
"""
异步任务状态模型
"""
from sqlalchemy import Column, Integer, String, DateTime, Text
from sqlalchemy.orm import relationship
from datetime import datetime

from app.models.base import Base


class AsyncTask(Base):
    """异步任务表"""

    __tablename__ = "async_tasks"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, index=True, nullable=False)
    task_id = Column(String(100), unique=True, index=True)  # Celery task ID
    task_type = Column(String(50), nullable=False)  # clustering, geocoding, ai_generation
    status = Column(String(20), default="pending")  # pending, started, success, failure
    progress = Column(Integer, default=0)  # 进度 0-100
    total = Column(Integer, default=0)  # 总数
    result = Column(Text)  # 结果数据（JSON）
    error = Column(Text)  # 错误信息
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)

    def __repr__(self):
        return f"<AsyncTask(id={self.id}, task_id={self.task_id}, status={self.status})>"
```

### 3.4 聚类任务

#### `app/tasks/clustering_tasks.py`

```python
"""
聚类相关的异步任务
"""
from celery import shared_task
from sqlalchemy.orm import Session
from datetime import datetime

from app.tasks.celery_app import celery_app
from app.models.base import SessionLocal
from app.models.task import AsyncTask
from app.models.photo import Photo
from app.services.clustering_service import cluster_user_photos, ClusteringConfig
from app.services.geocoding_service import geocoding_service


@celery_app.task(bind=True, name="tasks.cluster_user_photos")
def cluster_user_photos_task(self, user_id: int, task_id: int):
    """
    异步聚类用户照片

    Args:
        user_id: 用户 ID
        task_id: 数据库任务 ID

    Returns:
        创建的事件数量
    """
    # 更新任务状态
    db = SessionLocal()
    try:
        task = db.query(AsyncTask).filter(AsyncTask.id == task_id).first()
        if not task:
            return {"error": "任务不存在"}

        task.status = "started"
        task.started_at = datetime.utcnow()
        task.progress = 10
        db.commit()

        # 执行聚类
        events = cluster_user_photos(user_id, db)

        task.progress = 70

        # 更新地理位置
        if events:
            updated = geocoding_service.update_event_locations(user_id, db)
            task.progress = 90

        task.status = "success"
        task.completed_at = datetime.utcnow()
        task.progress = 100
        task.result = f"创建了 {len(events)} 个事件"
        db.commit()

        return {"event_count": len(events), "events": events}

    except Exception as e:
        task.status = "failure"
        task.error = str(e)
        task.completed_at = datetime.utcnow()
        db.commit()

        raise
    finally:
        db.close()


@shared_task
def update_event_location_task(event_id: int):
    """
    更新单个事件的地理位置

    Args:
        event_id: 事件 ID

    Returns:
        是否成功
    """
    db = SessionLocal()
    try:
        from app.models.event import Event

        event = db.query(Event).filter(Event.id == event_id).first()
        if not event or not event.gps_lat or not event.gps_lon:
            return False

        service = geocoding_service
        lat = float(event.gps_lat)
        lon = float(event.gps_lon)

        location_name = service.get_location_name(lat, lon)
        if location_name:
            event.location_name = location_name
            db.commit()
            return True

        return False

    except Exception as e:
        print(f"更新事件位置失败: {e}")
        return False
    finally:
        db.close()


@celery_app.task(name="tasks.process_new_photos")
def process_new_photos_task(user_id: int, photo_ids: list, task_id: int):
    """
    处理新上传的照片：聚类 + 地理编码

    Args:
        user_id: 用户 ID
        photo_ids: 照片 ID 列表
        task_id: 数据库任务 ID

    Returns:
        处理结果
    """
    db = SessionLocal()
    try:
        task = db.query(AsyncTask).filter(AsyncTask.id == task_id).first()
        if not task:
            return {"error": "任务不存在"}

        task.total = len(photo_ids)
        task.progress = 10

        # 执行聚类
        events = cluster_user_photos(user_id, db)
        task.progress = 60

        # 更新地理位置
        if events:
            geocoding_service.update_event_locations(user_id, db)

        task.status = "success"
        task.completed_at = datetime.utcnow()
        task.progress = 100
        task.result = f"处理了 {len(photo_ids)} 张照片，创建了 {len(events)} 个事件"
        db.commit()

        return {
            "photo_count": len(photo_ids),
            "event_count": len(events)
        }

    except Exception as e:
        task.status = "failure"
        task.error = str(e)
        task.completed_at = datetime.utcnow()
        db.commit()
        raise
    finally:
        db.close()


# 触发任务的辅助函数
def trigger_clustering_task(user_id: int, db: Session) -> str:
    """
    触发聚类任务

    Args:
        user_id: 用户 ID
        db: 数据库会话

    Returns:
        Celery 任务 ID
    """
    # 创建任务记录
    task = AsyncTask(
        user_id=user_id,
        task_type="clustering",
        status="pending",
        total=0
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    # 获取未聚类的照片数量
    photo_count = db.query(Photo).filter(
        Photo.user_id == user_id,
        Photo.status == "uploaded",
        Photo.event_id.is_(None)
    ).count()

    task.total = photo_count
    db.commit()

    # 触发异步任务
    result = process_new_photos_task.delay(user_id, [], task.id)

    # 更新 Celery 任务 ID
    task.task_id = result.id
    db.commit()

    return result.id
```

### 3.5 任务状态接口

#### `app/api/v1/tasks.py`

```python
"""
任务状态接口
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.models.base import get_db
from app.models.task import AsyncTask
from app.api.deps import CurrentUserIdDep
from datetime import datetime

router = APIRouter()


@router.get("/status/{task_id}")
async def get_task_status(
    task_id: str,
    user_id: CurrentUserIdDep,
    db: Session = Depends(get_db)
):
    """
    查询异步任务状态

    Args:
        task_id: Celery 任务 ID
        user_id: 当前用户 ID

    Returns:
        任务状态信息
    """
    # 查询任务
    task = db.query(AsyncTask).filter(
        AsyncTask.user_id == user_id,
        AsyncTask.task_id == task_id
    ).first()

    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    return {
        "success": True,
        "data": {
            "taskId": task.task_id,
            "taskType": task.task_type,
            "status": task.status,
            "progress": task.progress,
            "total": task.total,
            "result": task.result,
            "error": task.error,
            "createdAt": task.created_at.isoformat() if task.created_at else None,
            "startedAt": task.started_at.isoformat() if task.started_at else None,
            "completedAt": task.completed_at.isoformat() if task.completed_at else None,
        },
        "timestamp": datetime.utcnow().isoformat()
    }
```

---

## 4. 预期行为

### 4.1 任务流程

```
1. 照片上传完成
    ↓
2. 创建任务记录（status=pending）
    ↓
3. 触发 Celery 任务
    ↓
4. 任务执行（status=started, progress 更新）
    ↓
5. 任务完成（status=success, progress=100）
```

---

## 5. 启动 Celery Worker

```bash
# 在 backend 目录下执行
celery -A app.tasks.celery_app worker --loglevel=info
```

---

## 6. 完成检查清单

- [ ] `app/tasks/celery_app.py` 已实现
- [ ] `app/models/task.py` 已创建
- [ ] `app/tasks/clustering_tasks.py` 已实现
- [ ] `app/api/v1/tasks.py` 已实现
- [ ] Celery worker 能正常启动
- [ ] 任务能正常执行
- [ ] 代码符合开发规范

---

**Stage-04（聚类算法）完成！进入 [Task-15: AI 服务集成框架](./15-AI服务集成框架.md)**
