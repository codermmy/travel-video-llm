# 数据库 Schema 字典

> 以当前 `backend/app/models/` 为准。这里记录的是当前代码仍在使用或维护的表，不追踪已退出主链路的历史同步表。

## 1. 当前活动表

- `users`
- `photos`
- `events`
- `event_chapters`
- `photo_groups`
- `event_enhancement_assets`
- `async_tasks`
- `music`

## 2. 表关系概览

```text
users
  ├─ photos
  ├─ events
  └─ async_tasks

events
  ├─ photos
  ├─ event_chapters
  └─ photo_groups

event_enhancement_assets
  ├─ user_id -> users
  ├─ event_id -> events
  └─ photo_id -> photos (optional)
```

## 3. users

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `String(36)` | 主键 |
| `device_id` | `String(128)` | 设备 ID，唯一，可空 |
| `email` | `String(255)` | 邮箱，唯一，可空，当前主链路未使用 |
| `hashed_password` | `String(255)` | 密码哈希，可空 |
| `auth_type` | `String(50)` | 当前主要是 `device` |
| `email_verified` | `Boolean` | 邮箱是否验证 |
| `verification_code` | `String(6)` | 遗留邮箱验证码 |
| `verification_expires_at` | `DateTime` | 遗留邮箱验证码过期时间 |
| `reset_code` | `String(6)` | 遗留重置码 |
| `reset_code_expires_at` | `DateTime` | 遗留重置码过期时间 |
| `nickname` | `String(64)` | 昵称 |
| `avatar_url` | `String(512)` | 头像 URL |
| `username` | `String(64)` | 用户名，唯一，可空 |
| `created_at` | `DateTime` | 创建时间 |
| `updated_at` | `DateTime` | 更新时间 |

索引/约束：

- `device_id` unique + index
- `email` unique + index
- `username` unique + index

## 4. photos

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `String(36)` | 主键 |
| `user_id` | `String(36)` | 用户 ID |
| `event_id` | `String(36)` | 事件 ID，可空 |
| `asset_id` | `String(255)` | 系统相册 assetId |
| `file_hash` | `String(64)` | 文件哈希，可空，当前默认导入不依赖 |
| `local_path` | `String(500)` | 本地路径，可空 |
| `thumbnail_path` | `String(500)` | 本地缩略图路径，可空 |
| `thumbnail_url` | `String(500)` | 远端或相对缩略图地址，可空 |
| `storage_provider` | `String(20)` | 存储提供方，可空 |
| `object_key` | `String(500)` | OSS object key，可空 |
| `file_size` | `Integer` | 文件大小 |
| `width` | `Integer` | 宽 |
| `height` | `Integer` | 高 |
| `gps_lat` | `Numeric(10,7)` | 纬度 |
| `gps_lon` | `Numeric(10,7)` | 经度 |
| `shoot_time` | `DateTime` | 拍摄时间 |
| `status` | `String(20)` | `uploaded / clustered / noise` |
| `uri` | `String(2048)` | 遗留字段，当前主链路基本未使用 |
| `caption` | `String(100)` | 标题/简述 |
| `photo_index` | `Integer` | 事件内顺序 |
| `visual_desc` | `Text` | 视觉摘要 |
| `micro_story` | `String(100)` | 微故事 |
| `emotion_tag` | `String(20)` | 情绪标签 |
| `vision_result` | `JSON` | 端侧视觉结构化结果 |
| `vision_status` | `String(20)` | `pending / processing / completed / failed / unsupported` |
| `vision_error` | `Text` | 视觉错误信息 |
| `vision_updated_at` | `DateTime` | 视觉更新时间 |
| `created_at` | `DateTime` | 创建时间 |
| `updated_at` | `DateTime` | 更新时间 |

索引：

- `idx_photos_user_hash` unique on `(user_id, file_hash)`
- `idx_photos_shoot_time` on `shoot_time`
- `idx_photos_event` on `event_id`
- `user_id` 普通 index

## 5. events

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `String(36)` | 主键 |
| `user_id` | `String(36)` | 用户 ID |
| `title` | `String(256)` | 标题 |
| `location_name` | `String(100)` | 简化地点名 |
| `gps_lat` | `Numeric(10,7)` | 中心纬度 |
| `gps_lon` | `Numeric(10,7)` | 中心经度 |
| `start_time` | `DateTime` | 开始时间 |
| `end_time` | `DateTime` | 结束时间 |
| `photo_count` | `Integer` | 照片数 |
| `cover_photo_id` | `String(36)` | 封面照片 ID，无数据库 FK |
| `cover_photo_url` | `String(500)` | 封面 URL |
| `story_text` | `Text` | 摘要故事 |
| `full_story` | `Text` | 完整故事 |
| `detailed_location` | `String(200)` | 详细地点 |
| `location_tags` | `String(500)` | 地点标签文本 |
| `emotion_tag` | `String(20)` | 情绪标签 |
| `music_id` | `String(100)` | 音乐 ID，当前未建 FK |
| `music_url` | `String(500)` | 音乐 URL |
| `status` | `String(20)` | 运行态 |
| `event_version` | `Integer` | 结构版本号 |
| `story_generated_from_version` | `Integer` | 故事对应版本 |
| `story_requested_for_version` | `Integer` | 已请求生成的版本 |
| `story_freshness` | `String(20)` | `fresh / stale` |
| `slideshow_generated_from_version` | `Integer` | 幻灯片对应版本 |
| `slideshow_freshness` | `String(20)` | `fresh / stale` |
| `has_pending_structure_changes` | `Boolean` | 是否有待刷新的结构变化 |
| `title_manually_set` | `Boolean` | 标题是否手动编辑过 |
| `ai_error` | `Text` | 当前版本 AI 错误 |
| `created_at` | `DateTime` | 创建时间 |
| `updated_at` | `DateTime` | 更新时间 |

索引：

- `user_id` index

## 6. event_chapters

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `String(36)` | 主键 |
| `user_id` | `String(36)` | 用户 ID |
| `event_id` | `String(36)` | 事件 ID |
| `chapter_index` | `Integer` | 章节顺序 |
| `chapter_title` | `String(100)` | 章节标题 |
| `chapter_story` | `Text` | 章节正文 |
| `chapter_intro` | `String(200)` | 章节引子 |
| `chapter_summary` | `String(200)` | 章节总结 |
| `slideshow_caption` | `String(200)` | 幻灯片字幕 |
| `photo_start_index` | `Integer` | 覆盖起始照片索引 |
| `photo_end_index` | `Integer` | 覆盖结束照片索引 |
| `created_at` | `DateTime` | 创建时间 |

索引：

- `idx_chapters_event` on `(event_id, chapter_index)`
- `event_id` index
- `user_id` index

## 7. photo_groups

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `String(36)` | 主键 |
| `user_id` | `String(36)` | 用户 ID |
| `event_id` | `String(36)` | 事件 ID |
| `chapter_id` | `String(36)` | 章节 ID |
| `group_index` | `Integer` | 组顺序 |
| `group_theme` | `String(50)` | 组主题 |
| `group_emotion` | `String(20)` | 组情绪 |
| `group_scene_desc` | `Text` | 组场景描述 |
| `photo_start_index` | `Integer` | 起始照片索引 |
| `photo_end_index` | `Integer` | 结束照片索引 |
| `created_at` | `DateTime` | 创建时间 |

索引：

- `idx_photo_groups_chapter` on `(chapter_id, group_index)`
- `event_id` index
- `chapter_id` index
- `user_id` index

## 8. event_enhancement_assets

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `String(36)` | 主键 |
| `user_id` | `String(36)` | 用户 ID |
| `event_id` | `String(36)` | 事件 ID |
| `photo_id` | `String(36)` | 关联照片 ID，可空 |
| `local_path` | `String(500)` | 本地缓存路径 |
| `public_url` | `String(500)` | 对外 URL，可空 |
| `storage_provider` | `String(20)` | `local / oss` |
| `object_key` | `String(500)` | OSS key，可空 |
| `file_size` | `Integer` | 字节数 |
| `analysis_result` | `JSON` | 代表图分析结果，可空 |
| `expires_at` | `DateTime` | 过期时间 |
| `created_at` | `DateTime` | 创建时间 |
| `updated_at` | `DateTime` | 更新时间 |

索引：

- `user_id` index
- `event_id` index
- `expires_at` index

## 9. async_tasks

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `String(36)` | 主键 |
| `user_id` | `String(36)` | 用户 ID |
| `task_id` | `String(100)` | Celery task id，可空 |
| `task_type` | `String(50)` | 任务类型 |
| `status` | `String(20)` | 当前状态 |
| `stage` | `String(20)` | 当前阶段 |
| `progress` | `Integer` | 当前进度 |
| `total` | `Integer` | 总量 |
| `result` | `Text` | 文本结果 |
| `error` | `Text` | 错误文本 |
| `created_at` | `DateTime` | 创建时间 |
| `started_at` | `DateTime` | 开始时间 |
| `completed_at` | `DateTime` | 完成时间 |

索引：

- `task_id` index
- `user_id` index

## 10. music

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | `String(36)` | 主键 |
| `uri` | `String(2048)` | 音频 URI |
| `created_at` | `DateTime` | 创建时间 |

## 11. 遗留说明

- 历史迁移里可能仍然出现 `user_device_sync_states` 等旧表
- 当前模型层未声明这些表，当前 API 也没有使用对应能力
- 文档如需描述同步，只能标为“历史遗留/停用”
