import * as React from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Modal, Portal, ProgressBar, Text } from 'react-native-paper';

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
      return '正在查重';
    case 'vision':
      return '正在启动端侧识别';
    case 'uploading':
      return '正在上传';
    case 'clustering':
      return '正在生成事件';
    case 'done':
      return '完成';
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

  return (
    <Portal>
      <Modal
        visible={props.visible}
        dismissable={Boolean(props.allowClose)}
        onDismiss={props.allowClose ? props.onClose : undefined}
        contentContainerStyle={styles.container}
      >
        <View style={styles.header}>
          <ActivityIndicator animating size="large" />
        </View>
        <Text variant="titleMedium" style={styles.title}>
          {label}
        </Text>
        {detail ? (
          <Text variant="bodyMedium" style={styles.detail}>
            {detail}
          </Text>
        ) : null}

        {showProgress ? (
          <View style={styles.progressBlock}>
            <ProgressBar progress={value} />
            <Text variant="labelSmall" style={styles.progressText}>
              {props.progress.current} / {props.progress.total}
            </Text>
          </View>
        ) : null}

        {props.allowClose ? (
          <Button mode="text" onPress={props.onClose} style={styles.closeButton}>
            关闭
          </Button>
        ) : null}
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 24,
    padding: 20,
    borderRadius: 12,
    backgroundColor: '#fff',
  },
  header: {
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    textAlign: 'center',
    marginBottom: 8,
  },
  detail: {
    textAlign: 'center',
    color: '#666',
  },
  progressBlock: {
    marginTop: 14,
    gap: 8,
  },
  progressText: {
    textAlign: 'center',
    color: '#666',
  },
  closeButton: {
    marginTop: 10,
  },
});
