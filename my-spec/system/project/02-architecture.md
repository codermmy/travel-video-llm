# 架构地图

## 1. 总体结构

```text
┌──────────────────────────────────────────────────────────────┐
│                         Mobile App                           │
│  Expo Router / Zustand / Media Library / Local Registry      │
│  TravelVision / TravelSlideshowExport / AMap Native Module   │
└───────────────┬──────────────────────────────────────────────┘
                │ REST + JWT + X-Device-Id
┌───────────────▼──────────────────────────────────────────────┐
│                       FastAPI Backend                        │
│  auth / users / photos / events / tasks / ai / admin        │
│  event_service / clustering / geocoding / ai_service        │
└───────┬───────────────────────┬───────────────────────┬──────┘
        │                       │                       │
        ▼                       ▼                       ▼
   SQLite/Postgres          Redis + Celery          Local/OSS
```

当前系统有两条并行数据面：

- 端侧媒体数据面：本地 `assetId -> localUri`、封面覆盖、端侧视觉缓存、导出缓存
- 云端结构化数据面：照片 metadata、vision 结果、事件、章节、任务、头像、增强素材

## 2. 移动端分层

### 2.1 目录骨架

```text
mobile/
├── app/                        # Expo Router 路由
│   ├── _layout.tsx
│   ├── (tabs)/                 # 回忆 / 地图 / 我的
│   ├── events/[eventId].tsx
│   ├── slideshow.tsx
│   ├── photo-viewer.tsx
│   ├── profile/
│   ├── event-location/
│   └── map/
├── src/components/             # 组件
├── src/screens/                # 复合页面逻辑
├── src/services/               # API、本地服务、导入、视觉、幻灯片
├── src/stores/                 # Zustand
├── src/types/                  # 共享类型
└── modules/                    # 自定义 Expo 原生模块
```

### 2.2 关键前端链路

#### 设备会话

```text
RootLayout
  -> authStore.bootstrapDeviceSession()
  -> authApi.register() / tokenStorage
  -> apiClient 自动附带 Authorization + X-Device-Id
```

#### 导入流水线

```text
PhotoLibraryPicker / Recent Import
  -> photoImportService
  -> photoApi.checkDuplicatesByMetadata()
  -> photoApi.uploadPhotos()
  -> localMediaRegistry.register()
  -> onDeviceVisionQueue.enqueue()
  -> photoApi.updatePhoto(vision)
  -> taskApi.getTaskStatus()
```

#### 浏览与播放

```text
eventApi.list/getDetail
  -> 本地 URI hydration
  -> Memories / Map / Event Detail
  -> SlideshowPlayer
  -> generateSlideshowPreviewVideo / exportSlideshowVideo
```

## 3. 后端分层

### 3.1 目录骨架

```text
backend/
├── main.py
├── app/api/v1/
├── app/core/
├── app/db/
├── app/models/
├── app/schemas/
├── app/services/
├── app/integrations/
└── app/tasks/
```

### 3.2 请求和任务流

#### 同步请求

```text
API Route
  -> Depends(CurrentUserIdDep)
  -> service / model query
  -> ApiResponse[T]
```

#### 异步任务

```text
photos/upload/metadata
  -> trigger_clustering_task()
  -> process_new_photos_task
  -> cluster_user_photos
  -> geocoding_service.update_event_locations
  -> trigger_event_story_task()
  -> generate_event_story_task
```

#### 事件编辑后的刷新

```text
PATCH /events/{id} or PATCH /photos/{id}
  -> mark_events_structure_changed()
  -> refresh_event_summary()
  -> mark_event_pending_story_refresh()
  -> trigger_event_story_task()
```

## 4. 关键状态模型

### 4.1 事件运行态

- `waiting_for_vision`：还有照片未完成端侧识别
- `ai_pending`：已经具备生成条件，等待故事任务
- `ai_processing`：故事生成中
- `generated`：故事与幻灯片版本新鲜
- `ai_failed`：当前版本生成失败

事件是否“真正完成”，不只看 `status`，还要结合：

- `visionSummary`
- `eventVersion`
- `storyGeneratedFromVersion`
- `storyFreshness`
- `slideshowFreshness`
- `hasPendingStructureChanges`

### 4.2 导入任务态

前端导入任务中心使用四阶段视图：

- `prepare`
- `analysis`
- `sync`
- `story`

后端异步任务接口使用：

- `pending`
- `clustering`
- `geocoding`
- `ai`

## 5. 基础设施与环境依赖

- 数据库默认 `sqlite:///./travel_album.db`，也兼容 PostgreSQL
- Celery broker/result backend 默认 `redis://localhost:6379/0`
- AMap 既服务后端地理编码，也服务移动端原生地图
- OSS 为可选能力；未启用时头像与增强素材保存在 `uploads/`
- 地图页只能在 Development Build 里运行，Expo Go 不支持原生高德模块
