# 后端模块：事件、故事与增强

## 1. 当前职责

- 事件列表与详情查询
- 事件创建、编辑、删除
- 故事刷新与版本管理
- 地点搜索与手动回写
- 云端增强素材和增强故事任务

## 2. 代码入口

| 类型 | 文件 |
|---|---|
| 路由 | `backend/app/api/v1/events.py` |
| 事件服务 | `backend/app/services/event_service.py` |
| 增强服务 | `backend/app/services/event_enhancement_service.py` |
| 事件故事生成 | `backend/app/services/event_ai_service.py` |
| 地理信息兜底 | `backend/app/services/event_enrichment.py` |

## 3. 当前接口

- `POST /api/v1/events/`
- `GET /api/v1/events/`
- `GET /api/v1/events/stats`
- `GET /api/v1/events/location-search/cities`
- `GET /api/v1/events/location-search/places`
- `GET /api/v1/events/enhancement-storage/summary`
- `DELETE /api/v1/events/enhancement-storage`
- `GET /api/v1/events/{event_id}`
- `POST /api/v1/events/{event_id}/regenerate-story`
- `POST /api/v1/events/{event_id}/enhance-story`
- `PATCH /api/v1/events/{event_id}`
- `DELETE /api/v1/events/{event_id}`

## 4. 事件状态和版本

### 4.1 运行态

- `clustered`
- `waiting_for_vision`
- `ai_pending`
- `ai_processing`
- `generated`
- `ai_failed`

### 4.2 版本相关字段

- `event_version`
- `story_generated_from_version`
- `story_requested_for_version`
- `story_freshness`
- `slideshow_generated_from_version`
- `slideshow_freshness`
- `has_pending_structure_changes`

当前系统判断事件是否“真生成完成”，依赖上面这组字段，而不只是 `status`。

## 5. 详情拼装

`GET /events/{id}` 返回：

- 基础事件字段
- `photos`
- `chapters`
- `photoGroups`
- `enhancement`
- `visionSummary`

其中 `visionSummary` 会根据事件下所有照片的 `vision_status` 聚合得出。

## 6. 编辑后的自动刷新

### 6.1 会触发结构变化的字段

- `location_name`
- `gps_lat`
- `gps_lon`
- `detailed_location`
- `location_tags`

### 6.2 行为

1. `mark_events_structure_changed()`
2. 自动刷新摘要
3. 自动请求新的故事版本

## 7. 手动地点补全

事件页地点补全通过：

- `GET /events/location-search/cities`
- `GET /events/location-search/places`
- `PATCH /events/{id}`

如果用户只提交了经纬度，后端会用 AMap context 自动回填：

- `location_name`
- `detailed_location`
- `location_tags`

## 8. 增强故事

### 8.1 契约

- 接口：`POST /events/{id}/enhance-story`
- 可上传 3-5 张代表图
- 素材保留 7 天
- 也可 `reuseExisting=true`

### 8.2 当前状态

- 后端能力已完成
- 前端 API 已完成
- 移动端页面当前没有正式入口

## 9. 删除规则

删除事件时：

- 事件本身删除
- 关联照片不会删除
- 这些照片会回到 `event_id = null`
- 原 `clustered` 状态会回退为 `uploaded`
