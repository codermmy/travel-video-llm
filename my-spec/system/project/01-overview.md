# 项目全局概览

## 1. 当前产品定位

项目当前是一款“单设备优先、隐私优先”的旅行回忆整理 App。

当前主链路不是多设备云同步，也不是手动上传原图到云端，而是：

1. App 启动时自动恢复或注册本机设备会话。
2. 用户从相册手动选择照片，或主动触发“最近 200 张”快速导入。
3. 前端先上传照片 `metadata`，图片文件默认仍留在本机。
4. Android 端侧视觉模块异步分析照片内容，再把结构化结果回写后端。
5. 后端把照片聚合成事件，补地点、生成故事、章节和播放素材。
6. 用户在“回忆 / 地图 / 我的”中浏览、编辑、播放、导出视频。

## 2. 当前已经落地的核心能力

### 2.1 移动端

- 单设备自动会话：无登录页，根布局自动 bootstrap 设备身份。
- 回忆主页：最近回忆 hero、按月分组浏览、下拉刷新、快速导入。
- 导入流水线：最近 200 张导入、手动补导入、导入到指定事件。
- 导入任务中心：四阶段进度 `prepare / analysis / sync / story`。
- 本地媒体注册表：本地 `assetId / photoId / metadata` 到 `localUri` 的映射。
- 地图视图：高德原生地图、前端聚类、聚类内事件列表。
- 地点补全：选择城市、搜索地点、手动回写事件位置。
- 事件详情：故事引子、章节卡片、照片网格、完整故事、状态提示。
- 事件编辑：修改标题、地点、封面；封面覆盖保存在端侧。
- 照片管理：批量移动到其他事件、创建新事件、删除照片、补导入到当前事件。
- 幻灯片播放：场景构建、音频规划、视频预览、原生导出。
- 个人资料：昵称、头像上传、导入记录清理、任务入口。

### 2.2 后端

- 设备注册：`POST /api/v1/auth/register`
- 用户资料：查询/更新本人信息、上传头像、按用户名/昵称查询
- 照片接口：按 metadata 去重、批量写入 metadata、照片更新/重归类/删除
- 事件接口：列表、详情、创建、编辑、删除、重生成故事、地点搜索
- 任务接口：轮询 Celery 异步任务状态
- 管理接口：管理员重聚类
- 异步任务：聚类、地理编码、AI 故事生成、增强故事生成
- AI provider 抽象：`openai / deepseek / tongyi`
- 可选 OSS：头像、增强素材可走本地存储或 OSS

## 3. 当前主用户流程

### 3.1 首次打开

1. `mobile/app/_layout.tsx` 调用 `authStore.bootstrapDeviceSession()`
2. 读取本地 token、userId、deviceId
3. token 可用则恢复；不可用则基于本机 `deviceId` 自动注册
4. 成功后进入 `(tabs)`

### 3.2 导入照片

1. 用户从“回忆”或“我的”进入导入
2. 前端读取相册资产，提取 `assetId / creationTime / location / width / height`
3. 调用 `/api/v1/photos/check-duplicates-by-metadata`
4. 新照片写入 `/api/v1/photos/upload/metadata`
5. 本地登记 `localMediaRegistry`
6. 端侧视觉队列后台分析并通过 `PATCH /photos/{id}` 回写 `vision`
7. 后端异步聚类并安排事件故事生成

### 3.3 浏览与编辑

1. “回忆”页调用 `eventApi.listAllEvents()`
2. `eventApi` 会把服务端事件和本地媒体注册表做 hydration
3. 用户可进入详情、地图、照片查看器、幻灯片
4. 事件或照片被编辑后，后端会刷新摘要并自动请求新的故事版本

## 4. 技术栈

### 4.1 mobile

- Expo 54 + React Native 0.81 + React 19
- Expo Router
- Zustand
- Expo Media Library / File System / AV / Image Picker
- `react-native-amap3d`
- 自定义 Expo 原生模块：
  - `mobile/modules/travel-vision`
  - `mobile/modules/travel-slideshow-export`

### 4.2 backend

- FastAPI
- SQLAlchemy + Alembic
- Celery + Redis
- SQLite 默认，兼容 PostgreSQL
- 高德地图 API
- OpenAI / DeepSeek / 通义 provider 工厂
- 本地 uploads 或阿里云 OSS

## 5. 当前边界和口径

- 当前默认是单设备使用，不再以多设备同步为主入口。
- 默认导入不上图，只上传 metadata；例外是头像上传和事件增强素材上传。
- 事件增强接口已在后端和前端 API 层实现，但当前移动端页面没有正式入口。
- 用户搜索接口已可用，但当前移动端没有消费该能力。
- 遗留同步相关迁移和 schema 仍可能存在于历史数据库中，但已不属于当前主链路。
