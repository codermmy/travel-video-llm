import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ImportProgressModal, type ImportProgress } from '@/components/import/ImportProgressModal';
import { PhotoLibraryPickerModal } from '@/components/photo/PhotoLibraryPickerModal';
import { SelectableMediaGrid } from '@/components/photo/SelectableMediaGrid';
import {
  ActionButton,
  BottomSheetScaffold,
  InlineBanner,
  SectionLabel,
  SurfaceCard,
} from '@/components/ui/revamp';
import {
  importSelectedLibraryAssets,
  type ImportResult,
} from '@/services/album/photoImportService';
import { eventApi } from '@/services/api/eventApi';
import { photoApi } from '@/services/api/photoApi';
import { usePhotoViewerStore } from '@/stores/photoViewerStore';
import { JourneyPalette } from '@/styles/colors';
import type { EventDetail, EventRecord } from '@/types/event';
import { getPreferredPhotoThumbnailUri } from '@/utils/mediaRefs';

type EventPhotoManagerSheetProps = {
  visible: boolean;
  eventId: string | null;
  onClose: () => void;
  onChanged: (params: { deletedCurrentEvent: boolean }) => void;
};

function isNotFoundError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'response' in error &&
    Number((error as { response?: { status?: number } }).response?.status) === 404
  );
}

export function EventPhotoManagerSheet({
  visible,
  eventId,
  onClose,
  onChanged,
}: EventPhotoManagerSheetProps) {
  const router = useRouter();
  const setPhotoViewerSession = usePhotoViewerStore((state) => state.setSession);
  const [loading, setLoading] = useState(false);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [availableEvents, setAvailableEvents] = useState<EventRecord[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerSubmitting, setPickerSubmitting] = useState(false);
  const [importVisible, setImportVisible] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress>({ stage: 'idle' });
  const [movePickerVisible, setMovePickerVisible] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventLocation, setNewEventLocation] = useState('');
  const selectionMode = selectedPhotoIds.length > 0;
  const canClose = !isActionLoading && !pickerSubmitting;

  const loadData = useCallback(async () => {
    if (!eventId) {
      return;
    }

    setLoading(true);
    try {
      const [detail, allEvents] = await Promise.all([
        eventApi.getEventDetail(eventId),
        eventApi.listAllEvents(),
      ]);
      setEvent(detail);
      setAvailableEvents(allEvents.filter((item) => item.id !== eventId));
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    if (!visible) {
      setSelectedPhotoIds([]);
      setMovePickerVisible(false);
      setPickerVisible(false);
      return;
    }
    setSelectedPhotoIds([]);
    setMovePickerVisible(false);
    setPickerVisible(false);
    setNewEventTitle('');
    setNewEventLocation('');
    void loadData();
  }, [loadData, visible]);

  const selectableItems = useMemo(
    () =>
      (event?.photos ?? []).map((photo) => ({
        id: photo.id,
        key: photo.id,
        uri: getPreferredPhotoThumbnailUri(photo),
      })),
    [event],
  );

  const handleClose = useCallback(() => {
    if (!canClose) {
      return;
    }
    onClose();
  }, [canClose, onClose]);

  const refreshOrCloseDeletedEvent = useCallback(async () => {
    if (!eventId) {
      return;
    }
    try {
      await loadData();
      onChanged({ deletedCurrentEvent: false });
    } catch (error) {
      if (isNotFoundError(error)) {
        onClose();
        onChanged({ deletedCurrentEvent: true });
        return;
      }
      throw error;
    }
  }, [eventId, loadData, onChanged, onClose]);

  const handleBatchResult = useCallback(
    async (deletedEventIds: string[]) => {
      if (eventId && deletedEventIds.includes(eventId)) {
        setMovePickerVisible(false);
        onClose();
        onChanged({ deletedCurrentEvent: true });
        return;
      }

      setSelectedPhotoIds([]);
      setMovePickerVisible(false);
      await refreshOrCloseDeletedEvent();
    },
    [eventId, onChanged, onClose, refreshOrCloseDeletedEvent],
  );

  const runPhotoMutation = useCallback(
    async (runner: () => Promise<{ deletedEventIds: string[] }>, errorTitle: string) => {
      try {
        setIsActionLoading(true);
        const result = await runner();
        await handleBatchResult(result.deletedEventIds);
      } catch (error) {
        Alert.alert(errorTitle, error instanceof Error ? error.message : '请稍后再试');
      } finally {
        setIsActionLoading(false);
      }
    },
    [handleBatchResult],
  );

  const importToCurrentEvent = useCallback(
    async (assets: import('expo-media-library').Asset[]) => {
      if (!event) {
        return;
      }

      setImportVisible(true);
      setImportProgress({
        stage: 'scanning',
        detail: `正在准备把所选照片导入“${event.title || '未命名事件'}”...`,
      });

      try {
        const result: ImportResult = await importSelectedLibraryAssets({
          assets,
          targetEventId: event.id,
          onProgress: (progress) => setImportProgress(progress),
        });

        if (result.selected === 0) {
          Alert.alert('未导入照片', '你这次没有选择任何照片。');
          return;
        }

        if (result.dedupedNew === 0) {
          if (result.failed > 0) {
            Alert.alert('导入失败', '所选照片暂时无法处理，请稍后再试。');
            return;
          }

          Alert.alert(
            '没有新增照片',
            result.dedupedExisting > 0
              ? `已自动去重 ${result.dedupedExisting} 张照片。`
              : '没有可新增的照片。',
          );
          return;
        }

        await refreshOrCloseDeletedEvent();
        Alert.alert(
          '已导入',
          result.taskId
            ? `已向当前事件新增 ${result.dedupedNew} 张照片，剩余分析会在后台继续完成。`
            : `已向当前事件新增 ${result.dedupedNew} 张照片。`,
        );
      } catch (error) {
        Alert.alert('导入失败', error instanceof Error ? error.message : '请稍后再试');
      } finally {
        setImportVisible(false);
        setImportProgress({ stage: 'idle' });
        setPickerSubmitting(false);
        setPickerVisible(false);
      }
    },
    [event, refreshOrCloseDeletedEvent],
  );

  const gridHeader = (
    <View style={styles.gridHeader}>
      <View style={styles.toolbarCard}>
        <View style={styles.toolbarTopRow}>
          <View style={styles.toolbarCopy}>
            <Text style={styles.toolbarTitle}>{event?.title || '未命名事件'}</Text>
            <Text style={styles.toolbarHint}>
              {selectionMode
                ? `已选择 ${selectedPhotoIds.length} / ${event?.photos.length ?? 0}`
                : '默认先浏览照片，长按任意一张进入选择状态，再像系统相册一样滑动多选。'}
            </Text>
          </View>
          {selectionMode ? (
            <Pressable
              onPress={() => setSelectedPhotoIds([])}
              style={({ pressed }) => [styles.toolbarPill, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons
                name="close-circle-outline"
                size={16}
                color={JourneyPalette.ink}
              />
              <Text style={styles.toolbarPillText}>取消选择</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.toolbarRow}>
          <Pressable
            onPress={() => setPickerVisible(true)}
            disabled={pickerSubmitting || isActionLoading}
            style={({ pressed }) => [
              styles.toolbarButton,
              pressed && styles.pressed,
              (pickerSubmitting || isActionLoading) && styles.disabledAction,
            ]}
          >
            <MaterialCommunityIcons name="image-plus" size={16} color={JourneyPalette.ink} />
            <Text style={styles.toolbarButtonText}>添加照片</Text>
          </Pressable>

          <Pressable
            onPress={() => setSelectedPhotoIds((event?.photos ?? []).map((photo) => photo.id))}
            disabled={(event?.photos.length ?? 0) === 0 || isActionLoading}
            style={({ pressed }) => [
              styles.toolbarButton,
              pressed && styles.pressed,
              ((event?.photos.length ?? 0) === 0 || isActionLoading) && styles.disabledAction,
            ]}
          >
            <MaterialCommunityIcons
              name="checkbox-multiple-marked-outline"
              size={16}
              color={JourneyPalette.ink}
            />
            <Text style={styles.toolbarButtonText}>全选</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
        <GestureHandlerRootView style={styles.gestureRoot}>
          <View style={styles.modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} disabled={!canClose} />
            <BottomSheetScaffold
              title="管理照片"
              hint="把浏览、选择、多选和补导入收进同一条连续流程里。"
              onClose={canClose ? handleClose : undefined}
              style={styles.modalSheet}
              footer={
                selectionMode ? (
                  <View style={styles.batchActions}>
                    <ActionButton
                      label="移出当前事件"
                      tone="secondary"
                      style={styles.flexButton}
                      disabled={isActionLoading}
                      onPress={() => {
                        void runPhotoMutation(
                          () => photoApi.reassignPhotosToEvent(selectedPhotoIds, null),
                          '移出失败',
                        );
                      }}
                    />
                    <ActionButton
                      label="移动到其他事件"
                      tone="secondary"
                      style={styles.flexButton}
                      disabled={isActionLoading}
                      onPress={() => setMovePickerVisible(true)}
                    />
                    <ActionButton
                      label="删除照片"
                      tone="danger"
                      style={styles.flexButton}
                      disabled={isActionLoading}
                      onPress={() => {
                        Alert.alert(
                          '删除照片',
                          '删除后将无法恢复，选中的照片会从应用数据里移除。',
                          [
                            { text: '取消', style: 'cancel' },
                            {
                              text: '删除',
                              style: 'destructive',
                              onPress: () => {
                                void runPhotoMutation(
                                  () => photoApi.deletePhotos(selectedPhotoIds),
                                  '删除失败',
                                );
                              },
                            },
                          ],
                        );
                      }}
                    />
                  </View>
                ) : null
              }
            >
              <InlineBanner
                icon="image-multiple-outline"
                title={
                  selectionMode
                    ? `已选择 ${selectedPhotoIds.length} / ${event?.photos.length ?? 0} 张`
                    : event?.title || '未命名事件'
                }
                body={
                  selectionMode
                    ? '保持选择态后可以继续滑动多选，再决定移动、移出或删除。'
                    : '默认先浏览照片，长按任意一张进入选择态；顶部不再堆一排零散动作。'
                }
                tone="neutral"
                style={styles.topBanner}
              />

              {loading ? (
                <SurfaceCard style={styles.loadingState}>
                  <ActivityIndicator color={JourneyPalette.accent} />
                  <Text style={styles.loadingText}>正在加载事件照片...</Text>
                </SurfaceCard>
              ) : (
                <View style={styles.gridContainer}>
                  <SelectableMediaGrid
                    items={selectableItems}
                    selectedIds={selectedPhotoIds}
                    onSelectionChange={setSelectedPhotoIds}
                    emptyText="这个事件还没有可管理的照片"
                    header={gridHeader}
                    onItemPress={(_item, index: number) => {
                      if (!event || event.photos.length === 0) {
                        return;
                      }
                      setPhotoViewerSession(event.photos, index);
                      router.push('/photo-viewer');
                    }}
                  />
                </View>
              )}
            </BottomSheetScaffold>
          </View>
        </GestureHandlerRootView>
      </Modal>

      <PhotoLibraryPickerModal
        visible={pickerVisible}
        title="添加照片到当前事件"
        hint={`从系统相册挑选照片，直接导入到“${event?.title || '未命名事件'}”。长按开始滑动多选。`}
        confirmLabel="导入到当前事件"
        confirmLoading={pickerSubmitting}
        onClose={() => {
          if (!canClose) {
            return;
          }
          setPickerVisible(false);
        }}
        onConfirm={async (assets) => {
          setPickerSubmitting(true);
          await importToCurrentEvent(assets);
        }}
      />

      <Modal
        visible={movePickerVisible}
        animationType="fade"
        transparent
        onRequestClose={() => {
          if (isActionLoading) {
            return;
          }
          setMovePickerVisible(false);
        }}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setMovePickerVisible(false)}
            disabled={isActionLoading}
          />
          <BottomSheetScaffold
            title="移动到其他事件"
            hint={`已选择 ${selectedPhotoIds.length} 张。可以移动到已有事件，或直接新建一个事件承接这些照片。`}
            onClose={isActionLoading ? undefined : () => setMovePickerVisible(false)}
            style={styles.moveSheet}
          >
            <InlineBanner
              icon="swap-horizontal"
              title="目标事件选择"
              body="先选目标，再执行移动；也支持直接新建事件来承接误聚合的照片。"
              tone="neutral"
              style={styles.topBanner}
            />

            <ScrollView contentContainerStyle={styles.moveContent}>
              <SurfaceCard style={styles.moveCard}>
                <SectionLabel title="已有事件" />
                {availableEvents.length > 0 ? (
                  <View style={styles.targetEventList}>
                    {availableEvents.map((targetEvent) => (
                      <Pressable
                        key={targetEvent.id}
                        onPress={() => {
                          void runPhotoMutation(
                            () => photoApi.reassignPhotosToEvent(selectedPhotoIds, targetEvent.id),
                            '移动失败',
                          );
                        }}
                        disabled={isActionLoading}
                        style={({ pressed }) => [
                          styles.targetEventItem,
                          pressed && styles.pressed,
                          isActionLoading && styles.disabledAction,
                        ]}
                      >
                        <Text style={styles.targetEventTitle} numberOfLines={1}>
                          {targetEvent.title || '未命名事件'}
                        </Text>
                        <Text style={styles.targetEventMeta} numberOfLines={1}>
                          {targetEvent.locationName || '地点待补充'}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.mutedText}>暂时没有其他可移动到的事件。</Text>
                )}
              </SurfaceCard>

              <SurfaceCard style={styles.moveCard}>
                <SectionLabel title="新建事件并移动" />
                <TextInput
                  value={newEventTitle}
                  onChangeText={setNewEventTitle}
                  placeholder="新事件标题（可选）"
                  placeholderTextColor={JourneyPalette.muted}
                  style={styles.fieldInput}
                />
                <TextInput
                  value={newEventLocation}
                  onChangeText={setNewEventLocation}
                  placeholder="地点（可选）"
                  placeholderTextColor={JourneyPalette.muted}
                  style={styles.fieldInput}
                />
                <ActionButton
                  label="新建事件并移动选中照片"
                  onPress={() => {
                    void (async () => {
                      try {
                        setIsActionLoading(true);
                        await eventApi.createEvent({
                          title: newEventTitle.trim() || undefined,
                          locationName: newEventLocation.trim() || undefined,
                          photoIds: selectedPhotoIds,
                        });
                        await handleBatchResult([]);
                      } catch (error) {
                        Alert.alert(
                          '创建失败',
                          error instanceof Error ? error.message : '请稍后再试',
                        );
                      } finally {
                        setIsActionLoading(false);
                      }
                    })();
                  }}
                  disabled={isActionLoading}
                />
              </SurfaceCard>
            </ScrollView>
          </BottomSheetScaffold>
        </View>
      </Modal>

      <ImportProgressModal
        visible={importVisible && importProgress.stage !== 'idle'}
        progress={importProgress}
        allowClose={false}
      />
    </>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.34)',
  },
  modalSheet: {
    height: '88%',
    paddingBottom: 18,
  },
  moveSheet: {
    height: '78%',
    paddingBottom: 18,
  },
  gridHeader: {
    paddingTop: 4,
    paddingBottom: 12,
  },
  topBanner: {
    marginBottom: 12,
  },
  toolbarCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.card,
    padding: 16,
    gap: 12,
  },
  toolbarTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  toolbarCopy: {
    flex: 1,
    gap: 4,
  },
  toolbarTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  toolbarHint: {
    lineHeight: 19,
    color: JourneyPalette.inkSoft,
  },
  toolbarRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  toolbarButton: {
    minHeight: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.cardAlt,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toolbarButtonText: {
    fontWeight: '700',
    color: JourneyPalette.ink,
  },
  toolbarPill: {
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.cardAlt,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toolbarPillText: {
    fontWeight: '700',
    color: JourneyPalette.ink,
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  loadingText: {
    color: JourneyPalette.inkSoft,
  },
  gridContainer: {
    flex: 1,
    minHeight: 320,
    paddingTop: 8,
  },
  batchActions: {
    gap: 10,
  },
  flexButton: {
    flex: 1,
  },
  moveContent: {
    paddingTop: 4,
    gap: 14,
  },
  moveCard: {
    gap: 10,
  },
  targetEventList: {
    gap: 10,
  },
  targetEventItem: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.cardAlt,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  targetEventTitle: {
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  targetEventMeta: {
    color: JourneyPalette.inkSoft,
  },
  fieldInput: {
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.cardAlt,
    paddingHorizontal: 14,
    color: JourneyPalette.ink,
  },
  mutedText: {
    color: JourneyPalette.inkSoft,
  },
  disabledAction: {
    opacity: 0.55,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
});
