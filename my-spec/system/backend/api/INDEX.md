# 后端 API 总表

## 1. 基础约定

### 1.1 base path

- `/api/v1`

### 1.2 响应格式

当前统一使用：

```json
{
  "success": true,
  "data": {},
  "message": null,
  "timestamp": "2026-04-05T00:00:00Z"
}
```

### 1.3 鉴权

- Bearer JWT
- 绝大多数移动端请求还会附带 `X-Device-Id`

## 2. 路由分组

| 模块 | 前缀 | 说明 |
|---|---|---|
| health | `/health` | 健康检查 |
| admin | `/admin` | 管理接口 |
| auth | `/auth` | 设备注册 |
| photos | `/photos` | 照片 metadata 与视觉回写 |
| events | `/events` | 事件、故事、地点、增强 |
| tasks | `/tasks` | 异步任务状态 |
| ai | `/ai` | 直接 AI 调试接口 |
| users | `/users` | 用户资料与头像 |

当前没有活动的 `/sync` 路由。

## 3. 端点列表

### 3.1 Health

| Method | Path | 鉴权 | 说明 |
|---|---|---|---|
| `GET` | `/api/v1/health` | 否 | 返回 `{"status":"ok"}` |

### 3.2 Auth

| Method | Path | 鉴权 | 说明 |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | 否 | 按 `device_id` 注册或恢复用户 |

### 3.3 Users

| Method | Path | 鉴权 | 说明 |
|---|---|---|---|
| `GET` | `/api/v1/users/me` | 是 | 当前用户资料 |
| `PATCH` | `/api/v1/users/me` | 是 | 更新昵称/用户名/头像 URL |
| `POST` | `/api/v1/users/me/avatar` | 是 | 上传头像 |
| `GET` | `/api/v1/users/by-username/{username}` | 是 | 按用户名查用户 |
| `GET` | `/api/v1/users/by-nickname/{nickname}` | 是 | 按昵称模糊查用户 |
| `GET` | `/api/v1/users/{user_id}` | 是 | 按 ID 查用户 |

### 3.4 Photos

| Method | Path | 鉴权 | 说明 |
|---|---|---|---|
| `POST` | `/api/v1/photos/check-duplicates-by-metadata` | 是 | metadata 去重 |
| `POST` | `/api/v1/photos/upload/metadata` | 是 | 批量写照片 metadata，必要时触发聚类 |
| `GET` | `/api/v1/photos/` | 是 | 照片列表 |
| `GET` | `/api/v1/photos/stats/summary` | 是 | 照片统计 |
| `GET` | `/api/v1/photos/event/{event_id}` | 是 | 指定事件照片 |
| `GET` | `/api/v1/photos/{photo_id}` | 是 | 单张照片详情 |
| `PATCH` | `/api/v1/photos/{photo_id}` | 是 | 更新照片归属、caption、vision |
| `POST` | `/api/v1/photos/batch/reassign-event` | 是 | 批量挪到事件/移出事件 |
| `POST` | `/api/v1/photos/batch/delete` | 是 | 批量删照片 |
| `DELETE` | `/api/v1/photos/{photo_id}` | 是 | 单张删除 |

### 3.5 Events

| Method | Path | 鉴权 | 说明 |
|---|---|---|---|
| `POST` | `/api/v1/events/` | 是 | 新建事件并挂入照片 |
| `GET` | `/api/v1/events/` | 是 | 事件列表 |
| `GET` | `/api/v1/events/stats` | 是 | 事件统计 |
| `GET` | `/api/v1/events/location-search/cities` | 否 | 搜索城市 |
| `GET` | `/api/v1/events/location-search/places` | 否 | 搜索地点 |
| `GET` | `/api/v1/events/enhancement-storage/summary` | 是 | 增强素材汇总 |
| `DELETE` | `/api/v1/events/enhancement-storage` | 是 | 清空增强素材 |
| `GET` | `/api/v1/events/{event_id}` | 是 | 事件详情 |
| `POST` | `/api/v1/events/{event_id}/regenerate-story` | 是 | 手动重生成故事 |
| `POST` | `/api/v1/events/{event_id}/enhance-story` | 是 | 上传或复用代表图生成增强故事 |
| `PATCH` | `/api/v1/events/{event_id}` | 是 | 更新标题、地点等 |
| `DELETE` | `/api/v1/events/{event_id}` | 是 | 删除事件 |

### 3.6 Tasks

| Method | Path | 鉴权 | 说明 |
|---|---|---|---|
| `GET` | `/api/v1/tasks/status/{task_id}` | 是 | 查询异步任务进度 |

### 3.7 AI

| Method | Path | 鉴权 | 说明 |
|---|---|---|---|
| `POST` | `/api/v1/ai/analyze-photos` | 否 | 直接调用 AI 图像分析 |
| `POST` | `/api/v1/ai/generate-story` | 否 | 直接调用 AI 故事生成 |

### 3.8 Admin

| Method | Path | 鉴权 | 说明 |
|---|---|---|---|
| `POST` | `/api/v1/admin/recluster` | `X-Admin-Key` | 管理员重聚类 |

## 4. 前端主链路依赖

### 4.1 App 启动

- `POST /auth/register`

### 4.2 导入

- `POST /photos/check-duplicates-by-metadata`
- `POST /photos/upload/metadata`
- `PATCH /photos/{id}`
- `GET /tasks/status/{taskId}`

### 4.3 浏览与编辑

- `GET /events/`
- `GET /events/{id}`
- `PATCH /events/{id}`
- `POST /photos/batch/reassign-event`
- `POST /photos/batch/delete`

### 4.4 个人资料

- `GET /users/me`
- `PATCH /users/me`
- `POST /users/me/avatar`
