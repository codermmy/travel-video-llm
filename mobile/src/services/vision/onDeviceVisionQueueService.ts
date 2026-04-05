import * as FileSystem from 'expo-file-system/legacy';

import { photoApi } from '@/services/api/photoApi';
import {
  analyzeOnDeviceVisionNow,
  buildVisionInput,
} from '@/services/vision/onDeviceVisionService';
import type {
  OnDeviceVisionAnalysisInput,
  OnDeviceVisionRecord,
  OnDeviceVisionResult,
  OnDeviceVisionStatus,
} from '@/types/vision';

const QUEUE_STORAGE_DIR = 'vision-cache';
const QUEUE_STORAGE_FILE = 'on-device-vision-queue.json';
const ANALYSIS_BATCH_SIZE = 6;
const RETRY_DELAY_MS = 5000;
const VISION_DEBUG_ENABLED =
  typeof process !== 'undefined' &&
  typeof process.env === 'object' &&
  process.env?.EXPO_PUBLIC_VISION_DEBUG === '1';

type QueuePhase = 'pending_analysis' | 'analyzing' | 'pending_sync' | 'syncing';

type QueueItem = OnDeviceVisionAnalysisInput & {
  photoId: string;
  importTaskId?: string | null;
  phase: QueuePhase;
  attempts: number;
  enqueuedAt: string;
  updatedAt: string;
  visionStatus?: OnDeviceVisionStatus;
  visionError?: string | null;
  visionResult?: OnDeviceVisionResult | null;
};

type QueueStorage = {
  items: Record<string, QueueItem>;
};

export type OnDeviceVisionQueueTaskSnapshot = {
  totalCount: number;
  remainingCount: number;
  pendingAnalysisCount: number;
  analyzingCount: number;
  pendingSyncCount: number;
  syncingCount: number;
};

export type OnDeviceVisionQueueSnapshot = {
  totalCount: number;
  remainingCount: number;
  pendingAnalysisCount: number;
  analyzingCount: number;
  pendingSyncCount: number;
  syncingCount: number;
  hasPendingWork: boolean;
  taskSnapshots: Record<string, OnDeviceVisionQueueTaskSnapshot>;
};

type QueueListener = (snapshot: OnDeviceVisionQueueSnapshot) => void;

let isLoaded = false;
let itemsByPhotoId = new Map<string, QueueItem>();
let writeChain: Promise<void> = Promise.resolve();
let runningPromise: Promise<void> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<QueueListener>();

function logQueueDebug(label: string, payload: Record<string, unknown>): void {
  if (VISION_DEBUG_ENABLED) {
    console.log(`[OnDeviceVisionQueue] ${label}`, payload);
  }
}

function getQueueStorageDir(): string {
  const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!baseDir) {
    throw new Error('No FileSystem base directory available for on-device vision queue');
  }
  return `${baseDir}${QUEUE_STORAGE_DIR}/`;
}

function getQueueStoragePath(): string {
  return `${getQueueStorageDir()}${QUEUE_STORAGE_FILE}`;
}

async function ensureQueueStorageDir(): Promise<void> {
  const dir = getQueueStorageDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

async function readQueueStorage(): Promise<QueueStorage> {
  try {
    await ensureQueueStorageDir();
    const path = getQueueStoragePath();
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) {
      return { items: {} };
    }
    const raw = await FileSystem.readAsStringAsync(path);
    if (!raw) {
      return { items: {} };
    }
    const parsed = JSON.parse(raw) as Partial<QueueStorage>;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.items ||
      typeof parsed.items !== 'object'
    ) {
      return { items: {} };
    }
    return {
      items: parsed.items as Record<string, QueueItem>,
    };
  } catch (error) {
    console.warn('Failed to read on-device vision queue storage:', error);
    return { items: {} };
  }
}

async function persistQueue(): Promise<void> {
  const data: QueueStorage = {
    items: Object.fromEntries(itemsByPhotoId.entries()),
  };

  writeChain = writeChain
    .catch(() => undefined)
    .then(async () => {
      await ensureQueueStorageDir();
      await FileSystem.writeAsStringAsync(getQueueStoragePath(), JSON.stringify(data));
    });

  await writeChain;
}

function buildSnapshot(): OnDeviceVisionQueueSnapshot {
  const counts = {
    pending_analysis: 0,
    analyzing: 0,
    pending_sync: 0,
    syncing: 0,
  };
  const taskCounts = new Map<
    string,
    {
      pending_analysis: number;
      analyzing: number;
      pending_sync: number;
      syncing: number;
    }
  >();

  for (const item of itemsByPhotoId.values()) {
    counts[item.phase] += 1;
    if (item.importTaskId) {
      const currentTaskCounts = taskCounts.get(item.importTaskId) ?? {
        pending_analysis: 0,
        analyzing: 0,
        pending_sync: 0,
        syncing: 0,
      };
      currentTaskCounts[item.phase] += 1;
      taskCounts.set(item.importTaskId, currentTaskCounts);
    }
  }

  const remainingCount =
    counts.pending_analysis + counts.analyzing + counts.pending_sync + counts.syncing;

  return {
    totalCount: itemsByPhotoId.size,
    remainingCount,
    pendingAnalysisCount: counts.pending_analysis,
    analyzingCount: counts.analyzing,
    pendingSyncCount: counts.pending_sync,
    syncingCount: counts.syncing,
    hasPendingWork: remainingCount > 0,
    taskSnapshots: Object.fromEntries(
      Array.from(taskCounts.entries()).map(([taskId, taskSnapshot]) => {
        const taskRemainingCount =
          taskSnapshot.pending_analysis +
          taskSnapshot.analyzing +
          taskSnapshot.pending_sync +
          taskSnapshot.syncing;

        return [
          taskId,
          {
            totalCount: taskRemainingCount,
            remainingCount: taskRemainingCount,
            pendingAnalysisCount: taskSnapshot.pending_analysis,
            analyzingCount: taskSnapshot.analyzing,
            pendingSyncCount: taskSnapshot.pending_sync,
            syncingCount: taskSnapshot.syncing,
          },
        ];
      }),
    ),
  };
}

function emitSnapshot(): void {
  const snapshot = buildSnapshot();
  for (const listener of listeners) {
    listener(snapshot);
  }
}

async function ensureLoaded(): Promise<void> {
  if (isLoaded) {
    return;
  }

  const storage = await readQueueStorage();
  itemsByPhotoId = new Map(
    Object.entries(storage.items).map(([photoId, item]) => [
      photoId,
      {
        ...item,
        phase:
          item.phase === 'analyzing'
            ? 'pending_analysis'
            : item.phase === 'syncing'
              ? 'pending_sync'
              : item.phase,
      },
    ]),
  );
  isLoaded = true;
  emitSnapshot();
}

function scheduleRetry(): void {
  if (retryTimer) {
    return;
  }
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void startOnDeviceVisionQueue();
  }, RETRY_DELAY_MS);
}

function getPendingAnalysisBatch(): QueueItem[] {
  return Array.from(itemsByPhotoId.values())
    .filter((item) => item.phase === 'pending_analysis')
    .sort((left, right) => left.enqueuedAt.localeCompare(right.enqueuedAt))
    .slice(0, ANALYSIS_BATCH_SIZE);
}

function getNextPendingSync(): QueueItem | null {
  return (
    Array.from(itemsByPhotoId.values())
      .filter((item) => item.phase === 'pending_sync')
      .sort((left, right) => left.updatedAt.localeCompare(right.updatedAt))[0] ?? null
  );
}

async function persistAndEmit(): Promise<void> {
  await persistQueue();
  emitSnapshot();
}

function applyAnalysisRecord(item: QueueItem, record: OnDeviceVisionRecord): QueueItem {
  return {
    ...item,
    phase: 'pending_sync',
    updatedAt: new Date().toISOString(),
    visionStatus: record.status,
    visionError: record.errorMessage ?? null,
    visionResult: record.result ?? null,
  };
}

async function drainQueue(): Promise<void> {
  try {
    while (true) {
      const analysisBatch = getPendingAnalysisBatch();
      if (analysisBatch.length > 0) {
        const now = new Date().toISOString();
        for (const item of analysisBatch) {
          itemsByPhotoId.set(item.photoId, {
            ...item,
            phase: 'analyzing',
            updatedAt: now,
          });
        }
        await persistAndEmit();

        const records = await analyzeOnDeviceVisionNow(analysisBatch);
        for (let index = 0; index < analysisBatch.length; index += 1) {
          const item = analysisBatch[index];
          const record = records[index];
          if (!record) {
            continue;
          }
          itemsByPhotoId.set(item.photoId, applyAnalysisRecord(item, record));
        }
        await persistAndEmit();
        continue;
      }

      const pendingSyncItem = getNextPendingSync();
      if (!pendingSyncItem) {
        return;
      }

      itemsByPhotoId.set(pendingSyncItem.photoId, {
        ...pendingSyncItem,
        phase: 'syncing',
        updatedAt: new Date().toISOString(),
      });
      await persistAndEmit();

      try {
        await photoApi.updatePhoto(pendingSyncItem.photoId, {
          visionStatus: pendingSyncItem.visionStatus ?? 'failed',
          visionError: pendingSyncItem.visionError ?? null,
          vision: pendingSyncItem.visionResult ?? null,
        });
        itemsByPhotoId.delete(pendingSyncItem.photoId);
        await persistAndEmit();
      } catch (error) {
        console.warn('Failed to sync on-device vision result:', pendingSyncItem.photoId, error);
        itemsByPhotoId.set(pendingSyncItem.photoId, {
          ...pendingSyncItem,
          phase: 'pending_sync',
          attempts: pendingSyncItem.attempts + 1,
          updatedAt: new Date().toISOString(),
        });
        await persistAndEmit();
        scheduleRetry();
        return;
      }
    }
  } finally {
    runningPromise = null;
    if (buildSnapshot().hasPendingWork && !retryTimer) {
      runningPromise = drainQueue();
    }
  }
}

export async function startOnDeviceVisionQueue(): Promise<void> {
  await ensureLoaded();
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (!runningPromise && buildSnapshot().hasPendingWork) {
    runningPromise = drainQueue();
  }
}

export async function enqueueOnDeviceVisionSync(
  items: {
    photoId: string;
    importTaskId?: string | null;
    assetId?: string;
    hash?: string;
    localUri: string;
    localThumbnailUri?: string;
    localCoverUri?: string;
    width?: number;
    height?: number;
    fileSize?: number;
  }[],
): Promise<number> {
  await ensureLoaded();

  let queuedCount = 0;
  const now = new Date().toISOString();
  for (const item of items) {
    const existing = itemsByPhotoId.get(item.photoId);
    const nextItem: QueueItem = {
      ...buildVisionInput({
        assetId: item.assetId,
        hash: item.hash,
        localUri: item.localUri,
        localThumbnailUri: item.localThumbnailUri,
        localCoverUri: item.localCoverUri,
        width: item.width,
        height: item.height,
        fileSize: item.fileSize,
      }),
      photoId: item.photoId,
      importTaskId: item.importTaskId ?? existing?.importTaskId ?? null,
      phase: existing?.phase ?? 'pending_analysis',
      attempts: existing?.attempts ?? 0,
      enqueuedAt: existing?.enqueuedAt ?? now,
      updatedAt: now,
      visionStatus: existing?.visionStatus,
      visionError: existing?.visionError,
      visionResult: existing?.visionResult,
    };

    if (!existing) {
      queuedCount += 1;
      itemsByPhotoId.set(item.photoId, nextItem);
      continue;
    }

    itemsByPhotoId.set(item.photoId, {
      ...existing,
      ...nextItem,
    });
  }

  logQueueDebug('enqueue', {
    requested: items.length,
    queued: queuedCount,
    total: itemsByPhotoId.size,
  });

  await persistAndEmit();
  await startOnDeviceVisionQueue();
  return queuedCount;
}

export function getOnDeviceVisionQueueSnapshot(): OnDeviceVisionQueueSnapshot {
  return buildSnapshot();
}

export function subscribeOnDeviceVisionQueue(listener: QueueListener): () => void {
  listeners.add(listener);
  listener(buildSnapshot());
  return () => {
    listeners.delete(listener);
  };
}
