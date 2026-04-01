import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';

import type { PhotoMetadata } from '@/types/photo';
import type { OnDeviceVisionResult } from '@/types/vision';
import { toSafeIsoDateTime } from '@/utils/dateTimeUtils';
import { photoApi } from '@/services/api/photoApi';
import { registerLocalMediaEntries } from '@/services/media/localMediaRegistry';
import {
  analyzeOnDeviceVisionNow,
  buildVisionInput,
} from '@/services/vision/onDeviceVisionService';
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

type ImportCache = {
  lastRunMs?: number;
  lastAttemptMs?: number;
  importedAssetIds?: string[];
};

export type ImportResult = {
  selected: number;
  dedupedNew: number;
  uploaded: number;
  failed: number;
  taskId?: string | null;
};

export type ImportCacheSummary = {
  assetCount: number;
  lastRunAt: string | null;
  lastAttemptAt: string | null;
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
): void {
  onProgress?.({ stage, current, total, detail });
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
  shootTime?: string | null;
  gpsLat?: number | null;
  gpsLon?: number | null;
  localUri?: string | null;
  localCoverUri?: string | null;
} {
  const shootTime = toSafeIsoDateTime(item.creationTime) ?? null;
  return {
    assetId: item.assetId ?? null,
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

async function resolvePickerAssets(
  assets: ImagePicker.ImagePickerAsset[],
  onProgress?: ProgressCb,
): Promise<ProcessedPickerItem[]> {
  const resolved: ProcessedPickerItem[] = [];

  setProgress(onProgress, 'scanning', 0, assets.length, '正在解析照片信息...');
  for (let index = 0; index < assets.length; index += 1) {
    const asset = assets[index];
    let uri = asset.uri;
    let location: { latitude: number; longitude: number } | null = null;
    let fileSize = asset.fileSize ?? undefined;
    let creationTime: number | undefined;

    if (asset.assetId) {
      try {
        const info = await MediaLibrary.getAssetInfoAsync(asset.assetId);
        uri = info.localUri ?? uri;
        location = info.location ?? null;
        creationTime =
          typeof (info as { creationTime?: number }).creationTime === 'number'
            ? (info as { creationTime: number }).creationTime
            : undefined;
      } catch (error) {
        console.warn('Failed to resolve media asset info:', asset.assetId, error);
      }
    }

    if (creationTime === undefined) {
      const assetWithCreationTime = asset as { creationTime?: number };
      creationTime =
        typeof assetWithCreationTime.creationTime === 'number'
          ? assetWithCreationTime.creationTime
          : undefined;
    }

    resolved.push({
      assetId: asset.assetId ?? undefined,
      uri,
      width: asset.width ?? 0,
      height: asset.height ?? 0,
      fileSize,
      creationTime,
      location,
      hasUsableUri: isUsableUri(uri),
    });
    setProgress(onProgress, 'scanning', index + 1, assets.length);
  }

  return resolved;
}

async function resolveOnDeviceVisionResults(
  items: ResolvedPickerItem[],
  onProgress?: (current: number, total: number) => void,
): Promise<Map<string, OnDeviceVisionResult>> {
  if (items.length === 0) {
    return new Map();
  }

  const inputs = items.map((item) =>
    buildVisionInput({
      assetId: item.assetId,
      localUri: item.uri,
      localCoverUri: item.uri,
      width: item.width,
      height: item.height,
      fileSize: item.fileSize,
    }),
  );

  const records = await analyzeOnDeviceVisionNow(inputs, onProgress);
  const results = new Map<string, OnDeviceVisionResult>();

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const record = records[index];
    if (record?.result) {
      results.set(item.assetId || item.uri, record.result);
    }
  }

  return results;
}

function mergeImportedAssetIds(existing: string[] | undefined, items: ResolvedPickerItem[]): string[] {
  const next = new Set(existing ?? []);

  for (const item of items) {
    if (item.assetId) {
      next.add(item.assetId);
    }
  }

  return Array.from(next);
}

export async function manualImportFromPicker(params: {
  selectionLimit?: number;
  onProgress?: ProgressCb;
}): Promise<ImportResult> {
  const selectionLimit = params.selectionLimit ?? 200;

  await updateImportCache((cache) => {
    cache.lastAttemptMs = Date.now();
  });

  setProgress(params.onProgress, 'scanning', undefined, undefined, '正在请求权限...');
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('photo_library_permission_denied');
  }

  const pickerResult = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit,
    exif: true,
    quality: 1,
  });

  if (pickerResult.canceled) {
    return { selected: 0, dedupedNew: 0, uploaded: 0, failed: 0, taskId: null };
  }

  const assets = pickerResult.assets ?? [];
  if (assets.length === 0) {
    return { selected: 0, dedupedNew: 0, uploaded: 0, failed: 0, taskId: null };
  }

  const resolved = await resolvePickerAssets(assets, params.onProgress);
  const processingFailed = resolved.filter((item) => !item.hasUsableUri).length;
  const importableItems = resolved.filter((item) => item.hasUsableUri);

  if (importableItems.length === 0) {
    await updateImportCache((cache) => {
      cache.lastRunMs = Date.now();
    });
    return {
      selected: assets.length,
      dedupedNew: 0,
      uploaded: 0,
      failed: processingFailed,
      taskId: null,
    };
  }

  setProgress(params.onProgress, 'dedup', undefined, undefined, '正在按 metadata 查重...');
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

  if (newItems.length === 0) {
    await updateImportCache((cache) => {
      cache.lastRunMs = Date.now();
    });
    return {
      selected: assets.length,
      dedupedNew: 0,
      uploaded: 0,
      failed: processingFailed,
      taskId: null,
    };
  }

  await registerLocalMediaEntries(
    newItems.map((item) => toRegistryEntry(item)),
  );

  setProgress(params.onProgress, 'vision', 0, newItems.length, '正在获取端侧结构化结果...');
  const visionResults = await resolveOnDeviceVisionResults(newItems, (current, total) =>
    setProgress(params.onProgress, 'vision', current, total, '正在获取端侧结构化结果...'),
  );

  const metadataList = newItems.map((item) => buildMetadataFromMediaAsset(item));

  setProgress(params.onProgress, 'uploading', 0, newItems.length, '正在上传 metadata...');
  const uploadResult = await photoApi.uploadPhotos(
    newItems.map((item, index) => ({
      metadata: metadataList[index],
      vision: visionResults.get(item.assetId || item.uri) ?? null,
    })),
    (current, total) => setProgress(params.onProgress, 'uploading', current, total),
  );

  if (uploadResult.items && uploadResult.items.length > 0) {
    const localItemByClientRef = new Map(newItems.map((item, index) => [String(index), item] as const));
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

    logMediaDebug('manualImport uploadResult', {
      uploaded: uploadResult.uploaded,
      failed: uploadResult.failed,
      returnedItems: uploadResult.items.length,
      sampleItems: uploadResult.items.slice(0, 8),
    });

    await registerLocalMediaEntries(
      registryEntries,
    );
    logMediaDebug('manualImport registeredPhotoIds', {
      count: registryEntries.length,
      photoKeys: registryEntries.slice(0, 8).map((entry) => entry.photoId),
    });
  }

  await updateImportCache((cache) => {
    cache.lastRunMs = Date.now();
    cache.importedAssetIds = mergeImportedAssetIds(cache.importedAssetIds, newItems);
  });

  return {
    selected: assets.length,
    dedupedNew: newItems.length,
    uploaded: uploadResult.uploaded,
    failed: uploadResult.failed + processingFailed,
    taskId: uploadResult.taskId ?? null,
  };
}

export async function getImportCacheSummary(): Promise<ImportCacheSummary> {
  const cache = await readImportCache();
  return {
    assetCount: cache.importedAssetIds?.length ?? 0,
    lastRunAt: toSafeIsoDateTime(cache.lastRunMs) ?? null,
    lastAttemptAt: toSafeIsoDateTime(cache.lastAttemptMs) ?? null,
  };
}

export async function clearImportCache(): Promise<number> {
  const cache = await readImportCache();
  const clearedAssetCount = cache.importedAssetIds?.length ?? 0;
  await writeImportCache({});
  return clearedAssetCount;
}
