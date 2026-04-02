import AsyncStorage from '@react-native-async-storage/async-storage';

import { taskApi, type TaskStatus } from '@/services/api/taskApi';
import type { ImportProgress, ImportStage } from '@/components/import/ImportProgressModal';
import type { OnDeviceVisionQueueSnapshot } from '@/services/vision/onDeviceVisionQueueService';
import type {
  ImportTaskCounts,
  ImportTaskPhase,
  ImportTaskPhaseKey,
  ImportTaskPhaseStatus,
  ImportTaskRecord,
  ImportTaskSource,
  ImportTaskState,
} from '@/types/importTask';

const IMPORT_TASKS_STORAGE_KEY = 'import-task-records/v1';
const BACKEND_TASK_POLL_INTERVAL_MS = 2500;

type ImportResultLike = {
  selected: number;
  dedupedNew: number;
  dedupedExisting: number;
  uploaded: number;
  queuedVision: number;
  failed: number;
  taskId?: string | null;
};

type ImportTaskListener = (state: ImportTaskState) => void;

const PHASE_ORDER: ImportTaskPhaseKey[] = ['prepare', 'analysis', 'sync', 'story'];

const PHASE_LABELS: Record<ImportTaskPhaseKey, string> = {
  prepare: '读取与准备数据',
  analysis: '端侧分析',
  sync: '同步结构化结果',
  story: '事件聚合',
};

let isLoaded = false;
let tasksById = new Map<string, ImportTaskRecord>();
let writeChain: Promise<void> = Promise.resolve();
let backendPollTimer: ReturnType<typeof setInterval> | null = null;
let backendPollInFlight = false;
const listeners = new Set<ImportTaskListener>();

function logImportTaskDebug(label: string, payload: Record<string, unknown>): void {
  if (__DEV__) {
    console.log(`[ImportTask] ${label}`, payload);
  }
}

function getDefaultCounts(): ImportTaskCounts {
  return {
    selected: 0,
    dedupedNew: 0,
    dedupedExisting: 0,
    uploaded: 0,
    queuedVision: 0,
    failed: 0,
  };
}

function createPhase(
  key: ImportTaskPhaseKey,
  status: ImportTaskPhaseStatus,
  detail?: string,
): ImportTaskPhase {
  return {
    key,
    label: PHASE_LABELS[key],
    status,
    detail,
  };
}

function getDefaultPhases(): Record<ImportTaskPhaseKey, ImportTaskPhase> {
  return {
    prepare: createPhase('prepare', 'pending'),
    analysis: createPhase('analysis', 'pending'),
    sync: createPhase('sync', 'pending'),
    story: createPhase('story', 'pending'),
  };
}

function cloneTask(task: ImportTaskRecord): ImportTaskRecord {
  return {
    ...task,
    counts: { ...task.counts },
    phases: {
      prepare: { ...task.phases.prepare },
      analysis: { ...task.phases.analysis },
      sync: { ...task.phases.sync },
      story: { ...task.phases.story },
    },
  };
}

function getSourceTitle(source: ImportTaskSource): string {
  return source === 'recent' ? '最近照片导入' : '手动补导入';
}

export function getImportTaskSourceLabel(source: ImportTaskSource): string {
  return source === 'recent' ? '最近 200 张' : '手动补导入';
}

function getPrepareStageDetail(stage: ImportStage, detail?: string): string {
  if (detail?.trim()) {
    return detail.trim();
  }

  switch (stage) {
    case 'scanning':
      return '正在读取相册与照片信息';
    case 'dedup':
      return '正在按 metadata 去重';
    case 'uploading':
      return '正在同步基础 metadata';
    case 'clustering':
      return '基础数据已就绪，准备进入后台任务';
    case 'vision':
      return '已提交端侧分析队列';
    case 'done':
      return '读取与准备数据完成';
    case 'idle':
    default:
      return '正在准备导入';
  }
}

function getStoryPhaseDetail(status: TaskStatus | null | undefined): string {
  if (!status) {
    return '正在等待事件聚合';
  }

  if (status.status === 'success' || status.status === 'completed') {
    return '事件聚合与故事生成完成';
  }

  if (status.status === 'failure' || status.status === 'failed' || status.status === 'error') {
    return status.error || '事件聚合失败';
  }

  if (status.stage === 'clustering') {
    return '正在聚合事件';
  }
  if (status.stage === 'geocoding') {
    return '正在补充地点信息';
  }
  if (status.stage === 'ai') {
    return '正在生成故事';
  }
  return status.result || '正在处理后台任务';
}

function reevaluateTask(task: ImportTaskRecord): ImportTaskRecord {
  const next = cloneTask(task);
  const phases = PHASE_ORDER.map((key) => next.phases[key]);

  const failedPhase = phases.find((phase) => phase.status === 'failed');
  if (failedPhase) {
    next.status = 'failed';
    next.activePhase = failedPhase.key;
    return next;
  }

  const runningPhase = phases.find((phase) => phase.status === 'running');
  if (runningPhase) {
    next.status = 'running';
    next.activePhase = runningPhase.key;
    return next;
  }

  const pendingPhase = phases.find((phase) => phase.status === 'pending');
  if (pendingPhase) {
    next.status = 'running';
    next.activePhase = pendingPhase.key;
    return next;
  }

  next.status = 'completed';
  next.activePhase = 'story';
  return next;
}

function buildState(): ImportTaskState {
  const tasks = Array.from(tasksById.values()).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
  const latestVisibleTask =
    tasks.find((task) => task.status !== 'completed' && !task.dismissedAt) ?? null;

  return {
    tasks,
    latestVisibleTask,
    runningCount: tasks.filter((task) => task.status === 'running').length,
  };
}

function emitState(): void {
  const state = buildState();
  for (const listener of listeners) {
    listener(state);
  }
}

async function readTasksFromStorage(): Promise<ImportTaskRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(IMPORT_TASKS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ImportTaskRecord[]) : [];
  } catch (error) {
    console.warn('Failed to read import tasks from storage:', error);
    return [];
  }
}

async function persistTasks(): Promise<void> {
  const payload = Array.from(tasksById.values()).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );

  writeChain = writeChain
    .catch(() => undefined)
    .then(async () => {
      await AsyncStorage.setItem(IMPORT_TASKS_STORAGE_KEY, JSON.stringify(payload));
    });

  await writeChain;
}

function getTasksNeedingBackendPolling(): ImportTaskRecord[] {
  return Array.from(tasksById.values()).filter(
    (task) =>
      task.status === 'running' &&
      Boolean(task.backendTaskId) &&
      task.phases.story.status === 'running',
  );
}

function stopBackendPollingIfIdle(): void {
  if (getTasksNeedingBackendPolling().length > 0) {
    return;
  }
  if (backendPollTimer) {
    clearInterval(backendPollTimer);
    backendPollTimer = null;
  }
}

async function pollBackendTasks(): Promise<void> {
  if (backendPollInFlight) {
    return;
  }

  const activeTasks = getTasksNeedingBackendPolling();
  if (activeTasks.length === 0) {
    stopBackendPollingIfIdle();
    return;
  }

  backendPollInFlight = true;
  try {
    let didChange = false;
    for (const task of activeTasks) {
      if (!task.backendTaskId) {
        continue;
      }

      try {
        const status = await taskApi.getTaskStatus(task.backendTaskId);
        const current = tasksById.get(task.id);
        if (!current) {
          continue;
        }

        const next = cloneTask(current);
        next.phases.story.current = Math.max(0, Math.min(100, Math.round(status.progress)));
        next.phases.story.total = 100;
        next.phases.story.detail = getStoryPhaseDetail(status);

        const normalizedStatus = status.status.toLowerCase();
        if (normalizedStatus === 'success' || normalizedStatus === 'completed') {
          next.phases.story.status = 'completed';
          next.phases.story.current = 100;
          next.phases.story.total = 100;
        } else if (
          normalizedStatus === 'failure' ||
          normalizedStatus === 'failed' ||
          normalizedStatus === 'error' ||
          normalizedStatus === 'revoked'
        ) {
          next.phases.story.status = 'failed';
        } else {
          next.phases.story.status = 'running';
        }

        next.updatedAt = new Date().toISOString();
        tasksById.set(task.id, reevaluateTask(next));
        didChange = true;
      } catch (error) {
        console.warn('Failed to poll import backend task:', task.backendTaskId, error);
      }
    }

    if (didChange) {
      await persistTasks();
      emitState();
    }
  } finally {
    backendPollInFlight = false;
    stopBackendPollingIfIdle();
  }
}

function ensureBackendPolling(): void {
  if (backendPollTimer || getTasksNeedingBackendPolling().length === 0) {
    return;
  }

  backendPollTimer = setInterval(() => {
    void pollBackendTasks();
  }, BACKEND_TASK_POLL_INTERVAL_MS);
}

async function persistAndEmit(): Promise<void> {
  await persistTasks();
  emitState();
  ensureBackendPolling();
}

export async function loadImportTasks(): Promise<ImportTaskState> {
  if (!isLoaded) {
    const storedTasks = await readTasksFromStorage();
    tasksById = new Map(storedTasks.map((task) => [task.id, reevaluateTask(task)]));
    isLoaded = true;
    ensureBackendPolling();
    emitState();
  }
  return buildState();
}

export function getImportTaskState(): ImportTaskState {
  return buildState();
}

export function subscribeImportTasks(listener: ImportTaskListener): () => void {
  listeners.add(listener);
  listener(buildState());
  return () => {
    listeners.delete(listener);
  };
}

export async function createImportTask(params: {
  source: ImportTaskSource;
  detail?: string;
}): Promise<string> {
  await loadImportTasks();

  const now = new Date().toISOString();
  const taskId = `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const phases = getDefaultPhases();
  phases.prepare = createPhase('prepare', 'running', params.detail || '正在准备导入');

  const task: ImportTaskRecord = {
    id: taskId,
    source: params.source,
    title: getSourceTitle(params.source),
    createdAt: now,
    updatedAt: now,
    dismissedAt: null,
    status: 'running',
    activePhase: 'prepare',
    counts: getDefaultCounts(),
    backendTaskId: null,
    phases,
  };

  tasksById.set(taskId, task);
  logImportTaskDebug('create', {
    taskId,
    source: params.source,
  });
  await persistAndEmit();
  return taskId;
}

export async function updateImportTaskProgress(
  taskId: string | null | undefined,
  progress: ImportProgress,
): Promise<void> {
  if (!taskId) {
    return;
  }

  await loadImportTasks();
  const current = tasksById.get(taskId);
  if (!current) {
    return;
  }

  const next = cloneTask(current);
  next.updatedAt = new Date().toISOString();
  next.phases.prepare.status = progress.stage === 'done' ? 'completed' : 'running';
  next.phases.prepare.current = progress.current;
  next.phases.prepare.total = progress.total;
  next.phases.prepare.detail = getPrepareStageDetail(progress.stage, progress.detail);

  if (typeof progress.total === 'number' && progress.total > 0) {
    next.counts.selected = Math.max(next.counts.selected, progress.total);
  }

  tasksById.set(taskId, reevaluateTask(next));
  await persistAndEmit();
}

export async function finalizeImportTask(
  taskId: string | null | undefined,
  result: ImportResultLike,
  options?: {
    targetEventId?: string | null;
  },
): Promise<void> {
  if (!taskId) {
    return;
  }

  await loadImportTasks();
  const current = tasksById.get(taskId);
  if (!current) {
    return;
  }

  const next = cloneTask(current);
  next.updatedAt = new Date().toISOString();
  next.counts = {
    selected: result.selected,
    dedupedNew: result.dedupedNew,
    dedupedExisting: result.dedupedExisting,
    uploaded: result.uploaded,
    queuedVision: result.queuedVision,
    failed: result.failed,
  };
  next.backendTaskId = result.taskId ?? null;
  next.phases.prepare.status = 'completed';
  next.phases.prepare.current = result.selected;
  next.phases.prepare.total = result.selected;

  if (result.dedupedNew === 0) {
    if (result.failed > 0) {
      next.phases.prepare.status = 'failed';
      next.phases.prepare.detail = '所选照片暂时无法处理';
      next.phases.analysis.status = 'completed';
      next.phases.sync.status = 'completed';
      next.phases.story.status = 'completed';
    } else {
      next.phases.prepare.detail = '没有发现可新增的照片';
      next.phases.analysis.status = 'completed';
      next.phases.analysis.detail = '未触发端侧分析';
      next.phases.sync.status = 'completed';
      next.phases.sync.detail = '未触发结果同步';
      next.phases.story.status = 'completed';
      next.phases.story.detail = '无需继续聚合事件';
    }
    tasksById.set(taskId, reevaluateTask(next));
    await persistAndEmit();
    return;
  }

  next.phases.prepare.detail = '基础 metadata 已准备完成';

  if (result.queuedVision > 0) {
    next.phases.analysis.status = 'running';
    next.phases.analysis.current = 0;
    next.phases.analysis.total = result.queuedVision;
    next.phases.analysis.detail = '正在等待端侧分析启动';

    next.phases.sync.status = 'pending';
    next.phases.sync.current = 0;
    next.phases.sync.total = result.queuedVision;
    next.phases.sync.detail = '等待结构化结果同步';
  } else {
    next.phases.analysis.status = 'completed';
    next.phases.analysis.current = result.dedupedNew;
    next.phases.analysis.total = result.dedupedNew;
    next.phases.analysis.detail = '无需继续端侧分析';

    next.phases.sync.status = 'completed';
    next.phases.sync.current = result.dedupedNew;
    next.phases.sync.total = result.dedupedNew;
    next.phases.sync.detail = '无需继续同步结构化结果';
  }

  if (result.taskId) {
    next.phases.story.status = 'running';
    next.phases.story.current = 0;
    next.phases.story.total = 100;
    next.phases.story.detail = options?.targetEventId
      ? '正在刷新当前事件摘要'
      : '正在聚合事件和生成故事';
  } else {
    next.phases.story.status = 'completed';
    next.phases.story.current = 100;
    next.phases.story.total = 100;
    next.phases.story.detail = options?.targetEventId ? '当前事件摘要已刷新' : '事件已聚合完成';
  }

  tasksById.set(taskId, reevaluateTask(next));
  await persistAndEmit();
}

export async function failImportTask(
  taskId: string | null | undefined,
  message: string,
  phase: ImportTaskPhaseKey = 'prepare',
): Promise<void> {
  if (!taskId) {
    return;
  }

  await loadImportTasks();
  const current = tasksById.get(taskId);
  if (!current) {
    return;
  }

  const next = cloneTask(current);
  next.updatedAt = new Date().toISOString();
  next.phases[phase].status = 'failed';
  next.phases[phase].detail = message;
  tasksById.set(taskId, reevaluateTask(next));
  await persistAndEmit();
}

export async function dismissImportTask(taskId: string): Promise<void> {
  await loadImportTasks();
  const current = tasksById.get(taskId);
  if (!current) {
    return;
  }

  const next = cloneTask(current);
  next.updatedAt = new Date().toISOString();
  next.dismissedAt = new Date().toISOString();
  tasksById.set(taskId, next);
  await persistAndEmit();
}

export async function syncImportTasksFromVisionQueue(
  snapshot: OnDeviceVisionQueueSnapshot,
): Promise<void> {
  await loadImportTasks();

  let didChange = false;

  for (const current of tasksById.values()) {
    if (current.status !== 'running' || current.counts.queuedVision <= 0) {
      continue;
    }

    const next = cloneTask(current);
    const total = next.counts.queuedVision;
    const taskSnapshot = snapshot.taskSnapshots?.[current.id];

    if (!taskSnapshot) {
      next.phases.analysis.status = 'completed';
      next.phases.analysis.current = total;
      next.phases.analysis.total = total;
      next.phases.analysis.detail = '端侧分析完成';

      next.phases.sync.status = 'completed';
      next.phases.sync.current = total;
      next.phases.sync.total = total;
      next.phases.sync.detail = '结构化结果已同步';
    } else {
      const analyzedCount = Math.max(
        0,
        total - taskSnapshot.pendingAnalysisCount - taskSnapshot.analyzingCount,
      );
      const syncedCount = Math.max(
        0,
        total - taskSnapshot.pendingSyncCount - taskSnapshot.syncingCount,
      );

      next.phases.analysis.current = analyzedCount;
      next.phases.analysis.total = total;
      next.phases.analysis.status = analyzedCount >= total ? 'completed' : 'running';
      next.phases.analysis.detail =
        analyzedCount >= total ? '端侧分析完成' : `正在分析照片内容 ${analyzedCount}/${total}`;

      next.phases.sync.current = syncedCount;
      next.phases.sync.total = total;
      next.phases.sync.status =
        syncedCount >= total
          ? 'completed'
          : taskSnapshot.pendingSyncCount + taskSnapshot.syncingCount > 0
            ? 'running'
            : 'pending';
      next.phases.sync.detail =
        syncedCount >= total
          ? '结构化结果已同步'
          : taskSnapshot.syncingCount > 0
            ? `正在同步结构化结果 ${syncedCount}/${total}`
            : '等待结构化结果同步';
    }

    const reevaluated = reevaluateTask(next);
    if (JSON.stringify(reevaluated) !== JSON.stringify(current)) {
      tasksById.set(current.id, reevaluated);
      didChange = true;
    }
  }

  if (didChange) {
    await persistAndEmit();
  }
}

export function getImportTaskRecords(): ImportTaskRecord[] {
  return buildState().tasks;
}
