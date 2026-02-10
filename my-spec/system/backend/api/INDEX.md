# 后端 API 目录

> **文档目的**：完整列出所有后端 API 端点，包括请求/响应格式、认证要求和错误码，作为前后端对接的权威参考。

---

## 1. API 概览

### 1.1 基础信息

| 项目 | 值 |
|------|-----|
| 基础路径 | `/api/v1` |
| 认证方式 | Bearer Token (JWT) |
| 响应格式 | JSON |
| 字符编码 | UTF-8 |

### 1.2 通用响应格式

**成功响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": { ... }
}
```

**错误响应**：
```json
{
  "code": 1001,
  "message": "error_message",
  "detail": "详细错误信息"
}
```

### 1.3 路由模块

| 模块 | 前缀 | 说明 |
|------|------|------|
| health | `/` | 健康检查 |
| admin | `/admin` | 管理接口 |
| auth | `/auth` | 认证相关 |
| photos | `/photos` | 照片管理 |
| events | `/events` | 事件管理 |
| tasks | `/tasks` | 异步任务 |
| ai | `/ai` | AI 服务 |
| users | `/users` | 用户管理 |
| sync | `/sync` | 多设备同步 |

---

## 2. 健康检查 (Health)

### 2.1 健康检查

```
GET /api/v1/health
```

**认证**：不需要

**响应**：
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

---

## 3. 认证模块 (Auth)

### 3.1 设备注册

```
POST /api/v1/auth/register
```

**认证**：不需要

**请求体**：
```json
{
  "device_id": "uuid-string",
  "nickname": "用户昵称 (可选)"
}
```

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "token": "jwt_token",
    "user_id": "uuid",
    "device_id": "uuid",
    "email": null,
    "nickname": "用户昵称",
    "created_at": "2024-01-15T10:30:00Z",
    "is_new_user": true,
    "auth_type": "device"
  }
}
```

### 3.2 邮箱注册

```
POST /api/v1/auth/register-email
```

**认证**：不需要

**请求体**：
```json
{
  "email": "user@example.com",
  "password": "password123",
  "verification_code": "123456",
  "nickname": "用户昵称 (可选)"
}
```

**响应**：同设备注册，`auth_type` 为 `email`

### 3.3 邮箱登录

```
POST /api/v1/auth/login
```

**认证**：不需要

**请求体**：
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**响应**：同设备注册

### 3.4 发送验证码

```
POST /api/v1/auth/send-verification-code
```

**认证**：不需要

**请求体**：
```json
{
  "email": "user@example.com",
  "purpose": "register"
}
```

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "message": "验证码已发送"
  }
}
```

### 3.5 验证邮箱

```
POST /api/v1/auth/verify-email
```

**认证**：不需要

**请求体**：
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

### 3.6 发送重置密码验证码

```
POST /api/v1/auth/send-reset-code
```

**认证**：不需要

**请求体**：
```json
{
  "email": "user@example.com"
}
```

### 3.7 重置密码

```
POST /api/v1/auth/reset-password
```

**认证**：不需要

**请求体**：
```json
{
  "email": "user@example.com",
  "code": "123456",
  "new_password": "newpassword123"
}
```

### 3.8 获取当前用户

```
GET /api/v1/auth/me
```

**认证**：需要

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "user_id": "uuid",
    "email": "user@example.com",
    "nickname": "用户昵称",
    "avatar_url": "https://...",
    "auth_type": "email",
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

### 3.9 退出登录

```
POST /api/v1/auth/logout
```

**认证**：需要

**响应**：
```json
{
  "code": 0,
  "message": "success"
}
```

---

## 4. 照片模块 (Photos)

### 4.1 检查重复照片

```
POST /api/v1/photos/check-duplicates
```

**认证**：需要

**请求体**：
```json
{
  "hashes": ["sha256_hash_1", "sha256_hash_2"]
}
```

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "existing_hashes": ["sha256_hash_1"],
    "new_hashes": ["sha256_hash_2"]
  }
}
```

### 4.2 上传照片元数据

```
POST /api/v1/photos/upload/metadata
```

**认证**：需要

**请求体**：
```json
{
  "photos": [
    {
      "file_hash": "sha256_hash",
      "local_path": "/path/to/photo.jpg",
      "thumbnail_url": "https://oss.example.com/thumb.jpg",
      "gps_lat": 39.9042,
      "gps_lon": 116.4074,
      "shoot_time": "2024-01-15T10:30:00Z",
      "width": 4032,
      "height": 3024,
      "file_size": 2048000,
      "camera_make": "Apple",
      "camera_model": "iPhone 15 Pro"
    }
  ],
  "trigger_clustering": true
}
```

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "uploaded_count": 50,
    "skipped_count": 5,
    "task_id": "uuid"
  }
}
```

### 4.3 上传照片文件

```
POST /api/v1/photos/upload/file
```

**认证**：需要

**请求**：`multipart/form-data`
- `file`: 照片文件
- `photo_id`: 照片 ID（可选）

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "photo_id": "uuid",
    "object_key": "photos/user_id/2024/01/hash.jpg",
    "url": "https://oss.example.com/photos/..."
  }
}
```

### 4.4 获取照片列表

```
GET /api/v1/photos/
```

**认证**：需要

**查询参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `page` | int | 页码，默认 1 |
| `page_size` | int | 每页数量，默认 20，最大 100 |
| `event_id` | uuid | 按事件筛选 |
| `status` | string | 按状态筛选 |
| `start_time` | datetime | 拍摄时间起始 |
| `end_time` | datetime | 拍摄时间结束 |

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [...],
    "total": 1000,
    "page": 1,
    "page_size": 20
  }
}
```

### 4.5 获取事件照片

```
GET /api/v1/photos/event/{event_id}
```

**认证**：需要

### 4.6 获取单张照片

```
GET /api/v1/photos/{photo_id}
```

**认证**：需要

### 4.7 更新照片信息

```
PATCH /api/v1/photos/{photo_id}
```

**认证**：需要

**请求体**：
```json
{
  "caption": "新标题",
  "event_id": "uuid"
}
```

### 4.8 删除照片

```
DELETE /api/v1/photos/{photo_id}
```

**认证**：需要

### 4.9 照片统计

```
GET /api/v1/photos/stats/summary
```

**认证**：需要

---

## 5. 事件模块 (Events)

### 5.1 获取事件列表

```
GET /api/v1/events/
```

**认证**：需要

**查询参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `page` | int | 页码，默认 1 |
| `page_size` | int | 每页数量，默认 20 |
| `status` | string | 按状态筛选 |

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      {
        "id": "uuid",
        "title": "北京三日游",
        "location_name": "北京市",
        "start_time": "2024-01-15T08:00:00Z",
        "end_time": "2024-01-17T20:00:00Z",
        "photo_count": 50,
        "cover_photo_url": "https://...",
        "status": "generated",
        "story_text": "故事摘要..."
      }
    ],
    "total": 20,
    "page": 1,
    "page_size": 20,
    "total_pages": 1
  }
}
```

### 5.2 获取事件详情

```
GET /api/v1/events/{event_id}
```

**认证**：需要

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "uuid",
    "title": "北京三日游",
    "location_name": "北京市",
    "detailed_location": "北京市朝阳区...",
    "location_tags": ["故宫", "天安门"],
    "gps_lat": 39.9042,
    "gps_lon": 116.4074,
    "start_time": "2024-01-15T08:00:00Z",
    "end_time": "2024-01-17T20:00:00Z",
    "photo_count": 50,
    "cover_photo_url": "https://...",
    "story_text": "故事摘要",
    "full_story": "完整故事...",
    "emotion_tag": "温馨",
    "music_url": "https://...",
    "status": "generated",
    "chapters": [
      {
        "id": "uuid",
        "chapter_index": 0,
        "chapter_title": "出发",
        "chapter_story": "章节故事...",
        "chapter_intro": "章节引言",
        "chapter_summary": "章节总结",
        "slideshow_caption": "幻灯片字幕",
        "photo_start_index": 0,
        "photo_end_index": 15
      }
    ],
    "photo_groups": [
      {
        "id": "uuid",
        "group_index": 0,
        "group_theme": "组主题",
        "group_emotion": "欢乐",
        "photo_start_index": 0,
        "photo_end_index": 5
      }
    ],
    "photos": [
      {
        "id": "uuid",
        "thumbnail_url": "https://...",
        "photo_url": "https://...",
        "photo_index": 0,
        "shoot_time": "2024-01-15T10:30:00Z",
        "caption": "照片标题",
        "micro_story": "微故事"
      }
    ]
  }
}
```

### 5.3 重新生成故事

```
POST /api/v1/events/{event_id}/regenerate-story
```

**认证**：需要

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "task_id": "uuid",
    "status": "ai_pending"
  }
}
```

### 5.4 更新事件信息

```
PATCH /api/v1/events/{event_id}
```

**认证**：需要

**请求体**：
```json
{
  "title": "新标题",
  "cover_photo_id": "uuid"
}
```

### 5.5 删除事件

```
DELETE /api/v1/events/{event_id}
```

**认证**：需要

---

## 6. 任务模块 (Tasks)

### 6.1 获取任务状态

```
GET /api/v1/tasks/status/{task_id}
```

**认证**：需要

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "task_id": "uuid",
    "task_type": "clustering",
    "status": "running",
    "stage": "clustering",
    "progress": 50,
    "total": 100,
    "result": null,
    "error": null,
    "created_at": "2024-01-15T10:30:00Z",
    "started_at": "2024-01-15T10:30:05Z",
    "completed_at": null
  }
}
```

**任务状态**：
- `pending`：等待执行
- `running`：执行中
- `completed`：已完成
- `failed`：失败

**任务阶段**：
- `pending`：等待
- `clustering`：聚类中
- `geocoding`：地理编码中
- `ai`：AI 生成中

---

## 7. AI 模块 (AI)

### 7.1 生成事件故事

```
POST /api/v1/ai/generate-story
```

**认证**：需要

**请求体**：
```json
{
  "event_id": "uuid"
}
```

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "task_id": "uuid"
  }
}
```

### 7.2 分析照片

```
POST /api/v1/ai/analyze-photo
```

**认证**：需要

**请求体**：
```json
{
  "photo_id": "uuid"
}
```

---

## 8. 用户模块 (Users)

### 8.1 获取用户资料

```
GET /api/v1/users/profile
```

**认证**：需要

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "user_id": "uuid",
    "email": "user@example.com",
    "nickname": "用户昵称",
    "avatar_url": "https://...",
    "username": "username",
    "created_at": "2024-01-15T10:30:00Z"
  }
}
```

### 8.2 更新用户资料

```
PATCH /api/v1/users/profile
```

**认证**：需要

**请求体**：
```json
{
  "nickname": "新昵称",
  "avatar_url": "https://..."
}
```

---

## 9. 同步模块 (Sync)

### 9.1 获取同步状态

```
GET /api/v1/sync/status
```

**认证**：需要

**Headers**：
```
X-Device-Id: <device_uuid>
```

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "device_id": "uuid",
    "is_first_sync_on_device": true,
    "needs_sync": true,
    "cloud": {
      "event_count": 20,
      "photo_count": 500,
      "cursor": "2024-01-15T10:30:00Z"
    },
    "device": {
      "last_pull_cursor": null,
      "last_pull_at": null
    },
    "server_time": "2024-01-15T12:00:00Z"
  }
}
```

### 9.2 拉取云端数据

```
POST /api/v1/sync/pull
```

**认证**：需要

**Headers**：
```
X-Device-Id: <device_uuid>
```

**请求体**：
```json
{
  "mode": "metadata_only",
  "since_cursor": "2024-01-15T10:30:00Z"
}
```

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "mode": "metadata_only",
    "events": [...],
    "deleted_event_ids": ["uuid1", "uuid2"],
    "new_cursor": "2024-01-16T08:00:00Z",
    "stats": {
      "pulled_events": 5,
      "cloud_event_count": 20
    }
  }
}
```

### 9.3 确认同步完成

```
POST /api/v1/sync/ack
```

**认证**：需要

**Headers**：
```
X-Device-Id: <device_uuid>
```

**请求体**：
```json
{
  "cursor": "2024-01-16T08:00:00Z"
}
```

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "ok": true
  }
}
```

---

## 10. 管理模块 (Admin)

### 10.1 系统状态

```
GET /api/v1/admin/status
```

**认证**：需要（管理员）

### 10.2 用户列表

```
GET /api/v1/admin/users
```

**认证**：需要（管理员）

---

## 11. 错误码汇总

### 11.1 通用错误码

| 错误码 | HTTP 状态 | 说明 |
|--------|-----------|------|
| `0` | 200 | 成功 |
| `1001` | 400 | 请求参数错误 |
| `1002` | 401 | 未认证 |
| `1003` | 403 | 无权限 |
| `1004` | 404 | 资源不存在 |
| `1005` | 500 | 服务器内部错误 |

### 11.2 认证错误码

| 错误码 | 说明 |
|--------|------|
| `AUTH_001` | Token 无效或过期 |
| `AUTH_002` | 用户不存在 |
| `AUTH_003` | 密码错误 |
| `AUTH_004` | 邮箱已被注册 |
| `AUTH_005` | 验证码错误或过期 |
| `AUTH_006` | 设备 ID 无效 |

### 11.3 照片错误码

| 错误码 | 说明 |
|--------|------|
| `PHOTO_001` | 照片哈希格式无效 |
| `PHOTO_002` | 单次上传超过 200 张限制 |
| `PHOTO_003` | 文件格式不支持 |
| `PHOTO_004` | 文件大小超过限制 |
| `PHOTO_005` | 照片不存在 |
| `PHOTO_006` | 无权访问该照片 |
| `PHOTO_007` | 存储服务上传失败 |

### 11.4 事件错误码

| 错误码 | 说明 |
|--------|------|
| `EVENT_001` | 事件不存在 |
| `EVENT_002` | 无权访问该事件 |
| `EVENT_003` | 事件状态不允许此操作 |
| `EVENT_004` | AI 生成失败 |

### 11.5 同步错误码

| 错误码 | 说明 |
|--------|------|
| `SYNC_001` | 缺少 X-Device-Id 头 |
| `SYNC_002` | 游标格式无效 |
| `SYNC_003` | 用户不存在 |
| `SYNC_004` | 同步服务内部错误 |

---

## 12. 认证说明

### 12.1 Token 获取

通过以下接口获取 Token：
- `POST /api/v1/auth/register`（设备注册）
- `POST /api/v1/auth/register-email`（邮箱注册）
- `POST /api/v1/auth/login`（邮箱登录）

### 12.2 Token 使用

在需要认证的接口中，添加 Header：
```
Authorization: Bearer <token>
```

### 12.3 Token 有效期

- 默认有效期：30 天
- 过期后需重新登录

---

## 13. 关联文档

| 模块 | 文档 |
|------|------|
| 认证模块详情 | `backend/modules/auth.md` |
| 照片模块详情 | `backend/modules/photo.md` |
| 事件模块详情 | `backend/modules/event.md` |
| 同步模块详情 | `backend/modules/sync.md` |
| 地图模块详情 | `backend/modules/map.md` |
| 数据库字典 | `backend/database/schema-dictionary.md` |

---

> **最后更新**：2026-02-10
