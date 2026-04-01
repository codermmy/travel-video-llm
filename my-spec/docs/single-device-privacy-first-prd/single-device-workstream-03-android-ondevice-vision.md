# Workstream 03：Android 端侧识别 MVP

> 角色：Android 端能力需求包
>
> 优先级：P0
>
> 是否允许并行开发：是

---

## 1. 需求背景

默认故事生成已经不再允许依赖服务端看图，因此必须在端侧生成足够支撑故事编排的结构化描述。

你们当前阶段以 Android 为主，因此 Android 端侧识别是 MVP 关键路径。

---

## 2. 目标

在 Android 端实现一套稳定、轻量、可批处理的端侧识别能力，为默认故事生成提供结构化输入。

---

## 3. 范围

### 包含

- Android 端侧识别技术选型
- React Native / Expo 接入方式
- 结构化输出字段
- 批处理与缓存策略

### 不包含

- iOS 完整实现
- 端侧生成长故事
- 云端增强故事生成

---

## 4. 产品要求

P0 需输出以下字段：

- `scene_category`
- `object_tags`
- `activity_hint`
- `people_present`
- `people_count_bucket`
- `emotion_hint`
- `ocr_text`
- `landmark_hint`
- `image_quality_flags`
- `cover_score`

这些字段只需要做到粗粒度稳定，不要求开放式 caption。

---

## 5. 技术方向

### 主路线

- Android P0 主路线：`ML Kit on-device`

能力映射建议：

- OCR -> `ocr_text`
- Image Labeling -> `scene_category` / `object_tags`
- Face / Person Detection -> `people_present` / `people_count_bucket`
- 自定义规则评分 -> `image_quality_flags` / `cover_score`

### P1/P2 预留

- `MediaPipe`
- `TFLite`

用于后续更细粒度的旅行场景分类和封面评分优化。

### 工程约束

- 需要 `Expo Dev Client + 原生模块`
- 不应假设可以停留在 Expo Go
- 识别应在导入后异步批处理，不阻塞 UI

---

## 6. 建议实现边界

建议该需求包 owner 负责：

- Android 原生模块
- JS bridge
- 批处理入口
- 输出 schema 对齐
- 本地缓存策略

不负责：

- 故事生成 prompt
- 后端事件故事重写
- 事件详情页 UI

---

## 7. 涉及模块

- `mobile/` Android 原生模块新增目录
- `mobile/src/services/album/`
- `mobile/src/types/`
- `mobile/src/services/storage/`
- `mobile/app.json` 或相关 Expo 原生配置

---

## 8. 验收口径

- Android 端可对导入照片批量输出结构化字段
- 导入流程不会因识别任务明显卡 UI
- 输出字段满足默认故事生成要求
- 不依赖云端图片上传

---

## 9. 与其他需求包的关系

- 依赖 `00-核心契约`
- 为 `02-本地导入模型` 提供结构化结果
- 为 `04-默认故事链路` 提供核心输入
