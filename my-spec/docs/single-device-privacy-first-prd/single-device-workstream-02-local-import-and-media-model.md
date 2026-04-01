# Workstream 02：本地导入与本地媒体模型

> 角色：前后端联动需求包
>
> 优先级：P0
>
> 是否允许并行开发：是，但依赖核心契约

---

## 1. 需求背景

当前导入链路仍保留大量旧云图模型痕迹：

- 前端导入时生成缩略图和 hash
- 前端上传缩略图文件
- 后端为照片生成 `thumbnail_url / object_key / storage_provider`
- 后续模块默认认为照片已经有云端 URL

这与“默认不上图”的产品方向直接冲突。

---

## 2. 目标

把照片导入主流程改造成：

`本地照片 -> Metadata -> 端侧结构化描述 -> 上传 metadata/结构化结果 -> 聚类与故事生成`

同时建立“本地媒体引用模型”，供事件详情、封面和幻灯片使用。

---

## 3. 范围

### 包含

- 导入流程重构
- 本地媒体引用字段设计
- 默认上传文件链路下线
- Metadata 上传结构重构
- 照片记录模型重构

### 不包含

- Android 原生识别实现细节
- 故事 prompt 重写
- 增强入口上传逻辑

---

## 4. 产品要求

### 4.1 默认导入行为

- 读取系统相册资源
- 解析 Metadata
- 获取端侧识别结构化结果
- 查重
- 上传 Metadata 与结构化结果
- 不上传图片文件

### 4.2 本地媒体模型

移动端需要可长期使用的本地引用字段：

- `assetId`
- `localUri`
- `localThumbnailUri`
- `localCoverUri`

### 4.3 服务端照片记录

服务端照片记录应转向：

- 用户归属
- 事件归属
- 拍摄时间
- GPS
- 结构化识别结果
- 默认故事相关文本结果

而不是继续以云端缩略图记录为中心。

---

## 5. 技术方向

### 前端

- 重构 `photoImportService`
- 去掉默认上传缩略图逻辑
- 保留本地缩略图能力，但仅服务于本地显示和封面候选
- `photoApi.uploadPhotos` 改成只上传 metadata 与结构化结果

### 后端

- `photos/upload/file` 默认路径可下线或仅保留给增强入口
- `photos/upload/metadata` 请求体改造
- `Photo` 模型去弱化 `thumbnail_url / object_key / storage_provider`
- 为结构化结果预留字段或关联表

---

## 6. 涉及模块

- `mobile/src/services/album/photoImportService.ts`
- `mobile/src/services/album/thumbnailGenerator.ts`
- `mobile/src/services/api/photoApi.ts`
- `mobile/src/types/photo.ts`
- `backend/app/api/v1/photos.py`
- `backend/app/models/photo.py`
- `backend/app/schemas/photo.py`
- `backend/app/services/photo_service.py`

---

## 7. 验收口径

- 默认导入时不再上传图片文件
- 默认导入后服务端不再保存图片 URL 作为主依赖
- 前端本地仍可拿到照片与缩略图引用
- 后续事件详情与幻灯片可基于本地媒体字段工作

---

## 8. 与其他需求包的关系

- 依赖 `00-核心契约`
- 为 `05-本地事件详情与幻灯片` 提供本地媒体基础
- 为 `04-默认故事链路` 提供结构化输入来源
