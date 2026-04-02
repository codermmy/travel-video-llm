import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

import type { PhotoMetadata } from '@/types/photo';
import { toSafeIsoDateTime } from '@/utils/dateTimeUtils';
import { photoApi } from '@/services/api/photoApi';
import { registerLocalMediaEntries } from '@/services/media/localMediaRegistry';
import {
  createImportTask,
  failImportTask,
  finalizeImportTask,
  updateImportTaskProgress,
} from '@/services/import/importTaskService';
import { enqueueOnDeviceVisionSync } from '@/services/vision/onDeviceVisionQueueService';
import type { ImportProgress, ImportStage } from '@/components/import/ImportProgressModal';

type PhotoMetadataItem = {
  gpsLat?: number;
  gpsLon?: number;
  shootTime?: string;
  filename?: string;
};

type ResolvedPickerItem = {
  assetId?: string;
  uri: string;
  width: number;
  height: number;
  fileSize?: number;
  creationTime?: number;
  location?: { latitude: number; longitude: number } | null;
};

type ProcessedPickerItem = ResolvedPickerItem & {
  hasUsableUri: boolean;
};

const IMPORT_CACHE_DIR = 'import-cache';
const IMPORT_CACHE_FILE = 'photo-import-cache.json';
export const AUTO_IMPORT_LIMIT = 200;

type ImportSource = 'recent' | 'manual';

type ImportCache = {
  lastRunMs?: number;
  lastAttemptMs?: number;
  importedAssetIds?: string[];
  lastMode?: ImportSource;
};

export type ImportResult = {
  selected: number;
  dedupedNew: number;
  dedupedExisting: number;
  uploaded: number;
  queuedVision: number;
  failed: number;
  taskId?: string | null;
  importTaskId?: string | null;
};

export type ImportCacheSummary = {
  assetCount: number;
  lastRunAt: string | null;
  lastAttemptAt: string | null;
  lastMode: ImportSource | null;
};

type ProgressCb = (progress: ImportProgress) => void;

function logMediaDebug(label: string, payload: Record<string, unknown>): void {
  if (__DEV__) {
    console.log(`[MediaDebug] ${label}`, payload);
  }
}

function getImportCacheDir(): string {
  const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!baseDir) {
    throw new Error('No FileSystem base directory available for import cache');
  }
  return `${baseDir}${IMPORT_CACHE_DIR}/`;
}

function getImportCachePath(): string {
  return `${getImportCacheDir()}${IMPORT_CACHE_FILE}`;
}

async function ensureImportCacheDir(): Promise<void> {
  const dir = getImportCacheDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

async function readImportCache(): Promise<ImportCache> {
  try {
    await ensureImportCacheDir();
    const path = getImportCachePath();
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) {
      return {};
    }
    const raw = await FileSystem.readAsStringAsync(path);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    return parsed as ImportCache;
  } catch (error) {
    console.warn('Failed to read import cache:', error);
    return {};
  }
}

async function writeImportCache(cache: ImportCache): Promise<void> {
  try {
    await ensureImportCacheDir();
    await FileSystem.writeAsStringAsync(getImportCachePath(), JSON.stringify(cache));
  } catch (error) {
    console.warn('Failed to write import cache:', error);
  }
}

async function updateImportCache(update: (cache: ImportCache) => void): Promise<void> {
  const cache = await readImportCache();
  update(cache);
  await writeImportCache(cache);
}

function setProgress(
  onProgress: ProgressCb | undefined,
  stage: ImportStage,
  current?: number,
  total?: number,
  detail?: string,
  importTaskId?: string | null,
): void {
  const progress = { stage, current, total, detail };
  onProgress?.(progress);
  void updateImportTaskProgress(importTaskId, progress);
}

function isUsableUri(uri: string | null | undefined): uri is string {
  return typeof uri === 'string' && uri.trim().length > 0;
}

function buildMetadataFromMediaAsset(params: ResolvedPickerItem): PhotoMetadata {
  const gpsLat = params.location?.latitude;
  const gpsLon = params.location?.longitude;
  const hasGps = typeof gpsLat === 'number' && typeof gpsLon === 'number';
  const shootTime = toSafeIsoDateTime(params.creationTime) ?? '';

  return {
    assetId: params.assetId,
    localUri: params.uri,
    localCoverUri: params.uri,
    uri: params.uri,
    width: params.width,
    height: params.height,
    fileSize: params.fileSize,
    exif: {
      gpsLat,
      gpsLon,
      hasGps,
      shootTime,
    },
  };
}

function toRegistryEntry(item: ResolvedPickerItem): {
  photoId?: string | null;
  assetId?: string | null;
  width?: number | null;
  height?: number | null;
  shootTime?: string | null;
  gpsLat?: number | null;
  gpsLon?: number | null;
  localUri?: string | null;
  localCoverUri?: string | null;
} {
  const shootTime = toSafeIsoDateTime(item.creationTime) ?? null;
  return {
    assetId: item.assetId ?? null,
    width: item.width,
    height: item.height,
    shootTime,
    gpsLat: item.location?.latitude ?? null,
    gpsLon: item.location?.longitude ?? null,
    localUri: item.uri,
    localCoverUri: item.uri,
  };
}

function buildMetadataItem(params: {
  assetId?: string;
  creationTime?: number;
  location?: { latitude: number; longitude: number } | null;
}): PhotoMetadataItem {
  return {
    gpsLat: params.location?.latitude,
    gpsLon: params.location?.longitude,
    shootTime: toSafeIsoDateTime(params.creationTime) ?? undefined,
    filename: params.assetId,
  };
}

function getMetadataDedupKey(item: PhotoMetadataItem): string | null {
  if (!item.shootTime) {
    return null;
  }
  if (item.gpsLat === undefined && item.gpsLon === undefined) {
    return `${item.shootTime}|nogps`;
  }
  if (item.gpsLat === undefined || item.gpsLon === undefined) {
    return null;
  }
  return `${item.shootTime}|${item.gpsLat}|${item.gpsLon}`;
}

function dedupeMetadataIndices(indices: number[], items: PhotoMetadataItem[]): number[] {
  const seen = new Set<string>();
  const deduped: number[] = [];

  for (const index of indices) {
    const item = items[index];
    if (!item) {
      continue;
    }

    const key = getMetadataDedupKey(item);
    if (!key) {
      deduped.push(index);
      continue;
    }

    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(index);
  }

  return deduped;
}

async function resolveLibraryAssets(
  assets: MediaLibrary.Asset[],
  onProgress?: ProgressCb,
  importTaskId?: string | null,
): Promise<ProcessedPickerItem[]> {
  const resolved: ProcessedPickerItem[] = [];

  setProgress(onProgress, 'scanning', 0, assets.length, '正在解析照片信息...', importTaskId);
  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index];
    let uri = asset.uri ?? '';
    let location: { latitude: number; longitude: number } | null = null;
    let fileSize: number | undefined;
    let creationTime: number | undefined = asset.creationTime;

    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset.id);
      uri = info.localUri ?? info.uri ?? uri;
      location = info.location ?? null;
      creationTime =
        typeof (info as { creationTime?: number }).creationTime === 'number'
          ? (info as { creationTime: number }).creationTime
          : creationTime;
      const fileInfo = info as unknown as { fileSize?: number };
      fileSize = typeof fileInfo.fileSize === 'number' ? fileInfo.fileSize : undefined;
    } catch (error) {
      console.warn('Failed to resolve media asset info:', asset.id, error);
    }

    resolved.push({
      assetId: asset.id,
      uri,
      width: asset.width ?? 0,
      height: asset.height ?? 0,
      fileSize,
      creationTime,
      location,
      hasUsableUri: isUsableUri(uri),
    });
    setProgress(onProgress, 'scanning', index + 1, assets.length, undefined, importTaskId);
  }

  return resolved;
}

function mergeImportedAssetIds(
  existing: string[] | undefined,
  items: ResolvedPickerItem[],
): string[] {
  const next = new Set(existing ?? []);

  for (const item of items) {
    if (item.assetId) {
      next.add(item.assetId);
    }
  }

  return Array.from(next);
}

async function resolveRecentAssets(
  limit: number,
  onProgress?: ProgressCb,
  importTaskId?: string | null,
): Promise<ProcessedPickerItem[]> {
  const page = await MediaLibrary.getAssetsAsync({
    first: limit,
    mediaType: [MediaLibrary.MediaType.photo],
    sortBy: [['creationTime', false]],
  });
  const assets = page.assets ?? [];
  const resolved: ProcessedPickerItem[] = [];

  setProgress(
    onProgress,
    'scanning',
    0,
    assets.length,
    `正在读取最近 ${limit} 张照片...`,
    importTaskId,
  );
  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index];
    let uri = asset.uri;
    let location: { latitude: number; longitude: number } | null = null;

    try {
      const info = await MediaLibrary.getAssetInfoAsync(asset.id);
      uri = info.localUri ?? info.uri ?? uri;
      location = info.location ?? null;
    } catch (error) {
      console.warn('Failed to resolve recent media asset info:', asset.id, error);
    }

    resolved.push({
      assetId: asset.id,
      uri,
      width: asset.width ?? 0,
      height: asset.height ?? 0,
      fileSize: undefined,
      creationTime: asset.creationTime,
      location,
      hasUsableUri: isUsableUri(uri),
    });
    setProgress(onProgress, 'scanning', index + 1, assets.length, undefined, importTaskId);
  }

  return resolved;
}

async function finalizeImportCache(params: {
  source: ImportSource;
  importedItems?: ResolvedPickerItem[];
}): Promise<void> {
  await updateImportCache((cache) => {
    cache.lastRunMs = Date.now();
    cache.lastMode = params.source;
    if (params.importedItems) {
      cache.importedAssetIds = mergeImportedAssetIds(cache.importedAssetIds, params.importedItems);
    }
  });
}

async function runMetadataOnlyImport(params: {
  selectedCount: number;
  source: ImportSource;
  resolved: ProcessedPickerItem[];
  onProgress?: ProgressCb;
  targetEventId?: string | null;
  importTaskId?: string | null;
}): Promise<ImportResult> {
  const processingFailed = params.resolved.filter((item) => !item.hasUsableUri).length;
  const importableItems = params.resolved.filter((item) => item.hasUsableUri);

  if (importableItems.length === 0) {
    await finalizeImportCache({ source: params.source });
    return {
      selected: params.selectedCount,
      dedupedNew: 0,
      dedupedExisting: 0,
      uploaded: 0,
      queuedVision: 0,
      failed: processingFailed,
      taskId: null,
      importTaskId: params.importTaskId ?? null,
    };
  }

  setProgress(
    params.onProgress,
    'dedup',
    undefined,
    undefined,
    '正在按 metadata 查重...',
    params.importTaskId,
  );
  const metadataItems = importableItems.map((item) =>
    buildMetadataItem({
      assetId: item.assetId,
      creationTime: item.creationTime,
      location: item.location,
    }),
  );
  const dedup = await photoApi.checkDuplicatesByMetadata(metadataItems);
  const newItemIndices = dedupeMetadataIndices(dedup.newIndices, metadataItems);
  const newItems = newItemIndices
    .map((index) => importableItems[index])
    .filter((item): item is ProcessedPickerItem => Boolean(item));
  const dedupedExisting = Math.max(importableItems.length - newItems.length, 0);

  if (newItems.length === 0) {
    await finalizeImportCache({ source: params.source });
    return {
      selected: params.selectedCount,
      dedupedNew: 0,
      dedupedExisting,
      uploaded: 0,
      queuedVision: 0,
      failed: processingFailed,
      taskId: null,
      importTaskId: params.importTaskId ?? null,
    };
  }

  await registerLocalMediaEntries(newItems.map((item) => toRegistryEntry(item)));

  const metadataList = newItems.map((item) => buildMetadataFromMediaAsset(item));

  setProgress(
    params.onProgress,
    'uploading',
    0,
    newItems.length,
    '正在同步 metadata...',
    params.importTaskId,
  );
  const uploadResult = await photoApi.uploadPhotos(
    newItems.map((item, index) => ({
      metadata: metadataList[index],
    })),
    (current, total) =>
      setProgress(params.onProgress, 'uploading', current, total, undefined, params.importTaskId),
    { triggerClustering: !params.targetEventId },
  );

  let queuedVision = 0;
  if (uploadResult.items && uploadResult.items.length > 0) {
    const localItemByClientRef = new Map(
      newItems.map((item, index) => [String(index), item] as const),
    );
    const registryEntries = uploadResult.items
      .map((uploadedItem) => {
        const localItem = localItemByClientRef.get(uploadedItem.clientRef ?? '');
        if (!localItem) {
          return null;
        }
        return {
          ...toRegistryEntry(localItem),
          photoId: uploadedItem.id,
          assetId: uploadedItem.assetId ?? localItem.assetId ?? null,
          shootTime: uploadedItem.shootTime ?? toSafeIsoDateTime(localItem.creationTime) ?? null,
          gpsLat: uploadedItem.gpsLat ?? localItem.location?.latitude ?? null,
          gpsLon: uploadedItem.gpsLon ?? localItem.location?.longitude ?? null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    logMediaDebug(`${params.source}Import uploadResult`, {
      uploaded: uploadResult.uploaded,
      failed: uploadResult.failed,
      returnedItems: uploadResult.items.length,
      sampleItems: uploadResult.items.slice(0, 8),
    });

    await registerLocalMediaEntries(registryEntries);
    queuedVision = await enqueueOnDeviceVisionSync(
      uploadResult.items
        .map((uploadedItem) => {
          const localItem = localItemByClientRef.get(uploadedItem.clientRef ?? '');
          if (!localItem) {
            return null;
          }
          return {
            photoId: uploadedItem.id,
            importTaskId: params.importTaskId ?? null,
            assetId: uploadedItem.assetId ?? localItem.assetId,
            localUri: localItem.uri,
            localCoverUri: localItem.uri,
            width: localItem.width,
            height: localItem.height,
            fileSize: localItem.fileSize,
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    );
    logMediaDebug(`${params.source}Import registeredPhotoIds`, {
      count: registryEntries.length,
      photoKeys: registryEntries.slice(0, 8).map((entry) => entry.photoId),
      queuedVision,
    });

    if (params.targetEventId) {
      const uploadedPhotoIds = uploadResult.items.map((item) => item.id);
      if (uploadedPhotoIds.length > 0) {
        await photoApi.reassignPhotosToEvent(uploadedPhotoIds, params.targetEventId);
      }
    }
  }

  setProgress(
    params.onProgress,
    'clustering',
    undefined,
    undefined,
    params.targetEventId
      ? queuedVision > 0
        ? '照片已导入到当前事件，端侧分析会继续在后台完成...'
        : '照片已导入到当前事件，事件摘要正在刷新...'
      : queuedVision > 0
        ? 'metadata 已同步，事件正在聚合，照片内容会在后台继续分析...'
        : 'metadata 已同步，正在聚合事件...',
    params.importTaskId,
  );

  await finalizeImportCache({ source: params.source, importedItems: newItems });

  return {
    selected: params.selectedCount,
    dedupedNew: newItems.length,
    dedupedExisting,
    uploaded: uploadResult.uploaded,
    queuedVision,
    failed: uploadResult.failed + processingFailed,
    taskId: uploadResult.taskId ?? null,
    importTaskId: params.importTaskId ?? null,
  };
}

export async function importRecentPhotos(params?: {
  limit?: number;
  onProgress?: ProgressCb;
}): Promise<ImportResult> {
  const limit = params?.limit ?? AUTO_IMPORT_LIMIT;

  await updateImportCache((cache) => {
    cache.lastAttemptMs = Date.now();
    cache.lastMode = 'recent';
  });

  setProgress(params?.onProgress, 'scanning', undefined, undefined, '正在请求相册权限...');
  const permission = await MediaLibrary.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error('photo_library_permission_denied');
  }

  const importTaskId = await createImportTask({
    source: 'recent',
    detail: `正在准备导入最近 ${limit} 张照片...`,
  });

  try {
    const resolved = await resolveRecentAssets(limit, params?.onProgress, importTaskId);
    const result = await runMetadataOnlyImport({
      selectedCount: resolved.length,
      source: 'recent',
      resolved,
      onProgress: params?.onProgress,
      importTaskId,
    });
    await finalizeImportTask(importTaskId, result);
    return result;
  } catch (error) {
    await failImportTask(
      importTaskId,
      error instanceof Error ? error.message : '导入失败，请稍后重试',
    );
    throw error;
  }
}

export async function importSelectedLibraryAssets(params: {
  assets: MediaLibrary.Asset[];
  targetEventId?: string | null;
  onProgress?: ProgressCb;
}): Promise<ImportResult> {
  await updateImportCache((cache) => {
    cache.lastAttemptMs = Date.now();
    cache.lastMode = 'manual';
  });

  if (params.assets.length === 0) {
    return {
      selected: 0,
      dedupedNew: 0,
      dedupedExisting: 0,
      uploaded: 0,
      queuedVision: 0,
      failed: 0,
      taskId: null,
      importTaskId: null,
    };
  }

  const importTaskId = await createImportTask({
    source: 'manual',
    detail: params.targetEventId ? '正在准备补导入到当前事件...' : '正在准备手动补导入...',
  });

  try {
    const resolved = await resolveLibraryAssets(params.assets, params.onProgress, importTaskId);
    const result = await runMetadataOnlyImport({
      selectedCount: params.assets.length,
      source: 'manual',
      resolved,
      onProgress: params.onProgress,
      targetEventId: params.targetEventId,
      importTaskId,
    });
    await finalizeImportTask(importTaskId, result, {
      targetEventId: params.targetEventId,
    });
    return result;
  } catch (error) {
    await failImportTask(
      importTaskId,
      error instanceof Error ? error.message : '导入失败，请稍后重试',
    );
    throw error;
  }
}

export async function getImportCacheSummary(): Promise<ImportCacheSummary> {
  const cache = await readImportCache();
  return {
    assetCount: cache.importedAssetIds?.length ?? 0,
    lastRunAt: toSafeIsoDateTime(cache.lastRunMs) ?? null,
    lastAttemptAt: toSafeIsoDateTime(cache.lastAttemptMs) ?? null,
    lastMode: cache.lastMode === 'manual' || cache.lastMode === 'recent' ? cache.lastMode : null,
  };
}

export async function clearImportCache(): Promise<number> {
  const cache = await readImportCache();
  const clearedAssetCount = cache.importedAssetIds?.length ?? 0;
  await writeImportCache({});
  return clearedAssetCount;
}
