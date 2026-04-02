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

function logVisionDebug(label: string, payload: Record<string, unknown>): void {
  if (__DEV__) {
    console.log(`[OnDeviceVision] ${label}`, payload);
  }
}

function summarizeVisionResult(result?: OnDeviceVisionResult | null): Record<string, unknown> {
  if (!result) {
    return { hasResult: false };
  }

  return {
    hasResult: true,
    sceneCategory: result.scene_category,
    activityHint: result.activity_hint,
    landmarkHint: result.landmark_hint,
    peopleBucket: result.people_count_bucket,
    objectTags: result.object_tags.slice(0, 4),
    ocrLength: result.ocr_text.length,
    qualityFlags: result.image_quality_flags,
    coverScore: result.cover_score,
  };
}

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
  const available =
    Platform.OS === 'android' &&
    nativeTravelVisionModule !== null &&
    nativeTravelVisionModule.isAvailable();

  if (__DEV__) {
    logVisionDebug('availability', {
      platform: Platform.OS,
      hasNativeModule: nativeTravelVisionModule !== null,
      available,
    });
  }

  return available;
}

async function processBatch(batch: OnDeviceVisionAnalysisInput[]): Promise<void> {
  await analyzeBatch(batch);
}

async function analyzeBatch(batch: OnDeviceVisionAnalysisInput[]): Promise<OnDeviceVisionRecord[]> {
  if (batch.length === 0) {
    return [];
  }

  logVisionDebug('analyzeBatch:start', {
    batchSize: batch.length,
    cacheKeys: batch.slice(0, 4).map((item) => item.cacheKey),
  });

  if (!isNativeVisionAvailable()) {
    const records = batch.map((item) =>
      createBaseRecord(item, 'unsupported', 'on_device_vision_unavailable', null),
    );
    await upsertOnDeviceVisionRecords(records);
    logVisionDebug('analyzeBatch:unsupported', {
      batchSize: batch.length,
      cacheKeys: batch.slice(0, 4).map((item) => item.cacheKey),
    });
    return records;
  }

  const module = nativeTravelVisionModule;
  if (!module) {
    const records = batch.map((item) =>
      createBaseRecord(item, 'unsupported', 'on_device_vision_unavailable', null),
    );
    await upsertOnDeviceVisionRecords(records);
    logVisionDebug('analyzeBatch:missingModule', {
      batchSize: batch.length,
    });
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
    logVisionDebug('analyzeBatch:done', {
      batchSize: batch.length,
      completed: records.filter((record) => record.status === 'completed').length,
      failed: records.filter((record) => record.status === 'failed').length,
      samples: records.slice(0, 3).map((record) => ({
        cacheKey: record.cacheKey,
        status: record.status,
        errorMessage: record.errorMessage,
        ...summarizeVisionResult(record.result),
      })),
    });
    return records;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const records = batch.map((item) => createBaseRecord(item, 'failed', message, null));
    await upsertOnDeviceVisionRecords(records);
    logVisionDebug('analyzeBatch:error', {
      batchSize: batch.length,
      message,
    });
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

  logVisionDebug('analyzeNow:start', {
    total: items.length,
    sampleCacheKeys: items.slice(0, 5).map((item) => item.cacheKey),
  });

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
  logVisionDebug('analyzeNow:cache', {
    total: items.length,
    cached: processed,
    toAnalyze: toAnalyze.length,
  });

  for (let i = 0; i < toAnalyze.length; i += ANALYSIS_BATCH_SIZE) {
    const batch = toAnalyze.slice(i, i + ANALYSIS_BATCH_SIZE);
    const records = await analyzeBatch(batch);
    for (const record of records) {
      resultByKey.set(record.cacheKey, record);
    }
    processed += batch.length;
    onProgress?.(processed, items.length);
  }

  const finalRecords = items.map((item) => {
    return (
      resultByKey.get(item.cacheKey) ??
      createBaseRecord(item, 'failed', 'vision_result_missing', null)
    );
  });

  logVisionDebug('analyzeNow:complete', {
    total: finalRecords.length,
    completed: finalRecords.filter((record) => record.status === 'completed').length,
    unsupported: finalRecords.filter((record) => record.status === 'unsupported').length,
    failed: finalRecords.filter((record) => record.status === 'failed').length,
    sampleResults: finalRecords.slice(0, 3).map((record) => ({
      cacheKey: record.cacheKey,
      status: record.status,
      errorMessage: record.errorMessage,
      ...summarizeVisionResult(record.result),
    })),
  });

  return finalRecords;
}

export function isOnDeviceVisionSupported(): boolean {
  return isNativeVisionAvailable();
}
