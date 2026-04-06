import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ImportProgressModal, type ImportProgress } from '@/components/import/ImportProgressModal';
import { PhotoLibraryPickerScreen } from '@/components/photo/PhotoLibraryPickerModal';
import { importSelectedLibraryAssets } from '@/services/album/photoImportService';

export default function EventPhotoImportRoute() {
  const router = useRouter();
  const params = useLocalSearchParams<{ eventId: string }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const [pickerSubmitting, setPickerSubmitting] = useState(false);
  const [importVisible, setImportVisible] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress>({ stage: 'idle' });

  const importToCurrentEvent = useCallback(
    async (assets: import('expo-media-library').Asset[]) => {
      if (!eventId) {
        router.back();
        return;
      }

      setImportVisible(true);
      setImportProgress({
        stage: 'scanning',
        detail: '正在准备导入照片...',
      });

      try {
        const result = await importSelectedLibraryAssets({
          assets,
          targetEventId: eventId,
          onProgress: (progress) => setImportProgress(progress),
        });

        if (result.selected === 0) {
          Alert.alert('未导入照片', '你这次没有选择任何照片。', [
            { text: '知道了', onPress: () => router.back() },
          ]);
          return;
        }

        if (result.dedupedNew === 0) {
          if (result.failed > 0) {
            Alert.alert('导入失败', '所选照片暂时无法处理，请稍后再试。', [
              { text: '知道了', onPress: () => router.back() },
            ]);
            return;
          }

          Alert.alert(
            '没有新增照片',
            result.dedupedExisting > 0
              ? `已自动去重 ${result.dedupedExisting} 张照片。`
              : '没有可新增的照片。',
            [{ text: '知道了', onPress: () => router.back() }],
          );
          return;
        }

        Alert.alert(
          '已导入',
          result.taskId
            ? `已向当前事件新增 ${result.dedupedNew} 张照片，剩余分析会在后台继续完成。`
            : `已向当前事件新增 ${result.dedupedNew} 张照片。`,
          [{ text: '知道了', onPress: () => router.back() }],
        );
      } catch (error) {
        Alert.alert('导入失败', error instanceof Error ? error.message : '请稍后再试', [
          { text: '知道了', onPress: () => router.back() },
        ]);
      } finally {
        setImportVisible(false);
        setImportProgress({ stage: 'idle' });
        setPickerSubmitting(false);
      }
    },
    [eventId, router],
  );

  return (
    <>
      <PhotoLibraryPickerScreen
        confirmLoading={pickerSubmitting}
        permissionContext="event-add-photo"
        onClose={() => {
          if (pickerSubmitting) {
            return;
          }
          router.back();
        }}
        onConfirm={async (assets) => {
          setPickerSubmitting(true);
          await importToCurrentEvent(assets);
        }}
      />

      <ImportProgressModal
        visible={importVisible && importProgress.stage !== 'idle'}
        progress={importProgress}
        allowClose={false}
      />
    </>
  );
}
