import * as FileSystem from 'expo-file-system/legacy';

import type { OnDeviceVisionRecord } from '@/types/vision';

const VISION_STORAGE_DIR = 'vision-cache';
const VISION_STORAGE_FILE = 'on-device-vision.json';

type VisionStorageData = {
  records: Record<string, OnDeviceVisionRecord>;
};

let writeChain: Promise<void> = Promise.resolve();

function getVisionStorageDir(): string {
  const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!baseDir) {
    throw new Error('No FileSystem base directory available for vision storage');
  }
  return `${baseDir}${VISION_STORAGE_DIR}/`;
}

function getVisionStoragePath(): string {
  return `${getVisionStorageDir()}${VISION_STORAGE_FILE}`;
}

async function ensureVisionStorageDir(): Promise<void> {
  const dir = getVisionStorageDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

async function readStorageData(): Promise<VisionStorageData> {
  try {
    await ensureVisionStorageDir();
    const path = getVisionStoragePath();
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) {
      return { records: {} };
    }

    const raw = await FileSystem.readAsStringAsync(path);
    if (!raw) {
      return { records: {} };
    }

    const parsed = JSON.parse(raw) as Partial<VisionStorageData>;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.records ||
      typeof parsed.records !== 'object'
    ) {
      return { records: {} };
    }

    return {
      records: parsed.records as Record<string, OnDeviceVisionRecord>,
    };
  } catch (error) {
    console.warn('Failed to read on-device vision storage:', error);
    return { records: {} };
  }
}

function queueWrite(data: VisionStorageData): Promise<void> {
  writeChain = writeChain
    .catch(() => undefined)
    .then(async () => {
      await ensureVisionStorageDir();
      await FileSystem.writeAsStringAsync(getVisionStoragePath(), JSON.stringify(data));
    });
  return writeChain;
}

export function buildOnDeviceVisionCacheKey(params: {
  assetId?: string;
  hash?: string;
  localUri: string;
}): string {
  if (params.assetId && params.assetId.trim().length > 0) {
    return `asset:${params.assetId.trim()}`;
  }
  if (params.hash && params.hash.trim().length > 0) {
    return `hash:${params.hash.trim()}`;
  }
  return `uri:${params.localUri}`;
}

export async function getOnDeviceVisionRecord(
  cacheKey: string,
): Promise<OnDeviceVisionRecord | null> {
  const data = await readStorageData();
  return data.records[cacheKey] ?? null;
}

export async function listOnDeviceVisionRecords(): Promise<Record<string, OnDeviceVisionRecord>> {
  const data = await readStorageData();
  return data.records;
}

export async function upsertOnDeviceVisionRecords(records: OnDeviceVisionRecord[]): Promise<void> {
  if (records.length === 0) {
    return;
  }

  const data = await readStorageData();
  for (const record of records) {
    data.records[record.cacheKey] = record;
  }
  await queueWrite(data);
}
