# 数据库 Schema 字典

> **文档目的**：完整记录所有数据库表的字段定义、索引、约束和关系，作为数据模型的权威参考。

---

## 1. 表关系总览

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           数据库 ER 图                                   │
└─────────────────────────────────────────────────────────────────────────┘

                              ┌─────────┐
                              │  users  │
                              └────┬────┘
                                   │
           ┌───────────────────────┼───────────────────────┐
           │                       │                       │
           ▼                       ▼                       ▼
    ┌─────────────┐         ┌─────────────┐      ┌──────────────────┐
    │   photos    │         │   events    │      │user_device_sync  │
    └──────┬──────┘         └──────┬──────┘      │    _states       │
           │                       │             └──────────────────┘
           │                       │
           │              ┌────────┴────────┐
           │              │                 │
           │              ▼                 ▼
           │       ┌─────────────┐   ┌─────────────┐
           │       │  chapters   │   │photo_groups │
           │       └─────────────┘   └─────────────┘
           │
           └──────────────────────────────────────────────┐
                                                          │
                                                          ▼
                                                   ┌─────────────┐
                                                   │ async_tasks │
                                                   └─────────────┘
```

---

## 2. users 表

用户账户信息。

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | UUID | 主键 | PK, DEFAULT uuid_generate_v4() |
| `device_id` | VARCHAR(255) | 设备 ID | UNIQUE, 可空 |
| `email` | VARCHAR(255) | 邮箱 | UNIQUE, 可空 |
| `hashed_password` | VARCHAR(255) | 密码哈希（bcrypt） | 可空 |
| `auth_type` | VARCHAR(20) | 认证类型 | NOT NULL, DEFAULT 'device' |
| `email_verified` | BOOLEAN | 邮箱是否验证 | NOT NULL, DEFAULT false |
| `verification_code` | VARCHAR(10) | 邮箱验证码 | 可空 |
| `verification_expires_at` | TIMESTAMP | 验证码过期时间 | 可空 |
| `reset_code` | VARCHAR(10) | 密码重置码 | 可空 |
| `reset_code_expires_at` | TIMESTAMP | 重置码过期时间 | 可空 |
| `nickname` | VARCHAR(100) | 昵称 | 可空 |
| `avatar_url` | VARCHAR(500) | 头像 URL | 可空 |
| `username` | VARCHAR(50) | 用户名 | UNIQUE, 可空 |
| `created_at` | TIMESTAMP | 创建时间 | NOT NULL, DEFAULT NOW() |
| `updated_at` | TIMESTAMP | 更新时间 | NOT NULL, DEFAULT NOW() |

**索引**：
- `ix_users_device_id` UNIQUE ON `device_id`
- `ix_users_email` UNIQUE ON `email`
- `ix_users_username` UNIQUE ON `username`

**auth_type 枚举值**：
- `device`：设备 ID 注册
- `email`：邮箱密码注册

---

## 3. photos 表

照片记录。

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | UUID | 主键 | PK |
| `user_id` | UUID | 用户 ID | FK → users(id), NOT NULL |
| `event_id` | UUID | 事件 ID | FK → events(id), 可空 |
| `file_hash` | VARCHAR(64) | SHA-256 哈希 | NOT NULL |
| `local_path` | VARCHAR(500) | 本地路径 | 可空 |
| `thumbnail_path` | VARCHAR(500) | 缩略图本地路径 | 可空 |
| `thumbnail_url` | VARCHAR(500) | 缩略图 URL | 可空 |
| `storage_provider` | VARCHAR(20) | 存储提供商 | 可空 |
| `object_key` | VARCHAR(500) | OSS 对象键 | 可空 |
| `gps_lat` | DOUBLE PRECISION | GPS 纬度 | 可空 |
| `gps_lon` | DOUBLE PRECISION | GPS 经度 | 可空 |
| `shoot_time` | TIMESTAMP | 拍摄时间 | 可空 |
| `width` | INTEGER | 宽度（像素） | 可空 |
| `height` | INTEGER | 高度（像素） | 可空 |
| `file_size` | BIGINT | 文件大小（字节） | 可空 |
| `camera_make` | VARCHAR(100) | 相机品牌 | 可空 |
| `camera_model` | VARCHAR(100) | 相机型号 | 可空 |
| `status` | VARCHAR(20) | 状态 | NOT NULL, DEFAULT 'uploaded' |
| `caption` | VARCHAR(500) | 标题 | 可空 |
| `photo_index` | INTEGER | 事件内排序索引 | 可空 |
| `visual_desc` | TEXT | 视觉描述（AI） | 可空 |
| `micro_story` | TEXT | 微故事（AI） | 可空 |
| `emotion_tag` | VARCHAR(50) | 情感标签 | 可空 |
| `created_at` | TIMESTAMP | 创建时间 | NOT NULL |
| `updated_at` | TIMESTAMP | 更新时间 | NOT NULL |

**索引**：
- `ix_photos_user_hash` UNIQUE ON `(user_id, file_hash)`
- `ix_photos_shoot_time` ON `shoot_time`
- `ix_photos_event_id` ON `event_id`
- `ix_photos_status` ON `status`
- `ix_photos_user_id` ON `user_id`

**status 枚举值**：
- `uploaded`：已上传，等待聚类
- `clustered`：已归属事件
- `noise`：无法聚类

**storage_provider 枚举值**：
- `local`：本地存储
- `oss`：阿里云 OSS

---

## 4. events 表

事件/旅行记录。

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | UUID | 主键 | PK |
| `user_id` | UUID | 用户 ID | FK → users(id), NOT NULL |
| `title` | VARCHAR(200) | 事件标题 | 可空 |
| `location_name` | VARCHAR(200) | 地点名称 | 可空 |
| `detailed_location` | VARCHAR(500) | 详细地点 | 可空 |
| `location_tags` | JSONB | 地点标签数组 | 可空 |
| `gps_lat` | DOUBLE PRECISION | 中心纬度 | 可空 |
| `gps_lon` | DOUBLE PRECISION | 中心经度 | 可空 |
| `start_time` | TIMESTAMP | 开始时间 | 可空 |
| `end_time` | TIMESTAMP | 结束时间 | 可空 |
| `photo_count` | INTEGER | 照片数量 | NOT NULL, DEFAULT 0 |
| `cover_photo_id` | UUID | 封面照片 ID | FK → photos(id), 可空 |
| `cover_photo_url` | VARCHAR(500) | 封面照片 URL | 可空 |
| `story_text` | TEXT | 故事摘要 | 可空 |
| `full_story` | TEXT | 完整故事 | 可空 |
| `emotion_tag` | VARCHAR(50) | 情感标签 | 可空 |
| `music_id` | UUID | 音乐 ID | FK → music(id), 可空 |
| `music_url` | VARCHAR(500) | 音乐 URL | 可空 |
| `status` | VARCHAR(20) | 状态 | NOT NULL, DEFAULT 'clustered' |
| `ai_error` | TEXT | AI 错误信息 | 可空 |
| `created_at` | TIMESTAMP | 创建时间 | NOT NULL |
| `updated_at` | TIMESTAMP | 更新时间 | NOT NULL |

**索引**：
- `ix_events_user_id` ON `user_id`
- `ix_events_status` ON `status`
- `ix_events_start_time` ON `start_time`

**status 枚举值**：
- `clustered`：聚类完成，等待 AI
- `ai_pending`：AI 任务已入队
- `ai_processing`：AI 正在处理
- `generated`：生成成功
- `ai_failed`：生成失败

---

## 5. event_chapters 表

事件章节。

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | UUID | 主键 | PK |
| `user_id` | UUID | 用户 ID | FK → users(id), NOT NULL |
| `event_id` | UUID | 事件 ID | FK → events(id), NOT NULL |
| `chapter_index` | INTEGER | 章节索引 | NOT NULL |
| `chapter_title` | VARCHAR(200) | 章节标题 | 可空 |
| `chapter_story` | TEXT | 章节故事 | 可空 |
| `chapter_intro` | TEXT | 章节简介 | 可空 |
| `chapter_summary` | TEXT | 章节摘要 | 可空 |
| `slideshow_caption` | VARCHAR(200) | 幻灯片字幕 | 可空 |
| `photo_start_index` | INTEGER | 照片起始索引 | 可空 |
| `photo_end_index` | INTEGER | 照片结束索引 | 可空 |
| `created_at` | TIMESTAMP | 创建时间 | NOT NULL |

**索引**：
- `ix_chapters_event_index` UNIQUE ON `(event_id, chapter_index)`
- `ix_chapters_event_id` ON `event_id`

---

## 6. photo_groups 表

照片组（章节内的子分组）。

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | UUID | 主键 | PK |
| `user_id` | UUID | 用户 ID | FK → users(id), NOT NULL |
| `event_id` | UUID | 事件 ID | FK → events(id), NOT NULL |
| `chapter_id` | UUID | 章节 ID | FK → chapters(id), NOT NULL |
| `group_index` | INTEGER | 组索引 | NOT NULL |
| `group_theme` | VARCHAR(100) | 组主题 | 可空 |
| `group_emotion` | VARCHAR(50) | 组情感 | 可空 |
| `group_scene_desc` | TEXT | 场景描述 | 可空 |
| `photo_start_index` | INTEGER | 照片起始索引 | 可空 |
| `photo_end_index` | INTEGER | 照片结束索引 | 可空 |
| `created_at` | TIMESTAMP | 创建时间 | NOT NULL |

**索引**：
- `ix_photo_groups_chapter_index` UNIQUE ON `(chapter_id, group_index)`
- `ix_photo_groups_chapter_id` ON `chapter_id`

---

## 7. user_device_sync_states 表

用户设备同步状态。

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | UUID | 主键 | PK |
| `user_id` | UUID | 用户 ID | FK → users(id), NOT NULL |
| `device_id` | VARCHAR(255) | 设备 ID | NOT NULL |
| `last_pull_cursor` | VARCHAR(255) | 上次拉取游标 | 可空 |
| `last_pull_at` | TIMESTAMP | 上次拉取时间 | 可空 |
| `last_prompt_at` | TIMESTAMP | 上次提示时间 | 可空 |
| `created_at` | TIMESTAMP | 创建时间 | NOT NULL |
| `updated_at` | TIMESTAMP | 更新时间 | NOT NULL |

**索引**：
- `ix_sync_states_user_device` UNIQUE ON `(user_id, device_id)`

---

## 8. async_tasks 表

异步任务记录。

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | UUID | 主键 | PK |
| `user_id` | UUID | 用户 ID | FK → users(id), NOT NULL |
| `task_id` | VARCHAR(255) | 任务标识 | NOT NULL |
| `task_type` | VARCHAR(50) | 任务类型 | NOT NULL |
| `status` | VARCHAR(20) | 状态 | NOT NULL, DEFAULT 'pending' |
| `stage` | VARCHAR(50) | 阶段 | 可空 |
| `progress` | INTEGER | 进度 | 可空 |
| `total` | INTEGER | 总数 | 可空 |
| `result` | JSONB | 结果 | 可空 |
| `error` | TEXT | 错误信息 | 可空 |
| `created_at` | TIMESTAMP | 创建时间 | NOT NULL |
| `started_at` | TIMESTAMP | 开始时间 | 可空 |
| `completed_at` | TIMESTAMP | 完成时间 | 可空 |

**索引**：
- `ix_tasks_task_id` ON `task_id`
- `ix_tasks_user_id` ON `user_id`
- `ix_tasks_status` ON `status`

**task_type 枚举值**：
- `clustering`：照片聚类
- `ai_generation`：AI 故事生成
- `photo_upload`：照片上传

**status 枚举值**：
- `pending`：等待执行
- `running`：执行中
- `completed`：已完成
- `failed`：失败

**stage 枚举值**：
- `pending`：等待
- `clustering`：聚类中
- `geocoding`：地理编码中
- `ai`：AI 生成中

---

## 9. music 表

音乐资源（预留）。

| 字段 | 类型 | 说明 | 约束 |
|------|------|------|------|
| `id` | UUID | 主键 | PK |
| `uri` | VARCHAR(500) | 音乐 URI | NOT NULL |
| `title` | VARCHAR(200) | 标题 | 可空 |
| `artist` | VARCHAR(100) | 艺术家 | 可空 |
| `duration` | INTEGER | 时长（秒） | 可空 |
| `mood` | VARCHAR(50) | 情绪标签 | 可空 |
| `created_at` | TIMESTAMP | 创建时间 | NOT NULL |

---

## 10. 迁移文件

迁移文件位于 `backend/alembic/versions/`：

| 文件 | 说明 |
|------|------|
| `b1f2a3c4d5e6_add_auth_verification_fields.py` | 添加认证验证字段 |
| `c4d5e6f7a8b9_add_story_layers_and_chapters.py` | 添加故事层和章节 |
| `d2a1f8c4b001_add_user_profile_fields.py` | 添加用户资料字段 |
| `e3b2c4d5f601_add_photo_groups_and_story_fields.py` | 添加照片组和故事字段 |
| `f4a3b2c1d701_add_user_device_sync_states.py` | 添加设备同步状态 |

**运行迁移**：
```bash
cd backend
alembic upgrade head
```

**回滚迁移**：
```bash
cd backend
alembic downgrade -1
```

---

## 11. 数据约束总结

### 11.1 外键约束

| 表 | 字段 | 引用 | 删除行为 |
|------|------|------|----------|
| photos | user_id | users(id) | CASCADE |
| photos | event_id | events(id) | SET NULL |
| events | user_id | users(id) | CASCADE |
| events | cover_photo_id | photos(id) | SET NULL |
| event_chapters | event_id | events(id) | CASCADE |
| photo_groups | chapter_id | event_chapters(id) | CASCADE |
| user_device_sync_states | user_id | users(id) | CASCADE |
| async_tasks | user_id | users(id) | CASCADE |

### 11.2 唯一约束

| 表 | 字段 | 说明 |
|------|------|------|
| users | device_id | 设备 ID 唯一 |
| users | email | 邮箱唯一 |
| users | username | 用户名唯一 |
| photos | (user_id, file_hash) | 同用户同哈希唯一 |
| event_chapters | (event_id, chapter_index) | 同事件章节索引唯一 |
| photo_groups | (chapter_id, group_index) | 同章节组索引唯一 |
| user_device_sync_states | (user_id, device_id) | 同用户同设备唯一 |

---

## 12. 维护提示

字段、索引、约束有变化时，必须在变更归档前更新本文件。

---

> **最后更新**：2026-02-10
