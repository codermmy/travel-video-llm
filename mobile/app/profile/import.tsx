import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';

import { ImportProgressModal, type ImportProgress } from '@/components/import/ImportProgressModal';
import { PhotoLibraryPickerScreen } from '@/components/photo/PhotoLibraryPickerModal';
import { UploadProgress } from '@/components/upload/UploadProgress';
import {
  importSelectedLibraryAssets,
  type ImportResult,
} from '@/services/album/photoImportService';
import { setPendingProfileImportMessage } from '@/utils/photoRouteResults';
import { openAppSettings } from '@/utils/permissionUtils';

function buildImportSummaryText(result: ImportResult, queued: boolean): string {
  const parts = [`已读取 ${result.selected} 张`, `新增 ${result.dedupedNew} 张`];

  if (result.dedupedExisting > 0) {
    parts.push(`去重 ${result.dedupedExisting} 张`);
  }
  if (result.failed > 0) {
    parts.push(`失败 ${result.failed} 张`);
  }
  if (result.queuedVision > 0) {
    parts.push(`后台分析 ${result.queuedVision} 张`);
  }

  return queued ? `${parts.join('，')}，正在生成回忆...` : parts.join('，');
}

export default function ProfileImportScreen() {
  const router = useRouter();
  const [pickerSubmitting, setPickerSubmitting] = useState(false);
  const [importVisible, setImportVisible] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress>({ stage: 'idle' });
  const [taskProgressVisible, setTaskProgressVisible] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [queuedMessage, setQueuedMessage] = useState<string | null>(null);

  const executeLibraryImport = useCallback(
    async (assets: import('expo-media-library').Asset[]) => {
      let shouldReturn = true;
      let messageToShow: string | null = null;

      setImportVisible(true);
      setImportProgress({
        stage: 'scanning',
        detail: '正在准备导入照片...',
      });

      try {
        const result = await importSelectedLibraryAssets({
          assets,
          onProgress: (progress) => setImportProgress(progress),
        });

        if (result.selected === 0) {
          messageToShow = '你取消了本次导入';
          return;
        }

        if (result.dedupedNew === 0) {
          if (result.failed > 0) {
            messageToShow = '导入失败：所选照片无法处理';
            return;
          }

          messageToShow =
            result.dedupedExisting > 0
              ? `没有发现可新增的照片，已去重 ${result.dedupedExisting} 张`
              : '没有发现可新增的照片';
          return;
        }

        if (result.taskId) {
          shouldReturn = false;
          setTaskId(result.taskId);
          setQueuedMessage(buildImportSummaryText(result, true));
          setTaskProgressVisible(true);
          return;
        }

        messageToShow = buildImportSummaryText(result, false);
      } catch (importError) {
        const message = String(importError);
        if (message.includes('permission_denied')) {
          shouldReturn = false;
          Alert.alert('需要相册权限', '请先在系统设置中开启相册权限。', [
            {
              text: '取消',
              style: 'cancel',
              onPress: () => router.back(),
            },
            {
              text: '打开设置',
              onPress: () => {
                router.back();
                openAppSettings();
              },
            },
          ]);
        } else {
          messageToShow = '导入失败，请稍后重试';
        }
      } finally {
        setImportVisible(false);
        setImportProgress({ stage: 'idle' });
        setPickerSubmitting(false);

        if (shouldReturn) {
          if (messageToShow) {
            setPendingProfileImportMessage(messageToShow);
          }
          router.back();
        }
      }
    },
    [router],
  );

  return (
    <>
      <PhotoLibraryPickerScreen
        confirmLoading={pickerSubmitting}
        onClose={() => {
          if (pickerSubmitting) {
            return;
          }
          router.back();
        }}
        onConfirm={async (assets) => {
          setPickerSubmitting(true);
          await executeLibraryImport(assets);
        }}
      />

      <ImportProgressModal
        visible={importVisible && importProgress.stage !== 'idle'}
        progress={importProgress}
        allowClose={false}
      />

      <UploadProgress
        visible={taskProgressVisible}
        taskId={taskId}
        onContinueInBackground={() => {
          if (queuedMessage) {
            setPendingProfileImportMessage(queuedMessage);
          }
          setTaskProgressVisible(false);
          setTaskId(null);
          router.back();
        }}
        onDismissFailed={() => {
          setTaskProgressVisible(false);
          setTaskId(null);
          router.back();
        }}
        onComplete={() => {
          setPendingProfileImportMessage('事件生成完成，已更新列表');
          setTaskProgressVisible(false);
          setTaskId(null);
          router.back();
        }}
      />
    </>
  );
}
