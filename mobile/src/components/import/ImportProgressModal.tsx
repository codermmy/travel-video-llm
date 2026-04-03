import * as React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Modal, Portal, ProgressBar, Text } from 'react-native-paper';

import {
  ActionButton,
  BottomSheetScaffold,
  InlineBanner,
  StatusPill,
} from '@/components/ui/revamp';
import { JourneyPalette } from '@/styles/colors';
import type { StatusTone } from '@/components/ui/revamp';

export type ImportStage =
  | 'idle'
  | 'scanning'
  | 'dedup'
  | 'vision'
  | 'uploading'
  | 'clustering'
  | 'done';

export type ImportProgress = {
  stage: ImportStage;
  current?: number;
  total?: number;
  detail?: string;
};

function getStageLabel(stage: ImportStage): string {
  switch (stage) {
    case 'scanning':
      return '正在扫描相册';
    case 'dedup':
      return '正在按 metadata 查重';
    case 'vision':
      return '正在分析照片内容';
    case 'uploading':
      return '正在同步 metadata';
    case 'clustering':
      return '正在聚合事件';
    case 'done':
      return '整理完成';
    default:
      return '准备中';
  }
}

function getProgressValue(progress: ImportProgress): number | undefined {
  const { current, total } = progress;
  if (current === undefined || total === undefined || total <= 0) {
    return undefined;
  }
  return Math.max(0, Math.min(1, current / total));
}

function getStageTone(stage: ImportStage): StatusTone {
  if (stage === 'done') {
    return 'ready';
  }
  if (stage === 'vision' || stage === 'clustering') {
    return 'analyzing';
  }
  return 'importing';
}

export function ImportProgressModal(props: {
  visible: boolean;
  progress: ImportProgress;
  onClose?: () => void;
  allowClose?: boolean;
}) {
  const value = getProgressValue(props.progress);
  const showProgress = typeof value === 'number';
  const label = getStageLabel(props.progress.stage);
  const detail = props.progress.detail;
  const tone = getStageTone(props.progress.stage);

  return (
    <Portal>
      <Modal
        visible={props.visible}
        dismissable={Boolean(props.allowClose)}
        onDismiss={props.allowClose ? props.onClose : undefined}
        contentContainerStyle={styles.container}
      >
        <BottomSheetScaffold
          title={label}
          hint={detail || '默认链路只同步 metadata 与端侧结构化结果。'}
          onClose={props.allowClose ? props.onClose : undefined}
          style={styles.sheet}
        >
          <View style={styles.heroState}>
            <View style={styles.heroIcon}>
              <ActivityIndicator size="large" color={JourneyPalette.accent} />
            </View>
            <StatusPill
              label={tone === 'ready' ? '已就绪' : tone === 'analyzing' ? '分析中' : '导入中'}
              tone={tone}
            />
            <Text variant="headlineMedium" style={styles.heroLabel}>
              {showProgress && props.progress.total
                ? `${props.progress.current || 0} / ${props.progress.total}`
                : '整理进行中'}
            </Text>
          </View>

          <InlineBanner
            icon={tone === 'analyzing' ? 'progress-clock' : 'shield-lock-outline'}
            title={tone === 'analyzing' ? '后台正在继续整理' : '导入状态已经统一收口'}
            body="整理过程中不会把原图作为默认上传内容，当前展示的是本机整理进度。"
            tone="accent"
          />

          {showProgress ? (
            <View style={styles.progressBlock}>
              <ProgressBar
                progress={value}
                color={JourneyPalette.accent}
                style={styles.progressBar}
              />
              <Text variant="labelMedium" style={styles.progressText}>
                当前阶段
                {props.progress.current !== undefined && props.progress.total !== undefined
                  ? ` · ${props.progress.current} / ${props.progress.total}`
                  : ''}
              </Text>
            </View>
          ) : null}

          {props.allowClose ? (
            <ActionButton
              label="关闭"
              tone="secondary"
              onPress={props.onClose || (() => undefined)}
            />
          ) : null}
        </BottomSheetScaffold>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'flex-end',
    margin: 0,
  },
  sheet: {
    paddingBottom: 28,
  },
  heroState: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 26,
    backgroundColor: JourneyPalette.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroLabel: {
    color: JourneyPalette.ink,
    fontWeight: '800',
  },
  progressBlock: {
    marginTop: 14,
    gap: 8,
  },
  progressBar: {
    height: 10,
    borderRadius: 999,
    backgroundColor: JourneyPalette.cardAlt,
  },
  progressText: {
    textAlign: 'center',
    color: JourneyPalette.inkSoft,
  },
});
