import type { EventRecord, EventStatus } from '@/types/event';
import { JourneyPalette } from '@/styles/colors';
import type { JourneyStateKind } from '@/utils/statusLanguage';

export type JourneyStatusMeta = {
  label: string;
  tone: JourneyStateKind;
  color: string;
  soft: string;
};

const STATUS_TONE_META: Record<
  JourneyStateKind,
  {
    color: string;
    soft: string;
  }
> = {
  ready: {
    color: JourneyPalette.success,
    soft: JourneyPalette.successSoft,
  },
  processing: {
    color: JourneyPalette.accent,
    soft: JourneyPalette.accentSoft,
  },
  importing: {
    color: JourneyPalette.accentWarm,
    soft: JourneyPalette.accentWarmSoft,
  },
  stale: {
    color: JourneyPalette.warning,
    soft: JourneyPalette.warningSoft,
  },
  failed: {
    color: JourneyPalette.danger,
    soft: JourneyPalette.dangerSoft,
  },
};

function createStatusMeta(tone: JourneyStateKind, label: string): JourneyStatusMeta {
  const meta = STATUS_TONE_META[tone];
  return {
    tone,
    label,
    color: meta.color,
    soft: meta.soft,
  };
}

export function getEventStatusMeta(
  event: Pick<
    EventRecord,
    | 'status'
    | 'visionSummary'
    | 'storyFreshness'
    | 'slideshowFreshness'
    | 'hasPendingStructureChanges'
  >,
): JourneyStatusMeta {
  if (event.status === 'ai_failed') {
    return createStatusMeta('failed', '生成失败');
  }
  if (
    event.storyFreshness === 'stale' ||
    event.slideshowFreshness === 'stale' ||
    event.hasPendingStructureChanges
  ) {
    return createStatusMeta('stale', '待更新');
  }
  if (event.status === 'waiting_for_vision') {
    return createStatusMeta('importing', '导入中');
  }
  if (event.status === 'ai_pending' || event.status === 'ai_processing') {
    return createStatusMeta('processing', '整理中');
  }
  if (event.visionSummary.processing > 0 || event.visionSummary.completed > 0) {
    return createStatusMeta('processing', '分析中');
  }
  if (event.visionSummary.unsupported > 0) {
    return createStatusMeta('failed', '分析失败');
  }
  return createStatusMeta('ready', '已完成');
}

export function getEventDetailStatusMeta(status: EventStatus): { label: string; color: string } {
  if (status === 'waiting_for_vision') {
    return { label: '导入中', color: JourneyPalette.accentWarm };
  }
  if (status === 'ai_pending' || status === 'ai_processing') {
    return { label: '整理中', color: JourneyPalette.accent };
  }
  if (status === 'generated') {
    return { label: '已完成', color: JourneyPalette.success };
  }
  if (status === 'ai_failed') {
    return { label: '生成失败', color: JourneyPalette.danger };
  }
  return { label: '待更新', color: JourneyPalette.warning };
}
