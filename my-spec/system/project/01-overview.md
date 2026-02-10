# 项目全局概览

> **文档目的**：让任何 AI 代理或新成员在 5 分钟内理解项目全貌，快速定位到需要修改的模块。

---

## 1. 项目定位

**旅行相册智能整理系统**（Travel Video LLM）

将用户手机相册中的旅行照片自动聚合成"事件"，为每个事件生成 AI 故事、匹配背景音乐，并在地图上展示足迹轨迹。支持跨设备同步，让用户在任何设备上都能回顾旅行记忆。

### 核心价值主张

| 痛点 | 解决方案 |
|------|----------|
| 照片太多，找不到旅行记忆 | 时空聚类自动分组 |
| 照片没有故事感 | AI 生成旅行故事和章节 |
| 想看足迹但没有工具 | 地图可视化事件位置 |
| 换设备后数据丢失 | 云端同步 + 多设备支持 |

---

## 2. 技术栈

### 2.1 移动端（mobile/）

| 技术 | 用途 | 关键文件 |
|------|------|----------|
| **React Native + Expo** | 跨平台移动应用 | `mobile/app/` |
| **Expo Router** | 文件系统路由 | `mobile/app/_layout.tsx` |
| **Zustand** | 轻量状态管理 | `mobile/src/stores/` |
| **Axios** | HTTP 客户端 | `mobile/src/services/api/client.ts` |
| **高德地图 SDK** | 地图展示 | `mobile/src/components/map/` |
| **Expo AV** | 音频播放 | `mobile/src/components/slideshow/` |
| **AsyncStorage** | 本地持久化 | `mobile/src/services/storage/` |

### 2.2 后端（backend/）

| 技术 | 用途 | 关键文件 |
|------|------|----------|
| **FastAPI** | Web 框架 | `backend/main.py` |
| **SQLAlchemy** | ORM | `backend/app/models/` |
| **Alembic** | 数据库迁移 | `backend/alembic/` |
| **Celery + Redis** | 异步任务队列 | `backend/app/tasks/` |
| **PostgreSQL** | 主数据库 | `backend/app/core/config.py` |
| **阿里云 OSS** | 文件存储 | `backend/app/services/storage_service.py` |
| **通义千问** | AI 故事生成 | `backend/app/integrations/tongyi.py` |
| **高德地图 API** | 逆地理编码 | `backend/app/integrations/amap.py` |

### 2.3 基础设施

```
┌─────────────────────────────────────────────────────────┐
│                    移动端 (Expo)                         │
└─────────────────────────┬───────────────────────────────┘
                          │ HTTPS
┌─────────────────────────▼───────────────────────────────┐
│                   FastAPI 后端                           │
├─────────────────────────────────────────────────────────┤
│  API 路由 → 服务层 → 数据模型                            │
└──────┬──────────────────┬───────────────────┬───────────┘
       │                  │                   │
┌──────▼──────┐   ┌───────▼───────┐   ┌──────▼──────┐
│ PostgreSQL  │   │ Redis + Celery │   │ 阿里云 OSS  │
│  (主数据库)  │   │  (任务队列)    │   │ (文件存储)  │
└─────────────┘   └───────────────┘   └─────────────┘
```

---

## 3. 核心用户流程

### 3.1 完整用户旅程

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户旅程                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. 注册/登录                                                    │
│     ├─ 设备 ID 自动注册（首次打开）                               │
│     └─ 邮箱密码登录（可选升级）                                   │
│                          ↓                                      │
│  2. 照片导入                                                     │
│     ├─ 自动导入：扫描最近 N 个月的照片                            │
│     └─ 手动导入：用户选择特定照片                                 │
│                          ↓                                      │
│  3. 后台处理                                                     │
│     ├─ EXIF 提取（GPS、拍摄时间）                                │
│     ├─ 哈希去重（SHA-256）                                       │
│     ├─ 上传到云端（OSS）                                         │
│     └─ 时空聚类（生成事件）                                       │
│                          ↓                                      │
│  4. AI 增强                                                      │
│     ├─ 地理编码（坐标 → 地名）                                   │
│     ├─ 照片分析（视觉描述）                                       │
│     ├─ 故事生成（标题 + 正文 + 章节）                             │
│     └─ 情感标签（温馨/冒险/浪漫...）                              │
│                          ↓                                      │
│  5. 内容展示                                                     │
│     ├─ 地图视图：足迹标记 + 聚类展示                              │
│     ├─ 事件列表：时间线浏览                                       │
│     ├─ 事件详情：故事 + 章节 + 照片网格                           │
│     └─ 幻灯片播放：音乐 + 字幕 + 照片轮播                         │
│                          ↓                                      │
│  6. 跨设备同步                                                   │
│     └─ 新设备登录后自动拉取云端数据                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 关键状态流转

**事件状态机**：
```
clustered → ai_pending → ai_processing → generated
                ↓              ↓
            ai_failed ←────────┘
                ↓
          (可重试生成)
```

**照片状态机**：
```
uploaded → clustered
    ↓
  noise (无法聚类的照片)
```

---

## 4. 模块划分

### 4.1 前端模块

| 模块 | 职责 | 入口文件 | 详细文档 |
|------|------|----------|----------|
| **认证** | 登录、注册、Token 管理 | `mobile/app/login.tsx` | `frontend/modules/auth.md` |
| **地图** | 足迹展示、事件标记、聚类 | `mobile/app/(tabs)/index.tsx` | `frontend/modules/map.md` |
| **上传** | 照片导入、去重、上传 | `mobile/src/services/album/` | `frontend/modules/upload.md` |
| **故事** | 事件详情、章节、幻灯片 | `mobile/app/events/[eventId].tsx` | `frontend/modules/story.md` |

### 4.2 后端模块

| 模块 | 职责 | 入口文件 | 详细文档 |
|------|------|----------|----------|
| **认证** | 用户注册、登录、鉴权 | `backend/app/api/v1/auth.py` | `backend/modules/auth.md` |
| **照片** | 上传、去重、存储、查询 | `backend/app/api/v1/photos.py` | `backend/modules/photo.md` |
| **事件** | 聚类、故事生成、章节 | `backend/app/api/v1/events.py` | `backend/modules/event.md` |
| **地图** | 地理编码、位置上下文 | `backend/app/integrations/amap.py` | `backend/modules/map.md` |
| **同步** | 多设备数据同步 | `backend/app/api/v1/sync.py` | `backend/modules/sync.md` |

---

## 5. 数据模型概览

### 5.1 核心实体关系

```
┌─────────┐       ┌─────────┐       ┌─────────────┐
│  User   │──1:N──│  Photo  │──N:1──│    Event    │
└─────────┘       └─────────┘       └──────┬──────┘
     │                                     │
     │                              ┌──────┴──────┐
     │                              │             │
     │                        ┌────▼────┐  ┌─────▼─────┐
     │                        │ Chapter │  │PhotoGroup │
     │                        └─────────┘  └───────────┘
     │
     └──1:N──┌──────────────────┐
             │UserDeviceSyncState│
             └──────────────────┘
```

### 5.2 主要表结构

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `users` | 用户账户 | `id`, `device_id`, `email`, `auth_type` |
| `photos` | 照片记录 | `id`, `user_id`, `event_id`, `file_hash`, `gps_lat/lon`, `shoot_time` |
| `events` | 事件/旅行 | `id`, `user_id`, `title`, `full_story`, `status`, `start_time`, `end_time` |
| `event_chapters` | 事件章节 | `id`, `event_id`, `chapter_title`, `chapter_story` |
| `photo_groups` | 照片组 | `id`, `chapter_id`, `group_theme` |
| `async_tasks` | 异步任务 | `id`, `task_type`, `status`, `progress` |

详细字段定义见：`backend/database/schema-dictionary.md`

---

## 6. API 概览

### 6.1 API 前缀

所有 API 路径前缀：`/api/v1/`

### 6.2 主要端点

| 模块 | 端点 | 方法 | 用途 |
|------|------|------|------|
| 认证 | `/auth/register` | POST | 设备注册 |
| 认证 | `/auth/login` | POST | 邮箱登录 |
| 照片 | `/photos/upload/metadata` | POST | 上传照片元数据 |
| 照片 | `/photos/check-duplicates` | POST | 检查重复 |
| 事件 | `/events/` | GET | 事件列表 |
| 事件 | `/events/{id}` | GET | 事件详情 |
| 事件 | `/events/{id}/regenerate-story` | POST | 重新生成故事 |
| 同步 | `/sync/status` | GET | 同步状态 |
| 同步 | `/sync/pull` | POST | 拉取数据 |
| 任务 | `/tasks/status/{id}` | GET | 任务状态 |

详细 API 文档见：`backend/api/INDEX.md`

---

## 7. 开发范式

本项目采用 **my-spec** 工作流进行开发：

1. **文档先行**：需求必须先澄清，产出 PRD
2. **测试先行**：先定义测试计划，再写代码
3. **分阶段门禁**：状态机控制流程，不允许跳过
4. **证据归档**：测试报告、日志、截图必须留存
5. **文档联动**：代码变更后必须更新对应的 system 文档

详细流程见：`core/01-what-is-my-spec.md`

---

## 8. 快速定位指南

### 8.1 按功能定位

| 我想了解... | 应该看... |
|-------------|-----------|
| 用户如何登录 | `frontend/modules/auth.md` + `backend/modules/auth.md` |
| 照片如何上传 | `frontend/modules/upload.md` + `backend/modules/photo.md` |
| 事件如何生成 | `backend/modules/event.md` |
| 地图如何展示 | `frontend/modules/map.md` + `backend/modules/map.md` |
| 故事如何播放 | `frontend/modules/story.md` |
| 数据如何同步 | `backend/modules/sync.md` |

### 8.2 按问题定位

| 问题类型 | 应该看... |
|----------|-----------|
| API 返回错误 | `backend/api/INDEX.md` 查接口定义 |
| 数据库字段问题 | `backend/database/schema-dictionary.md` |
| 前端状态问题 | `mobile/src/stores/` 对应的 store |
| 聚类算法问题 | `backend/app/services/clustering_service.py` |
| AI 生成问题 | `backend/app/services/ai_service.py` |

---

## 9. 版本信息

| 项目 | 版本 |
|------|------|
| React Native | 0.74+ |
| Expo SDK | 51+ |
| FastAPI | 0.100+ |
| Python | 3.11+ |
| PostgreSQL | 15+ |

---

> **下一步**：根据你要修改的功能，查阅对应的模块文档，了解详细的代码结构和业务逻辑。
