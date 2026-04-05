# 后端模块：照片与端侧视觉回写

## 1. 当前职责

- 基于 metadata 判断重复照片
- 批量写入照片记录
- 接收端侧视觉结果回写
- 支持照片重归类、批量删除、单张删除
- 在照片变化后刷新受影响事件

## 2. 代码入口

| 类型 | 文件 |
|---|---|
| 路由 | `backend/app/api/v1/photos.py` |
| 模型 | `backend/app/models/photo.py` |
| schema | `backend/app/schemas/photo.py` |
| 事件联动 | `backend/app/services/event_service.py` |
| 异步任务触发 | `backend/app/tasks/clustering_tasks.py` |

## 3. 当前接口

- `POST /api/v1/photos/check-duplicates-by-metadata`
- `POST /api/v1/photos/upload/metadata`
- `GET /api/v1/photos/`
- `GET /api/v1/photos/stats/summary`
- `GET /api/v1/photos/event/{event_id}`
- `GET /api/v1/photos/{photo_id}`
- `PATCH /api/v1/photos/{photo_id}`
- `POST /api/v1/photos/batch/reassign-event`
- `POST /api/v1/photos/batch/delete`
- `DELETE /api/v1/photos/{photo_id}`

## 4. 默认导入契约

### 4.1 初次写入

`upload/metadata` 当前主链路只接收：

- `assetId`
- `gpsLat / gpsLon`
- `shootTime`
- `width / height / fileSize`
- 可选 `vision`

移动端默认不会在这一步上传图片文件。

### 4.2 去重逻辑

- 先看 `assetId`
- 若无 `assetId`，则按 `shootTime ± 2s + GPS` 查重
- 同一用户维度隔离

## 5. 端侧视觉结果回写

移动端分析完成后会调用 `PATCH /photos/{id}` 更新：

- `visionStatus`
- `visionError`
- `vision`

路由会同步维护：

- `visual_desc`
- `emotion_tag`
- `vision_updated_at`

并触发：

- 受影响事件摘要刷新
- 结构变化标记
- 必要时自动请求新故事版本

## 6. 照片改动后的事件联动

以下操作都会联动事件：

- 调整 `eventId`
- 回写新的 `vision`
- 批量移动照片
- 批量删除照片
- 删除单张照片

联动步骤：

1. `refresh_event_summary()`
2. 必要时 `mark_events_structure_changed()`
3. `mark_event_pending_story_refresh()`
4. `trigger_event_story_task()`

## 7. 当前边界

- 历史上存在文件上传/OSS 主链路设计，但当前默认导入并不上传原图
- `thumbnail_url`、`object_key`、`storage_provider` 仍保留给头像/增强/未来扩展场景
