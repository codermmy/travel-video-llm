import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Modal, Portal, ProgressBar, Text } from 'react-native-paper';

import { taskApi, type TaskStatus } from '@/services/api/taskApi';

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

export function UploadProgress({
  visible,
  taskId,
  onComplete,
  onContinueInBackground,
  onDismissFailed,
}: UploadProgressProps) {
  const [status, setStatus] = useState<TaskStatus | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const completedNotifiedRef = useRef(false);

  const phase = toPhase(status);
  const percent = getProgressPercent(status);

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
        <View style={styles.iconWrap}>
          {phase === 'failed' ? (
            <ActivityIndicator animating={false} />
          ) : (
            <ActivityIndicator size="large" />
          )}
        </View>

        <Text variant="titleMedium" style={styles.title}>
          {getPhaseMessage(phase)}
        </Text>

        <Text variant="headlineSmall" style={styles.percentText}>
          {percent}%
        </Text>

        <ProgressBar
          progress={Math.max(0, Math.min(1, percent / 100))}
          style={styles.progressBar}
        />

        {hintText ? (
          <Text variant="bodySmall" style={styles.hint}>
            {hintText}
          </Text>
        ) : null}

        {phase === 'failed' ? (
          <Button mode="contained" onPress={onDismissFailed} style={styles.primaryAction}>
            关闭
          </Button>
        ) : (
          <Button mode="outlined" onPress={onContinueInBackground} style={styles.primaryAction}>
            后台继续
          </Button>
        )}
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 28,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 22,
  },
  iconWrap: {
    alignItems: 'center',
  },
  title: {
    marginTop: 12,
    textAlign: 'center',
    color: '#213053',
  },
  percentText: {
    marginTop: 10,
    textAlign: 'center',
    color: '#2F6AF6',
    fontWeight: '700',
  },
  progressBar: {
    marginTop: 10,
    height: 8,
    borderRadius: 999,
  },
  hint: {
    marginTop: 10,
    textAlign: 'center',
    color: '#63759A',
    lineHeight: 18,
  },
  primaryAction: {
    marginTop: 16,
  },
});
