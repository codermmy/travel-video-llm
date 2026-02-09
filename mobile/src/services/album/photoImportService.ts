import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';

import type { PhotoMetadata, PhotoUploadResult } from '@/types/photo';
import { toSafeEpochMs, toSafeIsoDateTime } from '@/utils/dateTimeUtils';
import { isValidHash } from '@/utils/hashUtils';
import { photoApi } from '@/services/api/photoApi';
import { extractPhotoMetadataList } from './exifExtractor';
import {
  generateAndSaveThumbnailWithHash,
  getThumbnailPath,
  hasThumbnail,
} from './thumbnailGenerator';
import type { ImportProgress, ImportStage } from '@/components/import/ImportProgressModal';

const IMPORT_CACHE_DIR = 'import-cache';
const IMPORT_CACHE_FILE = 'photo-import-cache.json';
const AUTO_IMPORT_RETRY_BACKOFF_MS = 60 * 1000;

type ImportCache = {
  lastRunMs?: number;
  lastAttemptMs?: number;
  assetHashById?: Record<string, string>;
};

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
  } catch (e) {
    console.warn('Failed to read import cache:', e);
    return {};
  }
}

async function writeImportCache(cache: ImportCache): Promise<void> {
  try {
    await ensureImportCacheDir();
    const path = getImportCachePath();
    await FileSystem.writeAsStringAsync(path, JSON.stringify(cache));
  } catch (e) {
    console.warn('Failed to write import cache:', e);
  }
}

async function updateImportCache(update: (cache: ImportCache) => void): Promise<void> {
  const cache = await readImportCache();
  update(cache);
  await writeImportCache(cache);
}

async function loadAssetHashCache(assetIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = Array.from(
    new Set(assetIds.filter((id) => typeof id === 'string' && id.trim().length > 0)),
  );
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const cache = await readImportCache();
  const lookup = cache.assetHashById ?? {};
  const result = new Map<string, string>();
  for (const assetId of uniqueIds) {
    const value = lookup[assetId];
    if (value && isValidHash(value)) {
      result.set(assetId, value);
    }
  }
  return result;
}

async function storeAssetHashCache(entries: { assetId: string; hash: string }[]): Promise<void> {
  const valid = entries.filter((entry) => entry.assetId && isValidHash(entry.hash));
  if (valid.length === 0) {
    return;
  }

  await updateImportCache((cache) => {
    const next = cache.assetHashById ?? {};
    for (const entry of valid) {
      next[entry.assetId] = entry.hash;
    }
    cache.assetHashById = next;
  });
}

export type ImportResult = {
  selected: number;
  dedupedNew: number;
  uploaded: number;
  failed: number;
  taskId?: string | null;
};

type ProgressCb = (progress: ImportProgress) => void;

function setProgress(
  onProgress: ProgressCb | undefined,
  stage: ImportStage,
  current?: number,
  total?: number,
  detail?: string,
): void {
  onProgress?.({ stage, current, total, detail });
}

function buildMetadataFromMediaAsset(params: {
  uri: string;
  hash: string;
  width: number;
  height: number;
  fileSize?: number;
  creationTime?: number;
  location?: { latitude: number; longitude: number } | null;
}): PhotoMetadata {
  const gpsLat = params.location?.latitude;
  const gpsLon = params.location?.longitude;
  const hasGps = typeof gpsLat === 'number' && typeof gpsLon === 'number';
  const shootTime = toSafeIsoDateTime(params.creationTime) ?? '';

  return {
    uri: params.uri,
    hash: params.hash,
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

export async function manualImportFromPicker(params: {
  selectionLimit?: number;
  onProgress?: ProgressCb;
}): Promise<ImportResult> {
  const selectionLimit = params.selectionLimit ?? 200;

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

  setProgress(params.onProgress, 'scanning', 0, assets.length, '正在解析照片信息...');
  const resolved: { asset: ImagePicker.ImagePickerAsset; uri: string }[] = [];
  for (let i = 0; i < assets.length; i += 1) {
    const asset = assets[i];
    let uri = asset.uri;
    if (asset.assetId) {
      try {
        const info = await MediaLibrary.getAssetInfoAsync(asset.assetId);
        uri = info.localUri ?? uri;
      } catch {
        uri = asset.uri;
      }
    }
    resolved.push({ asset, uri });
    setProgress(params.onProgress, 'scanning', i + 1, assets.length);
  }

  const cache = await loadAssetHashCache(
    resolved
      .map((x) => x.asset.assetId)
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
  );

  setProgress(params.onProgress, 'thumbnail', 0, resolved.length, '正在生成缩略图并计算哈希...');
  const newCacheEntries: { assetId: string; hash: string }[] = [];
  const processed: {
    asset: ImagePicker.ImagePickerAsset;
    uri: string;
    hash: string;
    thumbnailPath: string;
  }[] = [];
  for (let i = 0; i < resolved.length; i += 1) {
    const item = resolved[i];
    try {
      const assetId = item.asset.assetId;
      const cachedHash = assetId ? cache.get(assetId) : undefined;
      if (assetId && cachedHash && (await hasThumbnail(cachedHash))) {
        processed.push({
          asset: item.asset,
          uri: item.uri,
          hash: cachedHash,
          thumbnailPath: getThumbnailPath(cachedHash),
        });
      } else {
        const thumb = await generateAndSaveThumbnailWithHash(item.uri);
        processed.push({
          asset: item.asset,
          uri: item.uri,
          hash: thumb.hash,
          thumbnailPath: thumb.uri,
        });
        if (assetId) {
          cache.set(assetId, thumb.hash);
          newCacheEntries.push({ assetId, hash: thumb.hash });
        }
      }
    } catch (e) {
      console.warn('generateAndSaveThumbnailWithHash failed:', item.uri, e);
      processed.push({ asset: item.asset, uri: item.uri, hash: '', thumbnailPath: '' });
    } finally {
      setProgress(params.onProgress, 'thumbnail', i + 1, resolved.length);
    }
  }

  await storeAssetHashCache(newCacheEntries);

  const uniqueHashes = Array.from(new Set(processed.map((p) => p.hash).filter((h) => Boolean(h))));
  if (uniqueHashes.length === 0) {
    return {
      selected: assets.length,
      dedupedNew: 0,
      uploaded: 0,
      failed: assets.length,
      taskId: null,
    };
  }

  setProgress(params.onProgress, 'dedup', undefined, undefined, '正在查重...');
  const dedup = await photoApi.checkDuplicates(uniqueHashes);
  const newHashSet = new Set(dedup.newHashes);

  const newItemsRaw = processed.filter((p) => p.hash && p.thumbnailPath && newHashSet.has(p.hash));
  const byHash = new Map<string, (typeof newItemsRaw)[number]>();
  for (const item of newItemsRaw) {
    if (!byHash.has(item.hash)) {
      byHash.set(item.hash, item);
    }
  }
  const newItems = Array.from(byHash.values());

  const processingFailed = processed.filter((p) => !p.hash || !p.thumbnailPath).length;

  if (newItems.length === 0) {
    return {
      selected: assets.length,
      dedupedNew: 0,
      uploaded: 0,
      failed: processingFailed,
      taskId: null,
    };
  }

  const metadataList = extractPhotoMetadataList(
    newItems.map((p) => p.asset),
    newItems.map((p) => p.hash),
  );

  setProgress(params.onProgress, 'uploading', 0, newItems.length);
  const uploadResult = await photoApi.uploadPhotos(
    newItems.map((p, index) => ({
      uri: p.uri,
      hash: p.hash,
      metadata: metadataList[index],
      thumbnailPath: p.thumbnailPath,
    })),
    (current, total) => setProgress(params.onProgress, 'uploading', current, total),
  );

  return {
    selected: assets.length,
    dedupedNew: newItems.length,
    uploaded: uploadResult.uploaded,
    failed: uploadResult.failed + processingFailed,
    taskId: uploadResult.taskId ?? null,
  };
}

export async function autoImportRecentMonths(params: {
  months: number;
  maxPhotos: number;
  minIntervalMs: number;
  onProgress?: ProgressCb;
}): Promise<ImportResult> {
  const now = Date.now();

  const initialCache = await readImportCache();
  const lastRun = Number(initialCache.lastRunMs ?? 0);
  if (Number.isFinite(lastRun) && now - lastRun < params.minIntervalMs) {
    return { selected: 0, dedupedNew: 0, uploaded: 0, failed: 0, taskId: null };
  }

  const lastAttempt = Number(initialCache.lastAttemptMs ?? 0);
  if (
    Number.isFinite(lastAttempt) &&
    lastAttempt > 0 &&
    now - lastAttempt < AUTO_IMPORT_RETRY_BACKOFF_MS
  ) {
    return { selected: 0, dedupedNew: 0, uploaded: 0, failed: 0, taskId: null };
  }

  await updateImportCache((cache) => {
    cache.lastAttemptMs = now;
  });

  setProgress(params.onProgress, 'scanning', undefined, undefined, '正在请求权限...');
  const permission = await MediaLibrary.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error('media_library_permission_denied');
  }

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - params.months);
  const cutoffMs = cutoff.getTime();

  setProgress(
    params.onProgress,
    'scanning',
    0,
    undefined,
    `自动导入最近 ${params.months} 个月照片...`,
  );

  const picked: MediaLibrary.Asset[] = [];
  let after: string | undefined;
  let stop = false;
  while (!stop && picked.length < params.maxPhotos) {
    const page = await MediaLibrary.getAssetsAsync({
      first: 100,
      after,
      mediaType: [MediaLibrary.MediaType.photo],
      sortBy: [MediaLibrary.SortBy.creationTime],
    });

    for (const asset of page.assets) {
      const creationTimeMs = toSafeEpochMs(asset.creationTime);
      if (creationTimeMs !== undefined && creationTimeMs < cutoffMs) {
        stop = true;
        break;
      }
      picked.push(asset);
      if (picked.length >= params.maxPhotos) {
        break;
      }
    }

    if (stop || !page.hasNextPage || !page.endCursor) {
      break;
    }
    after = page.endCursor;
    setProgress(params.onProgress, 'scanning', picked.length, undefined);
  }

  if (picked.length === 0) {
    await updateImportCache((cache) => {
      cache.lastRunMs = Date.now();
    });
    return { selected: 0, dedupedNew: 0, uploaded: 0, failed: 0, taskId: null };
  }

  const cache = await loadAssetHashCache(picked.map((a) => a.id));

  // Resolve local uris + location
  const localItems: {
    assetId: string;
    uri: string;
    width: number;
    height: number;
    fileSize?: number;
    creationTime?: number;
    location?: { latitude: number; longitude: number } | null;
  }[] = [];

  let canQueryAssetInfo = true;

  setProgress(params.onProgress, 'scanning', 0, picked.length, '正在解析照片信息...');
  for (let i = 0; i < picked.length; i += 1) {
    const asset = picked[i];
    let uri = asset.uri;
    let location: { latitude: number; longitude: number } | null = null;
    let fileSize: number | undefined;
    if (canQueryAssetInfo) {
      try {
        const info = await MediaLibrary.getAssetInfoAsync(asset);
        uri = info.localUri ?? uri;
        location = info.location ?? null;
        fileSize = undefined;
      } catch (e) {
        const msg = String(e);
        // Some Android versions require ACCESS_MEDIA_LOCATION to read EXIF/location.
        if (msg.includes('ACCESS_MEDIA_LOCATION') || msg.includes('ExifInterface')) {
          canQueryAssetInfo = false;
        }
        uri = asset.uri;
        location = null;
        fileSize = undefined;
      }
    }
    localItems.push({
      assetId: asset.id,
      uri,
      width: asset.width ?? 0,
      height: asset.height ?? 0,
      fileSize,
      creationTime: asset.creationTime,
      location,
    });
    setProgress(params.onProgress, 'scanning', i + 1, picked.length);
  }

  setProgress(params.onProgress, 'thumbnail', 0, localItems.length, '正在生成缩略图并计算哈希...');
  const newCacheEntries: { assetId: string; hash: string }[] = [];
  const processed: {
    assetId: string;
    uri: string;
    width: number;
    height: number;
    fileSize?: number;
    creationTime?: number;
    location?: { latitude: number; longitude: number } | null;
    hash: string;
    thumbnailPath: string;
  }[] = [];
  for (let i = 0; i < localItems.length; i += 1) {
    const item = localItems[i];
    try {
      const cachedHash = cache.get(item.assetId);
      if (cachedHash && (await hasThumbnail(cachedHash))) {
        processed.push({ ...item, hash: cachedHash, thumbnailPath: getThumbnailPath(cachedHash) });
      } else {
        const thumb = await generateAndSaveThumbnailWithHash(item.uri);
        processed.push({ ...item, hash: thumb.hash, thumbnailPath: thumb.uri });
        cache.set(item.assetId, thumb.hash);
        newCacheEntries.push({ assetId: item.assetId, hash: thumb.hash });
      }
    } catch (e) {
      console.warn('generateAndSaveThumbnailWithHash failed:', item.uri, e);
      processed.push({ ...item, hash: '', thumbnailPath: '' });
    } finally {
      setProgress(params.onProgress, 'thumbnail', i + 1, localItems.length);
    }
  }

  await storeAssetHashCache(newCacheEntries);

  const uniqueHashes = Array.from(new Set(processed.map((p) => p.hash).filter((h) => Boolean(h))));
  if (uniqueHashes.length === 0) {
    await updateImportCache((cache) => {
      cache.lastRunMs = Date.now();
    });
    return {
      selected: localItems.length,
      dedupedNew: 0,
      uploaded: 0,
      failed: localItems.length,
      taskId: null,
    };
  }

  setProgress(params.onProgress, 'dedup', undefined, undefined, '正在查重...');
  const dedup = await photoApi.checkDuplicates(uniqueHashes);
  const newHashSet = new Set(dedup.newHashes);

  const newItemsRaw = processed.filter((p) => p.hash && p.thumbnailPath && newHashSet.has(p.hash));
  const byHash = new Map<string, (typeof newItemsRaw)[number]>();
  for (const item of newItemsRaw) {
    if (!byHash.has(item.hash)) {
      byHash.set(item.hash, item);
    }
  }
  const newItems = Array.from(byHash.values());

  const processingFailed = processed.filter((p) => !p.hash || !p.thumbnailPath).length;
  if (newItems.length === 0) {
    await updateImportCache((cache) => {
      cache.lastRunMs = Date.now();
    });
    return {
      selected: localItems.length,
      dedupedNew: 0,
      uploaded: 0,
      failed: processingFailed,
      taskId: null,
    };
  }

  const metadataList = newItems.map((p) =>
    buildMetadataFromMediaAsset({
      uri: p.uri,
      hash: p.hash,
      width: p.width,
      height: p.height,
      fileSize: p.fileSize,
      creationTime: p.creationTime,
      location: p.location,
    }),
  );

  setProgress(params.onProgress, 'uploading', 0, newItems.length);
  const uploadResult: PhotoUploadResult = await photoApi.uploadPhotos(
    newItems.map((p, index) => ({
      uri: p.uri,
      hash: p.hash,
      metadata: metadataList[index],
      thumbnailPath: p.thumbnailPath,
    })),
    (current, total) => setProgress(params.onProgress, 'uploading', current, total),
  );

  await updateImportCache((cache) => {
    cache.lastRunMs = Date.now();
  });
  return {
    selected: localItems.length,
    dedupedNew: newItems.length,
    uploaded: uploadResult.uploaded,
    failed: uploadResult.failed + processingFailed,
    taskId: uploadResult.taskId ?? null,
  };
}
