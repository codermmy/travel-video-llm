# 前端模块：导入流水线与任务中心

## 1. 职责范围

- 从系统相册读取照片资产
- 基于 metadata 去重
- 上传 metadata 到后端
- 把本地 URI 注册到 `localMediaRegistry`
- 通过端侧视觉队列异步分析并同步 `vision`
- 在前端维护可回看的导入任务记录

## 2. 代码入口

| 类型 | 文件 |
|---|---|
| 导入服务 | `mobile/src/services/album/photoImportService.ts` |
| 导入任务状态 | `mobile/src/services/import/importTaskService.ts` |
| 端侧视觉队列 | `mobile/src/services/vision/onDeviceVisionQueueService.ts` |
| 端侧视觉执行 | `mobile/src/services/vision/onDeviceVisionService.ts` |
| 本地媒体注册表 | `mobile/src/services/media/localMediaRegistry.ts` |
| 任务详情页 | `mobile/app/profile/import-tasks.tsx`, `mobile/src/screens/import-task-detail-screen.tsx` |

## 3. 三条导入入口

### 3.1 最近照片

- 入口：回忆页
- 行为：读取最近 `AUTO_IMPORT_LIMIT=200` 张照片

### 3.2 手动补导入

- 入口：回忆页、我的页
- 行为：用户手动选择任意照片

### 3.3 导入到当前事件

- 入口：`EventPhotoManagerSheet`
- 行为：导入后立即 `reassignPhotosToEvent(targetEventId)`

## 4. 默认流水线

```text
MediaLibrary
  -> resolve asset info
  -> /photos/check-duplicates-by-metadata
  -> registerLocalMediaEntries()
  -> /photos/upload/metadata
  -> enqueueOnDeviceVisionSync()
  -> PATCH /photos/{id} 写回 vision
  -> /tasks/status/{taskId} 轮询聚类/故事任务
```

说明：

- 默认导入阶段只上传 metadata，不上传原图
- `vision` 不是在首个 metadata 请求里上传，而是在端侧分析完成后单张回写

## 5. 去重规则

- 优先 `assetId`
- 若无 `assetId`，则使用 `shootTime ± 2s + GPS`
- 前端还会对同批次结果按 metadata key 再做一次本地去重

## 6. 本地注册表

### 6.1 保存内容

- `photoId`
- `assetId`
- `shootTime`
- `gpsLat/gpsLon`
- `localUri`
- `localCoverUri`

### 6.2 用途

- 列表和详情页优先展示本地图片
- 支持事件封面覆盖
- 支持通过 `assetId` 再次回补本地 URI

## 7. 导入任务模型

前端使用四阶段模型：

- `prepare`：读相册、查重、同步 metadata
- `analysis`：端侧视觉分析
- `sync`：把结构化结果同步回后端
- `story`：后端聚类、地理编码、故事生成

任务记录保存在 AsyncStorage，可在“我的 -> 导入任务”查看历史、失败和进度。

## 8. 当前边界

- 不再保留旧的多设备同步上传链路
- 不在启动时自动扫描整个相册
- 默认不上传图片文件
- iOS / Web 无原生视觉模块时，队列会回写 `unsupported`
