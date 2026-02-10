# 前端模块：上传与同步（Upload & Sync）

> **文档目的**：详细说明前端上传与同步模块的照片导入流程、去重机制、进度展示和多设备同步策略，帮助开发者快速理解和修改上传相关功能。

---

## 1. 模块概述

### 1.1 职责范围

- 相册权限与照片选择
- EXIF 信息提取（GPS、拍摄时间）
- 缩略图生成与哈希计算
- 照片去重检查
- 批量上传与进度展示
- 多设备数据同步

### 1.2 代码入口

| 类型 | 文件路径 |
|------|----------|
| 导入服务 | `mobile/src/services/album/photoImportService.ts` |
| EXIF 提取 | `mobile/src/services/album/exifExtractor.ts` |
| 缩略图生成 | `mobile/src/services/album/thumbnailGenerator.ts` |
| 哈希计算 | `mobile/src/services/album/photoHasher.ts` |
| 照片 API | `mobile/src/services/api/photoApi.ts` |
| 同步服务 | `mobile/src/services/sync/syncService.ts` |
| 同步存储 | `mobile/src/services/sync/syncStorage.ts` |
| 进度弹窗 | `mobile/src/components/import/ImportProgressModal.tsx` |
| 类型定义 | `mobile/src/types/photo.ts` |

---

## 2. 照片导入流程

### 2.1 手动导入流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        手动导入流程 (manualImportFromPicker)             │
└─────────────────────────────────────────────────────────────────────────┘

1. 请求相册权限
   ├─ 成功 → 继续
   └─ 失败 → 抛出 photo_library_permission_denied
   ↓
2. 打开照片选择器
   ├─ 用户取消 → 返回空结果
   └─ 用户选择照片 → 继续
   ↓
3. 解析照片信息 (scanning)
   ├─ 获取本地 URI
   └─ 提取 EXIF 信息
   ↓
4. 加载哈希缓存
   └─ 从本地缓存读取已计算的哈希
   ↓
5. 生成缩略图并计算哈希 (thumbnail)
   ├─ 缓存命中 → 跳过计算
   └─ 缓存未命中 → 生成缩略图 + 计算 SHA-256
   ↓
6. 保存哈希缓存
   ↓
7. 去重检查 (dedup)
   ├─ 调用 POST /photos/check-duplicates
   └─ 过滤已存在的照片
   ↓
8. 上传照片 (uploading)
   ├─ 批量上传元数据
   └─ 触发后端聚类任务
   ↓
9. 返回导入结果
```

### 2.2 自动导入流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        自动导入流程 (autoImportRecentMonths)             │
└─────────────────────────────────────────────────────────────────────────┘

1. 检查导入间隔
   ├─ 距上次导入 < minIntervalMs → 跳过
   └─ 距上次尝试 < 60s（退避）→ 跳过
   ↓
2. 请求媒体库权限
   ↓
3. 扫描最近 N 个月的照片
   ├─ 按创建时间倒序
   └─ 最多 maxPhotos 张
   ↓
4. 解析照片信息
   ├─ 获取本地 URI
   └─ 获取 GPS 位置（如有权限）
   ↓
5. 生成缩略图并计算哈希
   ↓
6. 去重检查
   ↓
7. 上传照片
   ↓
8. 更新导入缓存时间戳
```

---

## 3. 导入进度状态

### 3.1 进度阶段

```typescript
type ImportStage =
  | 'scanning'    // 扫描照片
  | 'thumbnail'   // 生成缩略图
  | 'dedup'       // 去重检查
  | 'uploading';  // 上传中

interface ImportProgress {
  stage: ImportStage;
  current?: number;   // 当前进度
  total?: number;     // 总数
  detail?: string;    // 详细信息
}
```

### 3.2 进度回调

```typescript
function setProgress(
  onProgress: ProgressCb | undefined,
  stage: ImportStage,
  current?: number,
  total?: number,
  detail?: string
): void {
  onProgress?.({ stage, current, total, detail });
}

// 使用示例
setProgress(onProgress, 'scanning', 0, assets.length, '正在解析照片信息...');
setProgress(onProgress, 'thumbnail', i + 1, resolved.length);
setProgress(onProgress, 'dedup', undefined, undefined, '正在查重...');
setProgress(onProgress, 'uploading', current, total);
```

---

## 4. 缩略图与哈希

### 4.1 缩略图生成

```typescript
// thumbnailGenerator.ts
async function generateAndSaveThumbnailWithHash(uri: string): Promise<{
  uri: string;   // 缩略图本地路径
  hash: string;  // SHA-256 哈希
}>;

// 缩略图规格
const THUMBNAIL_WIDTH = 1080;  // 宽度 1080px
const THUMBNAIL_QUALITY = 0.8; // JPEG 质量 80%
```

### 4.2 哈希计算

```typescript
// photoHasher.ts
async function computeFileHash(uri: string): Promise<string>;

// 算法：SHA-256
// 输出：64 字符十六进制字符串
```

### 4.3 哈希缓存

```typescript
// 缓存结构
type ImportCache = {
  lastRunMs?: number;           // 上次导入时间
  lastAttemptMs?: number;       // 上次尝试时间
  assetHashById?: Record<string, string>;  // assetId → hash
};

// 缓存路径
{documentDirectory}/import-cache/photo-import-cache.json
```

---

## 5. 去重机制

### 5.1 去重流程

```typescript
// 1. 收集所有唯一哈希
const uniqueHashes = Array.from(new Set(
  processed.map(p => p.hash).filter(Boolean)
));

// 2. 调用后端去重接口
const dedup = await photoApi.checkDuplicates(uniqueHashes);

// 3. 过滤新照片
const newHashSet = new Set(dedup.newHashes);
const newItems = processed.filter(p =>
  p.hash && p.thumbnailPath && newHashSet.has(p.hash)
);

// 4. 本地去重（同批次内）
const byHash = new Map<string, Item>();
for (const item of newItemsRaw) {
  if (!byHash.has(item.hash)) {
    byHash.set(item.hash, item);
  }
}
```

### 5.2 去重策略

| 层级 | 说明 |
|------|------|
| 本地缓存 | 同一 assetId 不重复计算哈希 |
| 批次内 | 同哈希只保留第一张 |
| 服务端 | 基于 (user_id, file_hash) 唯一索引 |

---

## 6. 导入结果

### 6.1 结果类型

```typescript
type ImportResult = {
  selected: number;      // 用户选择的照片数
  dedupedNew: number;    // 去重后的新照片数
  uploaded: number;      // 成功上传数
  failed: number;        // 失败数
  taskId?: string | null; // 聚类任务 ID
};
```

### 6.2 结果场景

| 场景 | selected | dedupedNew | uploaded | failed |
|------|----------|------------|----------|--------|
| 全部新照片 | 50 | 50 | 50 | 0 |
| 部分重复 | 50 | 30 | 30 | 0 |
| 全部重复 | 50 | 0 | 0 | 0 |
| 部分失败 | 50 | 50 | 45 | 5 |

---

## 7. 多设备同步

### 7.1 同步服务

```typescript
// syncService.ts
const syncService = {
  // 获取同步状态
  getStatus(): Promise<SyncStatus>;

  // 拉取云端数据
  pullMetadata(sinceCursor?: string | null): Promise<SyncPullResponse>;

  // 确认同步完成
  ack(cursor?: string | null): Promise<void>;

  // 执行完整同步
  runMetadataSync(userId: string): Promise<SyncPullResponse>;

  // 标记已同步
  markSynced(userId: string, cursor: string | null): Promise<void>;

  // 获取本地同步状态
  getLocalState(userId: string): Promise<LocalSyncState | null>;
};
```

### 7.2 同步状态

```typescript
type SyncStatus = {
  deviceId: string;
  isFirstSyncOnDevice: boolean;
  needsSync: boolean;
  cloud: {
    eventCount: number;
    photoCount: number;
    cursor: string | null;
  };
  device: {
    lastPullCursor: string | null;
    lastPullAt: string | null;
  };
  serverTime: string;
};
```

### 7.3 同步流程

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        多设备同步流程                                    │
└─────────────────────────────────────────────────────────────────────────┘

1. 用户登录后
   ↓
2. 调用 syncService.getStatus()
   ├─ needsSync = false → 跳过
   └─ needsSync = true → 继续
   ↓
3. 显示同步提示
   ├─ 用户拒绝 → 跳过
   └─ 用户确认 → 继续
   ↓
4. 调用 syncService.runMetadataSync(userId)
   ├─ pullMetadata(lastCursor)
   ├─ 更新本地事件列表
   └─ ack(newCursor)
   ↓
5. 保存同步状态到本地
   ↓
6. 刷新 UI
```

### 7.4 本地同步存储

```typescript
// syncStorage.ts
type LocalSyncState = {
  lastCursor: string | null;
  lastPullAt: string | null;
};

// 存储路径
{documentDirectory}/sync-storage/{userId}.json
```

---

## 8. EXIF 提取

### 8.1 提取字段

```typescript
interface PhotoMetadata {
  uri: string;
  hash: string;
  width: number;
  height: number;
  fileSize?: number;
  exif: {
    gpsLat?: number;
    gpsLon?: number;
    hasGps: boolean;
    shootTime: string;
  };
}
```

### 8.2 提取方法

```typescript
// exifExtractor.ts
function extractPhotoMetadataList(
  assets: ImagePickerAsset[],
  hashes: string[]
): PhotoMetadata[];

// 从 ImagePicker 结果提取
// - GPS 坐标：exif.GPSLatitude, exif.GPSLongitude
// - 拍摄时间：exif.DateTimeOriginal
// - 尺寸：width, height
```

### 8.3 权限处理

| 平台 | 权限 | 说明 |
|------|------|------|
| iOS | `NSPhotoLibraryUsageDescription` | 相册访问 |
| Android | `READ_EXTERNAL_STORAGE` | 读取存储 |
| Android | `ACCESS_MEDIA_LOCATION` | 读取 GPS（可选） |

---

## 9. 错误处理

### 9.1 错误类型

| 错误 | 说明 | 处理方式 |
|------|------|----------|
| `photo_library_permission_denied` | 相册权限被拒绝 | 提示用户开启权限 |
| `media_library_permission_denied` | 媒体库权限被拒绝 | 提示用户开启权限 |
| 缩略图生成失败 | 文件损坏或格式不支持 | 跳过该照片，计入 failed |
| 上传失败 | 网络错误或服务端错误 | 计入 failed，可重试 |

### 9.2 降级策略

```typescript
// GPS 权限降级
if (canQueryAssetInfo) {
  try {
    const info = await MediaLibrary.getAssetInfoAsync(asset);
    location = info.location ?? null;
  } catch (e) {
    if (msg.includes('ACCESS_MEDIA_LOCATION')) {
      canQueryAssetInfo = false;  // 后续不再尝试
    }
    location = null;
  }
}
```

---

## 10. 性能约束

| 约束项 | 限制值 | 说明 |
|--------|--------|------|
| 单次选择上限 | 200 张 | ImagePicker 限制 |
| 自动导入上限 | 配置项 | 防止首次导入过多 |
| 导入间隔 | 配置项 | 防止频繁导入 |
| 重试退避 | 60 秒 | 失败后等待时间 |
| 缩略图宽度 | 1080 px | 平衡清晰度和大小 |

---

## 11. 测试要点

### 11.1 功能测试

- 上传成功/失败/重试路径
- 去重命中路径（重复照片）
- 多设备同步状态展示路径
- 权限拒绝后的提示

### 11.2 边界测试

- 无 GPS 照片处理
- 无拍摄时间照片处理
- 大批量照片导入
- 网络中断恢复

### 11.3 E2E 测试

- 完整导入流程
- 导入后事件列表刷新
- 同步后数据一致性

---

## 12. 关联模块

| 模块 | 文档 | 关联说明 |
|------|------|----------|
| 后端照片 | `backend/modules/photo.md` | 上传 API、去重逻辑 |
| 后端同步 | `backend/modules/sync.md` | 同步 API |
| 前端认证 | `frontend/modules/auth.md` | 登录后触发同步 |
| 任务 API | `mobile/src/services/api/taskApi.ts` | 聚类任务状态轮询 |

---

## 13. 变更影响

若本模块变更，需同步检查：

- [ ] `my-spec/system/backend/modules/photo.md`
- [ ] `my-spec/system/backend/modules/sync.md`
- [ ] `my-spec/system/backend/database/schema-dictionary.md`（若涉及字段）
- [ ] `my-spec/system/global/test-profile.yaml`（若新增测试场景）

---

> **最后更新**：2026-02-10
