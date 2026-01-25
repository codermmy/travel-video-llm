# 任务 ID: 16-17 - 图像内容识别与故事生成

## 📋 基本信息

| 项目 | 内容 |
|------|------|
| **任务名称** | 图像内容识别与故事生成 |
| **所属阶段** | Stage-05 AI 服务 |
| **预估工期** | 1 天 |
| **前置条件** | Task-15 AI 服务集成框架 |

---

## 1. 任务目标

实现基于 AI 的图像内容识别和故事文本生成功能。

**核心功能**：
- 图像内容识别（场景、物体、情感）
- 故事文本生成
- 情感标签推理
- 批量处理照片

---

## 2. 实现细节

### 涉及文件

```
backend/
├── app/
│   ├── tasks/
│   │   └── ai_tasks.py             # ✨ 新建：AI 任务
│   └── services/
│       └── ai_service.py           # ✏️ 修改：完善 AI 服务
```

### AI 任务（异步）

#### `app/tasks/ai_tasks.py`

```python
"""
AI 相关异步任务
"""
from celery import shared_task
from sqlalchemy.orm import Session
from datetime import datetime

from app.tasks.celery_app import celery_app
from app.models.base import SessionLocal
from app.models.task import AsyncTask
from app.services.ai_service import ai_service


@celery_app.task(name="tasks.generate_event_story")
def generate_event_story_task(event_id: int, task_id: int):
    """
    为事件生成故事的异步任务

    Args:
        event_id: 事件 ID
        task_id: 数据库任务 ID
    """
    db = SessionLocal()
    try:
        task = db.query(AsyncTask).filter(AsyncTask.id == task_id).first()
        if not task:
            return {"error": "任务不存在"}

        task.status = "started"
        task.started_at = datetime.utcnow()
        db.commit()

        # 获取事件信息
        from app.models.event import Event, Photo

        event = db.query(Event).filter(Event.id == event_id).first()
        if not event:
            raise Exception("事件不存在")

        # 获取事件照片
        photos = db.query(Photo).filter(Photo.event_id == event_id).all()

        # 选择要分析的照片
        photos_to_analyze = _select_photos_to_analyze(photos)

        # 分析照片
        photo_descriptions = []
        for photo in photos_to_analyze:
            # 如果缩略图 URL 存在，使用它
            image_url = photo.thumbnail_url or photo.local_path
            if not image_url:
                continue

            result = ai_service.client.analyze_image(image_url)
            if result:
                photo_descriptions.append(result.get("description", ""))

        if not photo_descriptions:
            photo_descriptions = ["美丽的旅行照片"]

        # 生成故事
        story_result = ai_service.generate_event_story(
            event_id=event_id,
            location=event.location_name or "未知地点",
            start_time=event.start_time.isoformat() if event.start_time else "",
            end_time=event.end_time.isoformat() if event.end_time else "",
            photo_descriptions=photo_descriptions
        )

        if story_result:
            # 更新事件
            event.title = story_result.get("title", "旅行事件")
            event.story_text = story_result.get("story", "")
            event.emotion_tag = story_result.get("emotion", "Calm")

            # 生成事件标题
            event.status = "generated"
            db.commit()

        task.status = "success"
        task.completed_at = datetime.utcnow()
        task.progress = 100
        task.result = f"故事生成完成"
        db.commit()

        return story_result

    except Exception as e:
        task.status = "failure"
        task.error = str(e)
        task.completed_at = datetime.utcnow()
        db.commit()
        raise
    finally:
        db.close()


def _select_photos_to_analyze(photos: list) -> list:
    """
    选择要分析的照片

    规则：
    - 照片 >= 10 张：取第 1、5、10 张
    - 照片 < 10 张：取首、中、尾 3 张
    """
    if len(photos) >= 10:
        indices = [0, 4, 9]  # 第 1、5、10 张（0-indexed）
        return [photos[i] for i in indices if i < len(photos)]
    else:
        # 首、中、尾
        mid = len(photos) // 2
        indices = [0, mid, len(photos) - 1]
        return [photos[i] for i in indices]


@shared_task
def batch_analyze_photos(photo_ids: list):
    """批量分析照片"""
    # TODO: 实现批量分析
    pass
```

---

## 3. 验收标准

- [ ] AI 任务能正常执行
- [ ] 图像识别返回合理结果
- [ ] 故事生成符合要求
- [ ] 情感标签准确

---

**Stage-05（AI 服务）完成！进入 [Task-18: expo-router 导航配置](./18-expo-router导航配置.md)**
