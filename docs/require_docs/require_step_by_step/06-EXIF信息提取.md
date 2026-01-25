# 任务 ID: 06 - EXIF 信息提取

## 📋 基本信息

| 项目 | 内容 |
|------|------|
| **任务名称** | EXIF 信息提取 |
| **所属阶段** | Stage-03 照片管理 |
| **预估工期** | 0.5 天 |
| **前置条件** | Task-05 照片哈希计算 |

---

## 1. 任务目标

从照片中提取 EXIF 元数据，特别是 GPS 坐标和拍摄时间。

**核心功能**：
- 提取 GPS 坐标（经度、纬度）
- 提取拍摄时间（DateTimeOriginal）
- 提取相机信息（可选）
- 处理无 EXIF 的照片
- 处理无 GPS 的照片

---

## 2. 前置条件

- [x] Task-05 已完成
- [x] expo-image-picker 已安装

---

## 3. 实现细节

### 3.1 涉及文件

```
mobile/
├── src/
│   ├── types/
│   │   └── photo.ts               # ✏️ 修改：添加 EXIF 类型
│   ├── utils/
│   │   └── exifUtils.ts           # ✨ 新建：EXIF 提取工具
│   └── services/
│       └── album/
│           └── exifExtractor.ts    # ✨ 新建：EXIF 提取服务
```

### 3.2 技术方案

**EXIF 读取方案**：
- iOS: `expo-image-picker` 的 `ImagePickerAsset` 已包含部分 EXIF
- Android: 同上
- 补充方案：使用 `expo-image-manipulator` 读取更多元数据

**关键数据**：
- GPS 经纬度：`asset.location`
- 拍摄时间：`asset.creationTime` 或 EXIF DateTimeOriginal
- 尺寸信息：`asset.width`, `asset.height`

### 3.3 类型定义

#### `src/types/photo.ts`

```typescript
/**
 * EXIF 信息类型
 */
export interface PhotoExif {
  // GPS 信息
  gpsLat?: number;      // 纬度，范围 -90 ~ 90
  gpsLon?: number;      // 经度，范围 -180 ~ 180
  hasGps: boolean;      // 是否有 GPS 信息

  // 时间信息
  shootTime: string;    // 拍摄时间，ISO 8601 格式

  // 相机信息（可选）
  cameraMake?: string;  // 相机厂商
  cameraModel?: string; // 相机型号

  // 其他
  orientation?: number; // 图片方向
}

/**
 * 照片元数据（用于上传）
 */
export interface PhotoMetadata {
  uri: string;          // 本地 URI
  hash: string;         // SHA-256 哈希
  exif: PhotoExif;      // EXIF 信息
  width: number;        // 宽度
  height: number;       // 高度
  fileSize: number;     // 文件大小（字节）
}
```

### 3.4 核心代码实现

#### `src/utils/exifUtils.ts`

```typescript
/**
 * EXIF 信息提取工具
 */
import * as ImagePicker from 'expo-image-picker';

export interface ExifData {
  gpsLat?: number;
  gpsLon?: number;
  hasGps: boolean;
  shootTime: string;
  cameraMake?: string;
  cameraModel?: string;
}

/**
 * 从 ImagePicker Asset 提取 EXIF 信息
 *
 * @param asset - ImagePicker 返回的资产对象
 * @returns EXIF 数据
 */
export function extractExifFromAsset(asset: ImagePicker.ImagePickerAsset): ExifData {
  // 1. 提取 GPS 信息
  const hasGps = !!asset.location;
  const gpsLat = asset.location?.latitude;
  const gpsLon = asset.location?.longitude;

  // 2. 提取拍摄时间
  // 优先使用 EXIF 时间，降级使用文件创建时间
  const shootTime = asset.exif?.DateTimeOriginal ||
                    asset.exif?.DateTimeDigitized ||
                    asset.creationTime ||
                    new Date().toISOString();

  // 3. 提取相机信息
  const cameraMake = asset.exif?.Make;
  const cameraModel = asset.exif?.Model;

  return {
    gpsLat,
    gpsLon,
    hasGps,
    shootTime: normalizeDateTime(shootTime),
    cameraMake,
    cameraModel,
  };
}

/**
 * 标准化日期时间格式为 ISO 8601
 *
 * EXIF 中的日期格式可能是：YYYY:MM:DD HH:MM:SS
 * 需要转换为：YYYY-MM-DDTHH:MM:SS
 *
 * @param dateTime - 原始日期时间字符串
 * @returns ISO 8601 格式的日期时间
 */
function normalizeDateTime(dateTime: string | undefined): string {
  if (!dateTime) {
    return new Date().toISOString();
  }

  try {
    // EXIF 格式: YYYY:MM:DD HH:MM:SS
    // 转换为: YYYY-MM-DD HH:MM:SS
    const normalized = dateTime
      .replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3')
      .replace(' ', 'T');

    const date = new Date(normalized);

    if (isNaN(date.getTime())) {
      return new Date().toISOString();
    }

    return date.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/**
 * 验证 GPS 坐标是否有效
 *
 * @param lat - 纬度
 * @param lon - 经度
 * @returns 是否有效
 */
export function isValidGps(lat?: number, lon?: number): boolean {
  if (lat === undefined || lon === undefined) {
    return false;
  }

  return (
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

/**
 * 格式化 GPS 坐标为字符串（用于调试）
 *
 * @param lat - 纬度
 * @param lon - 经度
 * @returns 格式化的字符串，如 "30.2592°N, 120.2153°E"
 */
export function formatGps(lat: number, lon: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';

  return `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lon).toFixed(4)}°${lonDir}`;
}
```

#### `src/services/album/exifExtractor.ts`

```typescript
/**
 * EXIF 提取服务
 */
import * as ImagePicker from 'expo-image-picker';
import { extractExifFromAsset, isValidGps } from '@/utils/exifUtils';
import type { PhotoExif, PhotoMetadata } from '@/types';

/**
 * 从单个资产提取完整元数据
 *
 * @param asset - ImagePicker 资产
 * @param hash - 已计算的哈希值
 * @returns 照片元数据
 */
export async function extractPhotoMetadata(
  asset: ImagePicker.ImagePickerAsset,
  hash: string
): Promise<PhotoMetadata> {
  // 提取 EXIF
  const exif = extractExifFromAsset(asset);

  return {
    uri: asset.uri,
    hash,
    exif,
    width: asset.width || 0,
    height: asset.height || 0,
    fileSize: 0, // expo-image-picker 不直接提供，需要额外读取
  };
}

/**
 * 批量提取照片元数据
 *
 * @param assets - ImagePicker 资产数组
 * @param hashes - 对应的哈希值数组
 * @returns 照片元数据数组
 */
export async function extractPhotoMetadataList(
  assets: ImagePicker.ImagePickerAsset[],
  hashes: string[]
): Promise<PhotoMetadata[]> {
  if (assets.length !== hashes.length) {
    throw new Error('资产和哈希数量不匹配');
  }

  const results: PhotoMetadata[] = [];

  for (let i = 0; i < assets.length; i++) {
    const metadata = await extractPhotoMetadata(assets[i], hashes[i]);
    results.push(metadata);
  }

  return results;
}

/**
 * 按是否有 GPS 分组照片
 *
 * @param metadataList - 照片元数据列表
 * @returns 有 GPS 的照片和无 GPS 的照片
 */
export function groupByGps(
  metadataList: PhotoMetadata[]
): {
  withGps: PhotoMetadata[];
  withoutGps: PhotoMetadata[];
} {
  const withGps: PhotoMetadata[] = [];
  const withoutGps: PhotoMetadata[] = [];

  for (const metadata of metadataList) {
    if (isValidGps(metadata.exif.gpsLat, metadata.exif.gpsLon)) {
      withGps.push(metadata);
    } else {
      withoutGps.push(metadata);
    }
  }

  return { withGps, withoutGps };
}

/**
 * 获取照片拍摄时间的可读格式
 *
 * @param metadata - 照片元数据
 * @returns 格式化的日期字符串，如 "2024年10月1日 14:30"
 */
export function formatShootTime(metadata: PhotoMetadata): string {
  const date = new Date(metadata.exif.shootTime);

  if (isNaN(date.getTime())) {
    return '未知时间';
  }

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');

  return `${year}年${month}月${day}日 ${hours}:${minutes}`;
}
```

---

## 4. 预期行为

### 4.1 有 GPS 的照片

```typescript
// 输入
const asset = {
  uri: 'content://...',
  location: { latitude: 30.2591727, longitude: 120.2152914 },
  creationTime: '2024-10-01T10:30:00Z',
  exif: { Make: 'Apple', Model: 'iPhone 14' }
};

// 输出
{
  gpsLat: 30.2591727,
  gpsLon: 120.2152914,
  hasGps: true,
  shootTime: '2024-10-01T10:30:00Z',
  cameraMake: 'Apple',
  cameraModel: 'iPhone 14'
}
```

### 4.2 无 GPS 的照片

```typescript
// 输入
const asset = {
  uri: 'content://...',
  location: null,
  creationTime: '2024-10-01T10:30:00Z'
};

// 输出
{
  gpsLat: undefined,
  gpsLon: undefined,
  hasGps: false,
  shootTime: '2024-10-01T10:30:00Z'
}
```

---

## 5. 验收标准

### 5.1 功能测试

- [ ] 能正确提取有 GPS 照片的坐标
- [ ] 能正确处理无 GPS 照片（hasGps=false）
- [ ] 能正确解析拍摄时间
- [ ] 能处理各种日期格式
- [ ] 能提取相机信息（可选）

### 5.2 手动测试

```typescript
// 测试代码
const testExif = async () => {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 1,
    exif: true,  // 重要：确保返回 EXIF
  });

  if (!result.canceled && result.assets[0]) {
    const exif = extractExifFromAsset(result.assets[0]);
    console.log('EXIF:', exif);
    Alert.alert('EXIF 信息', JSON.stringify(exif, null, 2));
  }
};
```

### 5.3 边界测试

| 场景 | 预期结果 |
|------|----------|
| 截图（无 GPS） | hasGps=false |
| 老照片（无 EXIF） | 使用文件创建时间 |
| 日期格式异常 | 返回当前时间 |
| 极端 GPS 坐标 | 正确解析 |

---

## 6. 风险与注意事项

### 6.1 expo-image-picker 配置

确保调用时设置 `exif: true`：

```typescript
await ImagePicker.launchImageLibraryAsync({
  mediaTypes: ['images'],
  quality: 1,
  exif: true,  // 关键！
});
```

### 6.2 iOS 隐私限制

iOS 上访问 GPS 信息可能需要额外权限说明。

### 6.3 无 GPS 照片处理

根据需求确认：
- **方案A**：不参与聚类（已确认）
- **方案B**：仅凭时间聚类

当前实现：标记 `hasGps=false`，后续聚类任务根据此标记处理。

### 6.4 时区问题

EXIF 中的时间通常是本地时区，需要统一转换为 UTC。

---

## 7. 完成检查清单

- [ ] `src/types/photo.ts` 已更新
- [ ] `src/utils/exifUtils.ts` 已实现
- [ ] `src/services/album/exifExtractor.ts` 已实现
- [ ] 功能测试通过
- [ ] 边界测试通过
- [ ] 代码符合开发规范

---

**任务完成后，进入 [Task-07: 缩略图生成](./07-缩略图生成.md)**
