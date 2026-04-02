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
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <View style={styles.modalHeader}>
                <View style={styles.modalCopy}>
                  <Text style={styles.modalTitle}>管理照片</Text>
                  <Text style={styles.modalHint}>
                    可以添加照片、批量移出当前事件、移动到其他事件，或直接删除照片。
                  </Text>
                </View>
                <Pressable
                  onPress={handleClose}
                  disabled={!canClose}
                  style={({ pressed }) => [
                    styles.modalCloseBtn,
                    pressed && styles.pressed,
                    !canClose && styles.disabledAction,
                  ]}
                >
                  <MaterialCommunityIcons name="close" size={18} color={JourneyPalette.inkSoft} />
                </Pressable>
              </View>

              {loading ? (
                <View style={styles.loadingState}>
                  <ActivityIndicator color={JourneyPalette.accent} />
                  <Text style={styles.loadingText}>正在加载事件照片...</Text>
                </View>
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

              {selectionMode ? (
                <View style={styles.batchActions}>
                  <Pressable
                    onPress={() => {
                      void runPhotoMutation(
                        () => photoApi.reassignPhotosToEvent(selectedPhotoIds, null),
                        '移出失败',
                      );
                    }}
                    disabled={isActionLoading}
                    style={({ pressed }) => [
                      styles.batchGhostAction,
                      pressed && styles.pressed,
                      isActionLoading && styles.disabledAction,
                    ]}
                  >
                    <Text style={styles.batchGhostText}>移出当前事件</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setMovePickerVisible(true)}
                    disabled={isActionLoading}
                    style={({ pressed }) => [
                      styles.batchGhostAction,
                      pressed && styles.pressed,
                      isActionLoading && styles.disabledAction,
                    ]}
                  >
                    <Text style={styles.batchGhostText}>移动到其他事件</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      Alert.alert('删除照片', '删除后将无法恢复，选中的照片会从应用数据里移除。', [
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
                      ]);
                    }}
                    disabled={isActionLoading}
                    style={({ pressed }) => [
                      styles.batchDangerAction,
                      pressed && styles.pressed,
                      isActionLoading && styles.disabledAction,
                    ]}
                  >
                    <Text style={styles.batchDangerText}>删除照片</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
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
          <View style={styles.moveSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalCopy}>
                <Text style={styles.modalTitle}>移动到其他事件</Text>
                <Text style={styles.modalHint}>
                  {`已选择 ${selectedPhotoIds.length} 张。可以移动到已有事件，或直接新建一个事件承接这些照片。`}
                </Text>
              </View>
              <Pressable
                onPress={() => setMovePickerVisible(false)}
                disabled={isActionLoading}
                style={({ pressed }) => [
                  styles.modalCloseBtn,
                  pressed && styles.pressed,
                  isActionLoading && styles.disabledAction,
                ]}
              >
                <MaterialCommunityIcons name="close" size={18} color={JourneyPalette.inkSoft} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.moveContent}>
              <View style={styles.moveCard}>
                <Text style={styles.moveCardTitle}>已有事件</Text>
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
              </View>

              <View style={styles.moveCard}>
                <Text style={styles.moveCardTitle}>新建事件并移动</Text>
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
                <Pressable
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
                  style={({ pressed }) => [
                    styles.primaryPill,
                    pressed && styles.pressed,
                    isActionLoading && styles.disabledAction,
                  ]}
                >
                  {isActionLoading ? (
                    <ActivityIndicator color="#FFF9F2" />
                  ) : (
                    <Text style={styles.primaryPillText}>新建事件并移动选中照片</Text>
                  )}
                </Pressable>
              </View>
            </ScrollView>
          </View>
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
    backgroundColor: 'rgba(21, 32, 31, 0.42)',
  },
  modalSheet: {
    height: '88%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: JourneyPalette.card,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 20,
  },
  moveSheet: {
    height: '78%',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: JourneyPalette.card,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 20,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: JourneyPalette.lineStrong,
    marginBottom: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalCopy: {
    flex: 1,
    gap: 6,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  modalHint: {
    lineHeight: 20,
    color: JourneyPalette.inkSoft,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.cardAlt,
  },
  gridHeader: {
    paddingTop: 16,
    paddingBottom: 12,
  },
  toolbarCard: {
    borderRadius: 20,
    backgroundColor: JourneyPalette.cardAlt,
    padding: 14,
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
    backgroundColor: '#FFF9F2',
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
    backgroundColor: '#FFF9F2',
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
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  batchGhostAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  batchGhostText: {
    color: JourneyPalette.ink,
    fontWeight: '800',
    textAlign: 'center',
  },
  batchDangerAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: '#F6D9D6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  batchDangerText: {
    color: JourneyPalette.danger,
    fontWeight: '800',
    textAlign: 'center',
  },
  moveContent: {
    paddingTop: 16,
    gap: 14,
  },
  moveCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.cardAlt,
    padding: 14,
    gap: 10,
  },
  moveCardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  targetEventList: {
    gap: 10,
  },
  targetEventItem: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: '#FFF9F2',
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
    backgroundColor: '#FFF9F2',
    paddingHorizontal: 14,
    color: JourneyPalette.ink,
  },
  primaryPill: {
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: JourneyPalette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  primaryPillText: {
    color: '#FFF9F2',
    fontWeight: '800',
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
