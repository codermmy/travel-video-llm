# 后端模块：异步任务

## 1. 当前职责

- 为聚类、故事生成、增强故事生成创建任务记录
- 通过 `tasks/status/{taskId}` 暴露轮询状态
- 在 Celery worker 中推进阶段和结果

## 2. 代码入口

| 类型 | 文件 |
|---|---|
| 任务查询路由 | `backend/app/api/v1/tasks.py` |
| Celery app | `backend/app/tasks/celery_app.py` |
| 任务编排 | `backend/app/tasks/clustering_tasks.py` |
| 模型 | `backend/app/models/task.py` |

## 3. 当前任务类型

- `clustering`
- `ai_story`
- `event_enhancement`

## 4. 当前阶段

- `pending`
- `clustering`
- `geocoding`
- `ai`

## 5. 触发点

### 5.1 聚类任务

来源：

- `POST /api/v1/photos/upload/metadata`

触发函数：

- `trigger_clustering_task()`

### 5.2 事件故事任务

来源：

- 新事件聚类完成
- `POST /events/{id}/regenerate-story`
- 事件或照片结构变化后的自动刷新

触发函数：

- `trigger_event_story_task()`

### 5.3 增强故事任务

来源：

- `POST /events/{id}/enhance-story`

触发函数：

- `trigger_event_enhancement_task()`

## 6. in-memory 数据库特殊行为

如果当前数据库绑定是 in-memory：

- 不走 Celery
- 直接在请求进程内执行
- 返回结果可能没有真实的 Celery task id

这是测试和极简运行环境下的兼容逻辑。
