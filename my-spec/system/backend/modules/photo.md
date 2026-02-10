# 后端模块：照片（Photo）

> **文档目的**：详细说明照片模块的 API、数据模型、业务流程和存储策略，帮助开发者快速理解和修改照片相关功能。

---

## 1. 模块概述

### 1.1 职责范围

- 照片元数据上传与存储
- 照片文件上传（OSS/本地）
- 哈希去重（SHA-256）
- 照片状态管理
- 照片查询与统计
- 触发后续聚类任务

### 1.2 代码入口

| 类型 | 文件路径 |
|------|----------|
| API 路由 | `backend/app/api/v1/photos.py` |
| 服务层 | `backend/app/services/photo_service.py` |
| 存储服务 | `backend/app/services/storage_service.py` |
| 数据模型 | `backend/app/models/photo.py` |
| Schema | `backend/app/schemas/photo.py` |

---

## 2. API 接口

### 2.1 检查重复照片

```
POST /api/v1/photos/check-duplicates
```

**用途**：上传前检查哪些照片已存在，避免重复上传

**请求体**：
```json
{
  "hashes": ["sha256_hash_1", "sha256_hash_2", ...]
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

**业务规则**：
- 基于 `(user_id, file_hash)` 联合唯一索引判断
- 返回已存在的哈希列表，前端跳过这些照片

---

### 2.2 上传照片元数据

```
POST /api/v1/photos/upload/metadata
```

**用途**：批量上传照片元数据，触发聚类任务

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
    "task_id": "uuid (if trigger_clustering=true)"
  }
}
```

**业务规则**：
- 单次最多 200 张
- 重复哈希自动跳过
- `trigger_clustering=true` 时触发 Celery 聚类任务

---

### 2.3 上传照片文件

```
POST /api/v1/photos/upload/file
```

**用途**：上传单张照片文件到存储服务

**请求**：`multipart/form-data`
- `file`: 照片文件
- `photo_id`: 照片 ID（可选，用于关联已有记录）

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

---

### 2.4 获取照片列表

```
GET /api/v1/photos/
```

**查询参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| `page` | int | 页码，默认 1 |
| `page_size` | int | 每页数量，默认 20，最大 100 |
| `event_id` | uuid | 按事件筛选 |
| `status` | string | 按状态筛选：`uploaded`/`clustered`/`noise` |
| `start_time` | datetime | 拍摄时间起始 |
| `end_time` | datetime | 拍摄时间结束 |

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      {
        "id": "uuid",
        "thumbnail_url": "https://...",
        "gps_lat": 39.9042,
        "gps_lon": 116.4074,
        "shoot_time": "2024-01-15T10:30:00Z",
        "status": "clustered",
        "event_id": "uuid"
      }
    ],
    "total": 1000,
    "page": 1,
    "page_size": 20
  }
}
```

---

### 2.5 获取事件照片

```
GET /api/v1/photos/event/{event_id}
```

**用途**：获取指定事件的所有照片，按 `photo_index` 排序

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "items": [
      {
        "id": "uuid",
        "thumbnail_url": "https://...",
        "photo_index": 0,
        "caption": "照片标题",
        "visual_desc": "视觉描述",
        "micro_story": "微故事"
      }
    ],
    "total": 50
  }
}
```

---

### 2.6 获取单张照片

```
GET /api/v1/photos/{photo_id}
```

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "uuid",
    "file_hash": "sha256_hash",
    "local_path": "/path/to/photo.jpg",
    "thumbnail_url": "https://...",
    "gps_lat": 39.9042,
    "gps_lon": 116.4074,
    "shoot_time": "2024-01-15T10:30:00Z",
    "status": "clustered",
    "event_id": "uuid",
    "caption": "照片标题",
    "visual_desc": "视觉描述",
    "micro_story": "微故事",
    "emotion_tag": "温馨"
  }
}
```

---

### 2.7 更新照片信息

```
PATCH /api/v1/photos/{photo_id}
```

**请求体**：
```json
{
  "caption": "新标题",
  "event_id": "uuid (可选，用于手动调整归属)"
}
```

---

### 2.8 删除照片

```
DELETE /api/v1/photos/{photo_id}
```

**业务规则**：
- 软删除或硬删除（根据配置）
- 同时删除 OSS 文件（可选）

---

### 2.9 照片统计

```
GET /api/v1/photos/stats/summary
```

**响应**：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "total_count": 5000,
    "clustered_count": 4800,
    "noise_count": 200,
    "total_size_bytes": 10240000000,
    "earliest_shoot_time": "2020-01-01T00:00:00Z",
    "latest_shoot_time": "2024-01-15T10:30:00Z"
  }
}
```

---

## 3. 数据模型

### 3.1 Photo 表

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | UUID | 主键 | PK |
| `user_id` | UUID | 用户 ID | FK → users, NOT NULL |
| `event_id` | UUID | 事件 ID | FK → events, 可空 |
| `file_hash` | String(64) | SHA-256 哈希 | NOT NULL |
| `local_path` | String | 本地路径 | 可空 |
| `thumbnail_path` | String | 缩略图本地路径 | 可空 |
| `thumbnail_url` | String | 缩略图 URL | 可空 |
| `storage_provider` | String | 存储提供商 | `local`/`oss` |
| `object_key` | String | OSS 对象键 | 可空 |
| `gps_lat` | Float | GPS 纬度 | 可空 |
| `gps_lon` | Float | GPS 经度 | 可空 |
| `shoot_time` | DateTime | 拍摄时间 | 可空 |
| `width` | Integer | 宽度（像素） | 可空 |
| `height` | Integer | 高度（像素） | 可空 |
| `file_size` | BigInteger | 文件大小（字节） | 可空 |
| `camera_make` | String | 相机品牌 | 可空 |
| `camera_model` | String | 相机型号 | 可空 |
| `status` | Enum | 状态 | `uploaded`/`clustered`/`noise` |
| `caption` | String | 标题 | 可空 |
| `photo_index` | Integer | 事件内排序索引 | 可空 |
| `visual_desc` | Text | 视觉描述（AI 生成） | 可空 |
| `micro_story` | Text | 微故事（AI 生成） | 可空 |
| `emotion_tag` | String | 情感标签 | 可空 |
| `created_at` | DateTime | 创建时间 | |
| `updated_at` | DateTime | 更新时间 | |

### 3.2 索引

| 索引名 | 字段 | 类型 | 说明 |
|--------|------|------|------|
| `ix_photos_user_hash` | `(user_id, file_hash)` | UNIQUE | 去重索引 |
| `ix_photos_shoot_time` | `shoot_time` | INDEX | 时间查询 |
| `ix_photos_event_id` | `event_id` | INDEX | 事件查询 |
| `ix_photos_status` | `status` | INDEX | 状态筛选 |

---

## 4. 照片状态机

```
┌─────────────────────────────────────────────────────────────┐
│                      照片状态流转                            │
└─────────────────────────────────────────────────────────────┘

                    ┌─────────────┐
                    │  uploaded   │  ← 初始状态（上传完成）
                    └──────┬──────┘
                           │
                           │ 聚类任务执行
                           │
              ┌────────────┴────────────┐
              │                         │
              ▼                         ▼
     ┌─────────────┐           ┌─────────────┐
     │  clustered  │           │    noise    │
     │ (已归属事件) │           │ (无法聚类)  │
     └─────────────┘           └─────────────┘
```

**状态说明**：
- `uploaded`：照片已上传，等待聚类
- `clustered`：照片已归属到某个事件
- `noise`：照片无法聚类（缺少 GPS/时间，或孤立点）

---

## 5. 上传流程

### 5.1 完整上传流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           移动端                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  1. 用户选择照片                                                         │
│     ↓                                                                   │
│  2. exifExtractor.ts                                                    │
│     ├─ 提取 GPS 坐标                                                    │
│     ├─ 提取拍摄时间                                                     │
│     └─ 提取相机信息                                                     │
│     ↓                                                                   │
│  3. photoHasher.ts                                                      │
│     └─ 计算 SHA-256 哈希                                                │
│     ↓                                                                   │
│  4. thumbnailGenerator.ts                                               │
│     └─ 生成 1080px 宽度缩略图                                           │
│     ↓                                                                   │
│  5. POST /photos/check-duplicates                                       │
│     └─ 获取需要上传的照片列表                                            │
│     ↓                                                                   │
│  6. 上传缩略图到 OSS（并行）                                             │
│     ↓                                                                   │
│  7. POST /photos/upload/metadata                                        │
│     └─ 批量上传元数据（每批 200 张）                                     │
│     ↓                                                                   │
│  8. 轮询任务状态                                                         │
│     └─ GET /tasks/status/{task_id}                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            后端                                          │
├─────────────────────────────────────────────────────────────────────────┤
│  9. photo_service.upload_photos()                                       │
│     ├─ 验证哈希唯一性                                                   │
│     ├─ 创建 Photo 记录（status: uploaded）                              │
│     └─ 触发聚类任务                                                     │
│     ↓                                                                   │
│  10. clustering_service.cluster_user_photos()                           │
│      ├─ 时空聚类                                                        │
│      ├─ 创建/更新 Event 记录                                            │
│      └─ 更新 Photo.event_id 和 status                                   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.2 去重逻辑

```python
# 伪代码
def check_duplicates(user_id: UUID, hashes: List[str]) -> Dict:
    existing = db.query(Photo).filter(
        Photo.user_id == user_id,
        Photo.file_hash.in_(hashes)
    ).all()

    existing_hashes = {p.file_hash for p in existing}
    new_hashes = [h for h in hashes if h not in existing_hashes]

    return {
        "existing_hashes": list(existing_hashes),
        "new_hashes": new_hashes
    }
```

---

## 6. 存储策略

### 6.1 存储提供商

| 提供商 | 配置 | 适用场景 |
|--------|------|----------|
| `local` | `STORAGE_PROVIDER=local` | 开发环境 |
| `oss` | `STORAGE_PROVIDER=oss` | 生产环境 |

### 6.2 OSS 目录结构

```
bucket/
├── photos/
│   └── {user_id}/
│       └── {year}/
│           └── {month}/
│               └── {file_hash}.jpg
└── thumbnails/
    └── {user_id}/
        └── {year}/
            └── {month}/
                └── {file_hash}_thumb.jpg
```

### 6.3 URL 生成

```python
# storage_service.py
def build_public_photo_url(object_key: str) -> str:
    if settings.STORAGE_PROVIDER == "oss":
        return f"https://{settings.OSS_BUCKET}.{settings.OSS_ENDPOINT}/{object_key}"
    else:
        return f"{settings.BASE_URL}/static/{object_key}"
```

---

## 7. 错误码

| 错误码 | HTTP 状态 | 说明 |
|--------|-----------|------|
| `PHOTO_001` | 400 | 照片哈希格式无效 |
| `PHOTO_002` | 400 | 单次上传超过 200 张限制 |
| `PHOTO_003` | 400 | 文件格式不支持 |
| `PHOTO_004` | 400 | 文件大小超过限制（10MB） |
| `PHOTO_005` | 404 | 照片不存在 |
| `PHOTO_006` | 403 | 无权访问该照片 |
| `PHOTO_007` | 500 | 存储服务上传失败 |

---

## 8. 性能约束

| 约束项 | 限制值 | 说明 |
|--------|--------|------|
| 单次上传数量 | 200 张 | 防止请求超时 |
| 单张文件大小 | 10 MB | 原图限制 |
| 缩略图宽度 | 1080 px | 保持清晰度同时减少传输 |
| 哈希算法 | SHA-256 | 64 字符十六进制 |

---

## 9. 测试要点

### 9.1 单元测试

```bash
cd backend && pytest tests/test_photos.py -v
```

**覆盖场景**：
- 去重检查（全新/部分重复/全部重复）
- 元数据上传成功
- 元数据上传超限
- 照片查询分页
- 照片状态更新

### 9.2 集成测试

- 完整上传流程（去重 → 上传 → 聚类）
- OSS 上传成功/失败
- 并发上传去重正确性

---

## 10. 关联模块

| 模块 | 文档 | 关联说明 |
|------|------|----------|
| 前端上传 | `frontend/modules/upload.md` | 照片选择、EXIF 提取、上传进度 |
| 后端事件 | `backend/modules/event.md` | 聚类后照片归属事件 |
| 后端同步 | `backend/modules/sync.md` | 多设备照片同步 |
| 数据库字典 | `backend/database/schema-dictionary.md` | Photo 表字段定义 |

---

## 11. 变更影响

若本模块变更，需同步检查：

- [ ] `my-spec/system/frontend/modules/upload.md`
- [ ] `my-spec/system/backend/modules/event.md`
- [ ] `my-spec/system/backend/database/schema-dictionary.md`
- [ ] `my-spec/system/backend/api/INDEX.md`

---

> **最后更新**：2026-02-10
