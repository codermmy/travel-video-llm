# 前端模块：本地导入与上传契约

> **文档目的**：说明单设备隐私模式下的默认导入链路，明确哪些数据留在端侧、哪些数据可以上传，以及相关代码入口。

---

## 1. 模块概述

### 1.1 当前职责

- 请求相册权限并手动选择照片
- 解析本地 URI、拍摄时间、GPS 等 metadata
- 基于 metadata 做默认去重
- 触发 Android 端侧结构化识别
- 上传 `metadata + vision result`
- 维护本地媒体引用与导入记录

### 1.2 明确不做

- 应用启动后自动扫描最近相册
- 默认生成缩略图
- 默认计算照片 hash
- 默认上传任何图片文件
- 多设备同步

### 1.3 代码入口

| 类型 | 文件路径 |
|------|----------|
| 导入服务 | `mobile/src/services/album/photoImportService.ts` |
| 进度弹窗 | `mobile/src/components/import/ImportProgressModal.tsx` |
| 照片 API | `mobile/src/services/api/photoApi.ts` |
| 端侧识别 | `mobile/src/services/vision/onDeviceVisionService.ts` |
| 识别缓存 | `mobile/src/services/storage/onDeviceVisionStorage.ts` |
| 本地媒体引用 | `mobile/src/services/media/localMediaRegistry.ts` |
| 类型定义 | `mobile/src/types/photo.ts` / `mobile/src/types/vision.ts` |

---

## 2. 默认导入流程

### 2.1 手动导入

```text
1. 请求相册权限
2. 打开系统照片选择器
3. 解析本地 URI / 拍摄时间 / GPS
4. 调用 /photos/check-duplicates-by-metadata
5. 将新照片写入 local media registry
6. 触发端侧结构化识别
7. 上传 metadata + vision result
8. 由后端触发聚类任务
```

### 2.2 上传边界

默认导入只允许上传以下内容：

- `assetId`
- `shootTime`
- `gpsLat` / `gpsLon`
- `width` / `height` / `fileSize`
- 端侧识别生成的结构化结果

默认导入禁止上传以下内容：

- 原图
- 缩略图
- 公网图片 URL
- hash

---

## 3. 去重策略

### 3.1 默认去重

默认链路只使用 metadata：

- 优先由后端按 `assetId` 识别同一设备内重复上传
- 若没有 `assetId`，再使用 `shootTime ± 2s + GPS / 无 GPS` 判断重复
- 端侧会对同一批次内 metadata 重复项做一次本地去重

### 3.2 不再使用

- `file_hash`
- `assetHashById`
- 缩略图文件存在性判断

---

## 4. 本地媒体引用

### 4.1 local media registry

本地媒体映射只服务于显示层：

- 键优先级：`assetId -> fileHash(兼容旧数据)`
- 当前默认只写入：
  - `assetId`
  - `localUri`
  - `localCoverUri`

### 4.2 设计原则

- 本地引用不进入上传契约
- 默认不生成 `localThumbnailUri`
- 如果未来需要列表性能优化，可以增加“端侧懒生成缩略图缓存”，但必须保持：
  - 只在显示层使用
  - 不参与导入去重
  - 不上传到后端

---

## 5. 端侧识别

### 5.1 Android MVP

- 通过 `mobile/modules/travel-vision/` 调用 Android 本地能力
- 输出 schema 对齐 `single-device-vision/v1`
- 缓存键优先级：`assetId -> localUri`

### 5.2 降级策略

- iOS / Web / 模块缺失时返回 `unsupported`
- 端侧识别失败不阻塞 metadata 导入

---

## 6. 导入进度

```ts
type ImportStage =
  | 'idle'
  | 'scanning'
  | 'dedup'
  | 'vision'
  | 'uploading'
  | 'clustering'
  | 'done';
```

常用文案：

- `scanning`: 正在解析照片信息
- `dedup`: 正在按 metadata 查重
- `vision`: 正在获取端侧结构化结果
- `uploading`: 正在上传 metadata

---

## 7. 本地导入记录

```ts
type ImportCache = {
  lastRunMs?: number;
  lastAttemptMs?: number;
  importedAssetIds?: string[];
};
```

用途：

- 设置页展示最近导入/最近尝试
- 清理本机导入记录

该缓存不保存 hash，不保存缩略图路径。

---

## 8. 维护要求

- 修改默认导入链路时，优先对齐 `my-spec/docs/single-device-privacy-first-prd.md`
- 若新增本地图片缓存能力，必须明确标注“仅显示层”
- 若引入任何图片上传，必须归入“事件增强入口”，不能混入默认导入
