export type ImportTaskSource = 'recent' | 'manual';

export type ImportTaskPhaseKey = 'prepare' | 'analysis' | 'sync' | 'story';

export type ImportTaskPhaseStatus = 'pending' | 'running' | 'completed' | 'failed';

export type ImportTaskStatus = 'running' | 'completed' | 'failed';

export type ImportTaskCounts = {
  selected: number;
  dedupedNew: number;
  dedupedExisting: number;
  uploaded: number;
  queuedVision: number;
  failed: number;
};

export type ImportTaskPhase = {
  key: ImportTaskPhaseKey;
  label: string;
  status: ImportTaskPhaseStatus;
  current?: number;
  total?: number;
  detail?: string;
};

export type ImportTaskRecord = {
  id: string;
  source: ImportTaskSource;
  title: string;
  createdAt: string;
  updatedAt: string;
  dismissedAt?: string | null;
  status: ImportTaskStatus;
  activePhase: ImportTaskPhaseKey;
  counts: ImportTaskCounts;
  backendTaskId?: string | null;
  phases: Record<ImportTaskPhaseKey, ImportTaskPhase>;
};

export type ImportTaskState = {
  tasks: ImportTaskRecord[];
  latestVisibleTask: ImportTaskRecord | null;
  runningCount: number;
};
