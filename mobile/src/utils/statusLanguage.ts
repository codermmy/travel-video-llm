import { MaterialCommunityIcons } from '@expo/vector-icons';

import { JourneyPalette } from '@/styles/colors';

export type JourneyStateKind = 'importing' | 'processing' | 'stale' | 'failed' | 'ready';

export type JourneyStateAppearance = {
  key: JourneyStateKind;
  label: string;
  shortLabel: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  backgroundColor: string;
  borderColor: string;
};

const STATE_APPEARANCE: Record<JourneyStateKind, JourneyStateAppearance> = {
  importing: {
    key: 'importing',
    label: '导入中',
    shortLabel: '导入中',
    icon: 'tray-arrow-down',
    color: JourneyPalette.accent,
    backgroundColor: JourneyPalette.accentSoft,
    borderColor: '#CAD9FF',
  },
  processing: {
    key: 'processing',
    label: '分析中',
    shortLabel: '整理中',
    icon: 'progress-clock',
    color: JourneyPalette.accent,
    backgroundColor: JourneyPalette.accentSoft,
    borderColor: '#CAD9FF',
  },
  stale: {
    key: 'stale',
    label: '待更新',
    shortLabel: '待更新',
    icon: 'update',
    color: JourneyPalette.warning,
    backgroundColor: JourneyPalette.warningSoft,
    borderColor: JourneyPalette.warningBorder,
  },
  failed: {
    key: 'failed',
    label: '失败',
    shortLabel: '失败',
    icon: 'alert-circle-outline',
    color: JourneyPalette.danger,
    backgroundColor: JourneyPalette.dangerSoft,
    borderColor: JourneyPalette.dangerBorder,
  },
  ready: {
    key: 'ready',
    label: '已就绪',
    shortLabel: '已就绪',
    icon: 'check-circle-outline',
    color: JourneyPalette.success,
    backgroundColor: JourneyPalette.successSoft,
    borderColor: JourneyPalette.successBorder,
  },
};

export function getJourneyStateAppearance(kind: JourneyStateKind): JourneyStateAppearance {
  return STATE_APPEARANCE[kind];
}
