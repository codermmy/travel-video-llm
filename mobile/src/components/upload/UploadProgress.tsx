import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Modal, Portal, ProgressBar, Text } from 'react-native-paper';

import {
  ActionButton,
  BottomSheetScaffold,
  InlineBanner,
  StatusPill,
} from '@/components/ui/revamp';
import { taskApi, type TaskStatus } from '@/services/api/taskApi';
import { JourneyPalette } from '@/styles/colors';
import type { StatusTone } from '@/components/ui/revamp';

type UploadPhase = 'pending' | 'clustering' | 'geocoding' | 'ai' | 'completed' | 'failed';

type UploadProgressProps = {
  visible: boolean;
  taskId?: string | null;
  onComplete?: () => void;
  onContinueInBackground?: () => void;
  onDismissFailed?: () => void;
};

const POLL_INTERVAL = 2000;

function toPhase(status?: TaskStatus | null): UploadPhase {
  if (!status) {
    return 'pending';
  }

  const raw = status.status.toLowerCase();
  if (raw === 'success' || raw === 'completed') {
    return 'completed';
  }
  if (raw === 'failure' || raw === 'failed' || raw === 'error' || raw === 'revoked') {
    return 'failed';
  }

  if (status.stage === 'ai') {
    return 'ai';
  }
  if (status.stage === 'geocoding') {
    return 'geocoding';
  }
  if (status.stage === 'clustering') {
    return 'clustering';
  }
  return 'pending';
}

function getProgressPercent(status?: TaskStatus | null): number {
  if (!status) {
    return 0;
  }
  return Math.max(0, Math.min(100, Math.round(status.progress)));
}

function getPhaseMessage(phase: UploadPhase): string {
  switch (phase) {
    case 'clustering':
      return '正在聚合事件';
    case 'geocoding':
      return '正在补充地点信息';
    case 'ai':
      return '正在生成故事';
    case 'completed':
      return '整理完成';
    case 'failed':
      return '整理失败';
    case 'pending':
    default:
      return '正在准备整理任务';
  }
}

function getPhaseTone(phase: UploadPhase): StatusTone {
  if (phase === 'failed') {
    return 'failed';
  }
  if (phase === 'completed') {
    return 'ready';
  }
  if (phase === 'pending') {
    return 'importing';
  }
  return 'analyzing';
}

export function UploadProgress({
  visible,
  taskId,
  onComplete,
  onContinueInBackground,
  onDismissFailed,
}: UploadProgressProps) {
  const router = useRouter();
  const [status, setStatus] = useState<TaskStatus | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const completedNotifiedRef = useRef(false);

  const phase = toPhase(status);
  const percent = getProgressPercent(status);
  const tone = getPhaseTone(phase);

  const pollStatus = useCallback(async () => {
    if (!taskId) {
      return;
    }

    try {
      const next = await taskApi.getTaskStatus(taskId);
      setStatus(next);
      setPollError(null);
    } catch (error) {
      console.warn('Upload status polling failed:', error);
      setPollError('网络波动，仍在继续获取任务状态...');
    }
  }, [taskId]);

  useEffect(() => {
    if (!visible || !taskId) {
      return;
    }

    completedNotifiedRef.current = false;
    void pollStatus();
    const interval = setInterval(() => {
      void pollStatus();
    }, POLL_INTERVAL);

    return () => {
      clearInterval(interval);
    };
  }, [pollStatus, taskId, visible]);

  useEffect(() => {
    if (phase !== 'completed' || completedNotifiedRef.current) {
      return;
    }

    completedNotifiedRef.current = true;
    onComplete?.();
  }, [onComplete, phase]);

  const hintText = useMemo(() => {
    if (phase === 'clustering') {
      return '系统会按时间和地点自动整理最近导入的照片。';
    }
    if (phase === 'geocoding') {
      return '正在补充地点展示信息，不会上传原图。';
    }
    if (phase === 'ai') {
      return '照片结构化结果已就绪，系统正在按事件分批生成故事。';
    }
    if (phase === 'failed') {
      return status?.error || '可稍后重新生成该事件故事。';
    }
    if (pollError) {
      return pollError;
    }
    return status?.result || '默认链路只同步 metadata 与端侧结构化结果。';
  }, [phase, pollError, status?.error, status?.result]);

  if (!visible || !taskId) {
    return null;
  }

  return (
    <Portal>
      <Modal visible dismissable={false} contentContainerStyle={styles.container}>
        <BottomSheetScaffold title={getPhaseMessage(phase)} hint={hintText} style={styles.sheet}>
          <View style={styles.heroState}>
            <View style={[styles.heroIcon, phase === 'failed' ? styles.heroIconDanger : null]}>
              {phase === 'failed' ? (
                <Text style={styles.heroIconText}>!</Text>
              ) : (
                <ActivityIndicator size="large" color={JourneyPalette.accent} />
              )}
            </View>
            <StatusPill
              label={
                tone === 'failed'
                  ? '失败'
                  : tone === 'ready'
                    ? '已就绪'
                    : tone === 'analyzing'
                      ? '分析中'
                      : '导入中'
              }
              tone={tone}
            />
            <Text variant="displaySmall" style={styles.percentText}>
              {percent}%
            </Text>
          </View>

          <ProgressBar
            progress={Math.max(0, Math.min(1, percent / 100))}
            style={styles.progressBar}
            color={phase === 'failed' ? JourneyPalette.danger : JourneyPalette.accent}
          />

          <InlineBanner
            icon={phase === 'failed' ? 'alert-circle-outline' : 'timeline-clock-outline'}
            title={phase === 'failed' ? '需要关注这次任务' : '任务会继续在后台推进'}
            body={
              phase === 'failed'
                ? status?.error || '失败项会留在任务中心，你可以稍后再回看或重试。'
                : '即时反馈会短暂出现，完整阶段记录会统一沉淀到任务中心。'
            }
            tone={phase === 'failed' ? 'danger' : 'accent'}
            style={styles.banner}
          />

          {phase === 'failed' ? (
            <View style={styles.failureActions}>
              <ActionButton
                label="去任务中心"
                tone="secondary"
                onPress={() => {
                  onDismissFailed?.();
                  router.push({
                    pathname: '/profile/import-tasks',
                    params: {
                      filter: 'failed',
                      focusTaskId: taskId,
                      intentKey: String(Date.now()),
                    },
                  });
                }}
                style={styles.failureActionButton}
              />
              <ActionButton
                label="关闭"
                onPress={onDismissFailed || (() => undefined)}
                style={styles.failureActionButton}
              />
            </View>
          ) : (
            <ActionButton
              label="后台继续"
              tone="secondary"
              onPress={onContinueInBackground || (() => undefined)}
            />
          )}
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
    gap: 10,
    marginBottom: 16,
  },
  heroIcon: {
    width: 76,
    height: 76,
    borderRadius: 28,
    backgroundColor: JourneyPalette.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIconDanger: {
    backgroundColor: JourneyPalette.dangerSoft,
  },
  heroIconText: {
    fontSize: 30,
    fontWeight: '900',
    color: JourneyPalette.danger,
  },
  percentText: {
    color: JourneyPalette.ink,
    fontWeight: '900',
  },
  progressBar: {
    height: 8,
    borderRadius: 999,
    backgroundColor: JourneyPalette.cardAlt,
  },
  banner: {
    marginTop: 16,
  },
  failureActions: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 10,
  },
  failureActionButton: {
    flex: 1,
  },
  primaryAction: {
    marginTop: 16,
  },
});
