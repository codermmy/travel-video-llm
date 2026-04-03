import type { EventRecord, EventStatus } from '@/types/event';
import { JourneyPalette } from '@/styles/colors';

export function getEventStatusMeta(
  event: Pick<
    EventRecord,
    | 'status'
    | 'visionSummary'
    | 'storyFreshness'
    | 'slideshowFreshness'
    | 'hasPendingStructureChanges'
  >,
): {
  label: string;
  color: string;
  soft: string;
} {
  if (event.status === 'ai_failed') {
    return { label: '生成失败', color: JourneyPalette.danger, soft: JourneyPalette.dangerSoft };
  }
  if (event.status === 'ai_processing') {
    return {
      label: '故事生成中',
      color: JourneyPalette.accent,
      soft: JourneyPalette.accentSoft,
    };
  }
  if (event.status === 'ai_pending') {
    return { label: '故事待生成', color: JourneyPalette.inkSoft, soft: '#EEE8DE' };
  }
  if (
    event.storyFreshness === 'stale' ||
    event.slideshowFreshness === 'stale' ||
    event.hasPendingStructureChanges
  ) {
    return {
      label: '待更新',
      color: JourneyPalette.warning,
      soft: JourneyPalette.warningSoft,
    };
  }
  if (event.status === 'generated') {
    return {
      label: '已完成',
      color: JourneyPalette.success,
      soft: JourneyPalette.successSoft,
    };
  }
  if (event.status === 'waiting_for_vision') {
    return { label: '整理中', color: JourneyPalette.inkSoft, soft: '#EEE8DE' };
  }
  if (event.visionSummary.processing > 0 || event.visionSummary.completed > 0) {
    return { label: '分析中', color: JourneyPalette.accent, soft: JourneyPalette.accentSoft };
  }
  if (event.visionSummary.unsupported > 0) {
    return {
      label: '端侧识别不可用',
      color: JourneyPalette.warning,
      soft: JourneyPalette.warningSoft,
    };
  }
  return { label: '待分析', color: JourneyPalette.inkSoft, soft: '#EEE8DE' };
}

export function getEventDetailStatusMeta(status: EventStatus): { label: string; color: string } {
  if (status === 'waiting_for_vision') {
    return { label: '等待端侧分析', color: JourneyPalette.inkSoft };
  }
  if (status === 'ai_pending') {
    return { label: '待生成', color: JourneyPalette.inkSoft };
  }
  if (status === 'ai_processing') {
    return { label: 'AI 生成中', color: JourneyPalette.accent };
  }
  if (status === 'generated') {
    return { label: '已完成', color: JourneyPalette.success };
  }
  if (status === 'ai_failed') {
    return { label: '生成失败', color: JourneyPalette.danger };
  }
  return { label: '已聚类（待AI）', color: JourneyPalette.inkSoft };
}
