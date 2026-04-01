# 模块目录总表

本表用于快速定位“功能 -> 模块文档 -> 代码入口”。

## 前端模块

| 模块 | 文档 | 代码入口 |
|---|---|---|
| 认证 | `my-spec/system/frontend/modules/auth.md` | `mobile/app/login.tsx`, `mobile/src/stores/authStore.ts` |
| 地图 | `my-spec/system/frontend/modules/map.md` | `mobile/app/(tabs)/index.tsx`, `mobile/src/components/map/` |
| 上传/同步 | `my-spec/system/frontend/modules/upload.md` | `mobile/src/services/api/`, `mobile/src/services/sync/` |
| 故事播放 | `my-spec/system/frontend/modules/story.md` | `mobile/app/events/[eventId].tsx`, `mobile/app/slideshow.tsx` |
| 时间线 | `my-spec/system/frontend/modules/story.md` | `mobile/app/(tabs)/events.tsx`, `mobile/src/components/timeline/` |

## 后端模块

| 模块 | 文档 | 代码入口 |
|---|---|---|
| 认证 | `my-spec/system/backend/modules/auth.md` | `backend/app/api/v1/auth.py`, `backend/app/services/auth_service.py` |
| 地图 | `my-spec/system/backend/modules/map.md` | `backend/app/integrations/amap.py`, `backend/app/services/event_enrichment.py` |
| 照片 | `my-spec/system/backend/modules/photo.md` | `backend/app/api/v1/photos.py`, `backend/app/services/photo_service.py` |
| 事件/故事 | `my-spec/system/backend/modules/event.md` | `backend/app/api/v1/events.py`, `backend/app/services/event_service.py` |
| 同步 | `my-spec/system/backend/modules/sync.md` | `backend/app/api/v1/sync.py`, `backend/app/services/sync_service.py` |

## 跨端映射（必须互链）

| 前端模块 | 后端模块 | 说明 |
|---|---|---|
| `frontend/modules/auth.md` | `backend/modules/auth.md` | 登录注册、token、鉴权链路 |
| `frontend/modules/map.md` | `backend/modules/map.md` + `backend/modules/event.md` | 地图展示依赖地理编码与事件位置数据 |
| `frontend/modules/upload.md` | `backend/modules/photo.md` + `backend/modules/sync.md` | 上传、去重、多设备同步 |
| `frontend/modules/story.md` | `backend/modules/event.md` | 章节、故事、播放内容来源 |
