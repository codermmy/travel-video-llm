import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

import {
  buildOnDeviceVisionCacheKey,
  listOnDeviceVisionRecords,
  upsertOnDeviceVisionRecords,
} from '@/services/storage/onDeviceVisionStorage';
import type {
  OnDeviceVisionAnalysisInput,
  OnDeviceVisionRecord,
  OnDeviceVisionResult,
} from '@/types/vision';

type NativeAnalysisResult = {
  cacheKey: string;
  result?: OnDeviceVisionResult;
  errorMessage?: string | null;
};

type NativeTravelVisionModule = {
  isAvailable(): boolean;
  analyzeBatchAsync(inputs: OnDeviceVisionAnalysisInput[]): Promise<NativeAnalysisResult[]>;
};

const nativeTravelVisionModule =
  requireOptionalNativeModule<NativeTravelVisionModule>('TravelVision');

const ANALYSIS_BATCH_SIZE = 8;

let pendingQueue: OnDeviceVisionAnalysisInput[] = [];
let runningPromise: Promise<void> | null = null;
const queuedKeys = new Set<string>();

function createBaseRecord(
  item: OnDeviceVisionAnalysisInput,
  status: OnDeviceVisionRecord['status'],
  errorMessage?: string | null,
  result?: OnDeviceVisionResult | null,
): OnDeviceVisionRecord {
  return {
    cacheKey: item.cacheKey,
    assetId: item.assetId,
    hash: item.hash,
    localUri: item.localUri,
    localThumbnailUri: item.localThumbnailUri,
    localCoverUri: item.localCoverUri,
    width: item.width,
    height: item.height,
    fileSize: item.fileSize,
    status,
    updatedAt: new Date().toISOString(),
    errorMessage: errorMessage ?? null,
    result: result ?? null,
  };
}

function isNativeVisionAvailable(): boolean {
  return (
    Platform.OS === 'android' &&
    nativeTravelVisionModule !== null &&
    nativeTravelVisionModule.isAvailable()
  );
}

async function processBatch(batch: OnDeviceVisionAnalysisInput[]): Promise<void> {
  await analyzeBatch(batch);
}

async function analyzeBatch(batch: OnDeviceVisionAnalysisInput[]): Promise<OnDeviceVisionRecord[]> {
  if (batch.length === 0) {
    return [];
  }

  if (!isNativeVisionAvailable()) {
    const records = batch.map((item) =>
      createBaseRecord(item, 'unsupported', 'on_device_vision_unavailable', null),
    );
    await upsertOnDeviceVisionRecords(records);
    return records;
  }

  const module = nativeTravelVisionModule;
  if (!module) {
    const records = batch.map((item) =>
      createBaseRecord(item, 'unsupported', 'on_device_vision_unavailable', null),
    );
    await upsertOnDeviceVisionRecords(records);
    return records;
  }

  await upsertOnDeviceVisionRecords(batch.map((item) => createBaseRecord(item, 'processing')));

  try {
    const outputs = await module.analyzeBatchAsync(batch);
    const resultByKey = new Map(outputs.map((output) => [output.cacheKey, output]));

    const records = batch.map((item) => {
      const output = resultByKey.get(item.cacheKey);
      if (!output) {
        return createBaseRecord(item, 'failed', 'missing_native_result', null);
      }
      if (output.result) {
        return createBaseRecord(item, 'completed', null, output.result);
      }
      return createBaseRecord(
        item,
        'failed',
        output.errorMessage ?? 'vision_analysis_failed',
        null,
      );
    });
    await upsertOnDeviceVisionRecords(records);
    return records;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const records = batch.map((item) => createBaseRecord(item, 'failed', message, null));
    await upsertOnDeviceVisionRecords(records);
    return records;
  }
}

async function drainQueue(): Promise<void> {
  try {
    while (pendingQueue.length > 0) {
      const batch = pendingQueue.splice(0, ANALYSIS_BATCH_SIZE);
      for (const item of batch) {
        queuedKeys.delete(item.cacheKey);
      }
      await processBatch(batch);
    }
  } finally {
    runningPromise = null;
    if (pendingQueue.length > 0) {
      runningPromise = drainQueue();
    }
  }
}

export function buildVisionInput(params: {
  assetId?: string;
  hash?: string;
  localUri: string;
  localThumbnailUri?: string;
  localCoverUri?: string;
  width?: number;
  height?: number;
  fileSize?: number;
}): OnDeviceVisionAnalysisInput {
  return {
    cacheKey: buildOnDeviceVisionCacheKey({
      assetId: params.assetId,
      hash: params.hash,
      localUri: params.localUri,
    }),
    assetId: params.assetId,
    hash: params.hash,
    localUri: params.localUri,
    localThumbnailUri: params.localThumbnailUri,
    localCoverUri: params.localCoverUri,
    width: params.width,
    height: params.height,
    fileSize: params.fileSize,
  };
}

export async function enqueueOnDeviceVisionAnalysis(
  items: OnDeviceVisionAnalysisInput[],
): Promise<number> {
  if (items.length === 0) {
    return 0;
  }

  const existingRecords = await listOnDeviceVisionRecords();
  const toQueue: OnDeviceVisionAnalysisInput[] = [];

  for (const item of items) {
    if (queuedKeys.has(item.cacheKey)) {
      continue;
    }

    const existing = existingRecords[item.cacheKey];
    if (existing?.status === 'completed' || existing?.status === 'processing') {
      continue;
    }

    queuedKeys.add(item.cacheKey);
    toQueue.push(item);
  }

  if (toQueue.length === 0) {
    return 0;
  }

  await upsertOnDeviceVisionRecords(toQueue.map((item) => createBaseRecord(item, 'pending')));
  pendingQueue = pendingQueue.concat(toQueue);
  if (!runningPromise) {
    runningPromise = drainQueue();
  }

  return toQueue.length;
}

export async function analyzeOnDeviceVisionNow(
  items: OnDeviceVisionAnalysisInput[],
  onProgress?: (current: number, total: number) => void,
): Promise<OnDeviceVisionRecord[]> {
  if (items.length === 0) {
    return [];
  }

  const existingRecords = await listOnDeviceVisionRecords();
  const resultByKey = new Map<string, OnDeviceVisionRecord>();
  const toAnalyze: OnDeviceVisionAnalysisInput[] = [];

  for (const item of items) {
    const existing = existingRecords[item.cacheKey];
    if (existing?.status === 'completed' || existing?.status === 'unsupported') {
      resultByKey.set(item.cacheKey, existing);
      continue;
    }
    toAnalyze.push(item);
  }

  let processed = items.length - toAnalyze.length;
  onProgress?.(processed, items.length);

  for (let i = 0; i < toAnalyze.length; i += ANALYSIS_BATCH_SIZE) {
    const batch = toAnalyze.slice(i, i + ANALYSIS_BATCH_SIZE);
    const records = await analyzeBatch(batch);
    for (const record of records) {
      resultByKey.set(record.cacheKey, record);
    }
    processed += batch.length;
    onProgress?.(processed, items.length);
  }

  return items.map((item) => {
    return (
      resultByKey.get(item.cacheKey) ??
      createBaseRecord(item, 'failed', 'vision_result_missing', null)
    );
  });
}

export function isOnDeviceVisionSupported(): boolean {
  return isNativeVisionAvailable();
}
