# Workstream 00：单设备核心契约

> 角色：总线文档
>
> 优先级：P0
>
> 是否允许并行开发：否，需优先完成

---

## 1. 需求背景

当前仓库已经出现“产品方向已切换，但实现仍混合旧链路”的状态：

- 查重已经有 Metadata 版本
- 但照片导入仍会生成缩略图并上传
- 默认故事生成仍依赖服务端看图
- 事件详情和幻灯片仍优先读取后端图片 URL

在这种状态下，如果多个 agent 并行开发，很容易出现：

- 前端和后端 schema 不一致
- 本地媒体引用字段命名冲突
- 默认链路和增强链路混用
- 一个模块按“本地图片”实现，另一个模块仍按“云端图片 URL”实现

因此必须先定义单设备版本的统一契约。

---

## 2. 目标

为后续所有并行开发需求包定义统一的：

- 本地媒体引用模型
- 端侧识别输出 schema
- 默认故事生成输入 schema
- 云端增强输入 schema
- 图片生命周期与清理规则

---

## 3. 范围

### 包含

- 统一字段命名
- 统一接口职责边界
- 统一本地与服务端的数据归属
- 统一默认路径与增强路径的分层

### 不包含

- 具体 Android 原生识别实现
- 具体故事 prompt 重写
- 具体幻灯片导出实现

---

## 4. 建议契约

### 4.1 本地媒体引用模型

建议统一使用以下字段：

- `assetId`：系统相册资源标识
- `localUri`：原始本地资源 URI
- `localThumbnailUri`：本地缩略图 URI
- `localCoverUri`：事件封面本地 URI

原则：

- 默认链路不依赖云端图片 URL
- 服务端不需要持有 `localUri`
- 移动端展示层优先使用本地字段

### 4.2 端侧识别输出 schema

P0 固定字段：

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

建议补充统一元信息：

- `schema_version`
- `source_platform`
- `generated_at`
- `confidence_map`

### 4.3 默认故事生成输入

服务端默认链路只接收：

- 事件时间范围
- GPS / 地理编码结果
- 端侧识别结构化字段聚合结果
- 事件内照片数量与时间序列信息

默认链路不接收：

- 原图
- 缩略图
- 公开图片 URL

### 4.4 增强入口输入

增强入口接收：

- `event_id`
- 3-5 张压缩代表图
- 重新生成配置
- 上传时间与过期时间

增强入口不改变默认产品模式，只代表一次显式上传任务。

### 4.5 生命周期规则

- 默认链路：不上传、不保留图片
- 增强链路：压缩代表图与中间结果保留 7 天
- 到期自动清理
- 设置页提供手动清理入口

---

## 5. 涉及模块

前端：

- `mobile/src/types/`
- `mobile/src/services/api/`
- `mobile/src/stores/`
- `mobile/src/services/album/`
- `mobile/src/components/photo/`
- `mobile/src/components/slideshow/`

后端：

- `backend/app/schemas/`
- `backend/app/models/`
- `backend/app/api/v1/`
- `backend/app/services/`

---

## 6. 交付物

这个需求包完成后，应至少产出：

1. 单设备版本统一字段表
2. 默认链路与增强链路的数据流图
3. 前后端共用的 schema 定义说明
4. 本地数据与服务端数据边界表

---

## 7. 对后续需求包的影响

- `01` 会依赖它定义用户中心的数据与文案边界
- `02` 会依赖它定义本地媒体字段
- `03` 会依赖它定义识别输出字段
- `04` 会依赖它定义故事输入字段
- `05` 会依赖它定义本地展示字段
- `06` 会依赖它定义增强入口字段与保留策略

1 3 5
2 4 
6