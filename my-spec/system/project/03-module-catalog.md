# 模块目录总表

## 前端模块

| 模块 | 文档 | 代码入口 |
|---|---|---|
| 设备会话与鉴权 | `my-spec/system/frontend/modules/auth.md` | `mobile/app/_layout.tsx`, `mobile/src/stores/authStore.ts` |
| 回忆主页 | `my-spec/system/frontend/modules/memories.md` | `mobile/app/(tabs)/index.tsx`, `mobile/src/screens/memories-screen.tsx` |
| 导入流水线与任务中心 | `my-spec/system/frontend/modules/upload.md` | `mobile/src/services/album/photoImportService.ts`, `mobile/src/services/import/importTaskService.ts` |
| 地图与地点补全 | `my-spec/system/frontend/modules/map.md` | `mobile/app/(tabs)/map.tsx`, `mobile/src/components/map/MapViewContainer.tsx` |
| 事件详情与幻灯片 | `my-spec/system/frontend/modules/story.md` | `mobile/app/events/[eventId].tsx`, `mobile/src/components/slideshow/SlideshowPlayer.tsx` |
| 个人资料与数据管理 | `my-spec/system/frontend/modules/profile.md` | `mobile/app/(tabs)/profile.tsx`, `mobile/app/profile/edit.tsx` |

## 后端模块

| 模块 | 文档 | 代码入口 |
|---|---|---|
| 设备认证 | `my-spec/system/backend/modules/auth.md` | `backend/app/api/v1/auth.py` |
| 用户资料 | `my-spec/system/backend/modules/user.md` | `backend/app/api/v1/users.py` |
| 照片与端侧视觉回写 | `my-spec/system/backend/modules/photo.md` | `backend/app/api/v1/photos.py` |
| 事件、故事与增强 | `my-spec/system/backend/modules/event.md` | `backend/app/api/v1/events.py`, `backend/app/services/event_service.py` |
| 地图与地理编码 | `my-spec/system/backend/modules/map.md` | `backend/app/integrations/amap.py`, `backend/app/services/geocoding_service.py` |
| 异步任务 | `my-spec/system/backend/modules/task.md` | `backend/app/api/v1/tasks.py`, `backend/app/tasks/clustering_tasks.py` |
| 管理接口 | `my-spec/system/backend/modules/admin.md` | `backend/app/api/v1/admin.py` |
| 已停用同步链路 | `my-spec/system/backend/modules/sync.md` | 文档说明，当前无活动路由 |

## 重点跨端映射

| 用户动作 | 前端入口 | 后端入口 |
|---|---|---|
| App 自动拿到设备身份 | `frontend/modules/auth.md` | `backend/modules/auth.md` |
| 导入最近照片或手动补导入 | `frontend/modules/upload.md` | `backend/modules/photo.md`, `backend/modules/task.md` |
| 浏览回忆列表 | `frontend/modules/memories.md` | `backend/modules/event.md` |
| 地图查看和补地点 | `frontend/modules/map.md` | `backend/modules/map.md`, `backend/modules/event.md` |
| 编辑事件和播放幻灯片 | `frontend/modules/story.md` | `backend/modules/event.md`, `backend/modules/photo.md` |
| 编辑头像昵称、查看任务 | `frontend/modules/profile.md` | `backend/modules/user.md`, `backend/modules/task.md` |
