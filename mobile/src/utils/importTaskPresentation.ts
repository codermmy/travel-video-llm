import { MaterialCommunityIcons } from '@expo/vector-icons';

import { JourneyPalette } from '@/styles/colors';
import type { ImportTaskPhase, ImportTaskRecord } from '@/types/importTask';
import type { StatusTone } from '@/components/ui/revamp';

export const IMPORT_TASK_PHASE_ORDER = ['prepare', 'analysis', 'sync', 'story'] as const;

export function formatImportTaskTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '刚刚';
  }
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function getImportTaskStatusTone(task: ImportTaskRecord): StatusTone {
  if (task.status === 'completed') {
    return 'ready';
  }
  if (task.status === 'failed') {
    return 'failed';
  }
  return 'analyzing';
}

export function getImportTaskStatusLabel(task: ImportTaskRecord): string {
  if (task.status === 'completed') {
    return '已完成';
  }
  if (task.status === 'failed') {
    return '需要处理';
  }
  return '进行中';
}

export function getImportTaskStatusIcon(
  task: ImportTaskRecord,
): keyof typeof MaterialCommunityIcons.glyphMap {
  if (task.status === 'completed') {
    return 'check-circle-outline';
  }
  if (task.status === 'failed') {
    return 'alert-circle-outline';
  }
  return 'progress-clock';
}

export function getImportTaskPhaseProgress(phase: ImportTaskPhase): number {
  if (typeof phase.current === 'number' && typeof phase.total === 'number' && phase.total > 0) {
    return Math.max(0, Math.min(1, phase.current / phase.total));
  }
  if (phase.status === 'completed') {
    return 1;
  }
  if (phase.status === 'running') {
    return 0.2;
  }
  return 0;
}

export function getImportTaskPhaseStatusTone(phase: ImportTaskPhase): StatusTone {
  if (phase.status === 'completed') {
    return 'ready';
  }
  if (phase.status === 'failed') {
    return 'failed';
  }
  if (phase.status === 'running') {
    return 'analyzing';
  }
  return 'neutral';
}

export function getImportTaskPhaseStatusText(phase: ImportTaskPhase): string {
  if (typeof phase.current === 'number' && typeof phase.total === 'number' && phase.total > 0) {
    if (phase.key === 'story' && phase.total === 100) {
      return `${Math.round(phase.current)}%`;
    }
    return `${phase.current}/${phase.total}`;
  }
  if (phase.status === 'completed') {
    return '完成';
  }
  if (phase.status === 'failed') {
    return '失败';
  }
  if (phase.status === 'running') {
    return '处理中';
  }
  return '等待中';
}

export function getImportTaskOverallProgress(task: ImportTaskRecord): number {
  let total = 0;
  for (const key of IMPORT_TASK_PHASE_ORDER) {
    total += getImportTaskPhaseProgress(task.phases[key]);
  }
  return total / IMPORT_TASK_PHASE_ORDER.length;
}

export function buildImportTaskSummary(task: ImportTaskRecord, sourceLabel: string): string {
  const activePhase = task.phases[task.activePhase];

  if (task.status === 'running') {
    return activePhase.detail?.trim() || `${sourceLabel}正在后台继续处理`;
  }

  if (task.status === 'failed') {
    return activePhase.detail?.trim() || `${activePhase.label}阶段中断`;
  }

  if (task.counts.dedupedNew === 0 && task.counts.failed === 0) {
    return `${sourceLabel}没有发现可新增的照片`;
  }

  const summaryParts = [`新增 ${task.counts.dedupedNew} 张`];
  if (task.counts.dedupedExisting > 0) {
    summaryParts.push(`重复 ${task.counts.dedupedExisting} 张`);
  }
  if (task.counts.failed > 0) {
    summaryParts.push(`失败 ${task.counts.failed} 张`);
  }
  if (task.counts.queuedVision > 0) {
    summaryParts.push(`端侧分析 ${task.counts.queuedVision} 张`);
  }
  return `${sourceLabel} · ${summaryParts.join(' · ')}`;
}

export function buildImportTaskMetricItems(task: ImportTaskRecord): {
  label: string;
  value: string;
  tone?: StatusTone;
}[] {
  const items: { label: string; value: string; tone?: StatusTone }[] = [];

  if (task.counts.selected > 0) {
    items.push({ label: '已选', value: String(task.counts.selected) });
  }
  if (task.counts.dedupedNew > 0) {
    items.push({ label: '新增', value: String(task.counts.dedupedNew), tone: 'ready' });
  }
  if (task.counts.dedupedExisting > 0) {
    items.push({ label: '重复', value: String(task.counts.dedupedExisting) });
  }
  if (task.counts.queuedVision > 0 && task.status === 'running') {
    items.push({ label: '待分析', value: String(task.counts.queuedVision), tone: 'analyzing' });
  }
  if (task.counts.failed > 0) {
    items.push({ label: '失败', value: String(task.counts.failed), tone: 'failed' });
  }

  if (items.length === 0) {
    items.push({
      label: task.status === 'completed' ? '状态' : '阶段',
      value: task.status === 'completed' ? '已完成' : task.phases[task.activePhase].label,
      tone:
        task.status === 'completed' ? 'ready' : task.status === 'failed' ? 'failed' : 'analyzing',
    });
  }

  return items;
}

export function getImportTaskProgressColor(task: ImportTaskRecord): string {
  if (task.status === 'failed') {
    return JourneyPalette.danger;
  }
  if (task.status === 'completed') {
    return JourneyPalette.success;
  }
  return JourneyPalette.accent;
}
