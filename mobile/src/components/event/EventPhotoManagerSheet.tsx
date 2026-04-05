import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ImportProgressModal, type ImportProgress } from '@/components/import/ImportProgressModal';
import { PhotoLibraryPickerModal } from '@/components/photo/PhotoLibraryPickerModal';
import { SelectableMediaGrid } from '@/components/photo/SelectableMediaGrid';
import { ActionButton, SectionLabel, SurfaceCard } from '@/components/ui/revamp';
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
  entryMode?: 'browse' | 'move-target';
  onClose: () => void;
  onChanged: (params: { deletedCurrentEvent: boolean }) => void;
};

type SheetPanelProps = {
  title: string;
  subtitle?: string;
  headerAction?: ReactNode;
  headerBottom?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
  footerStyle?: StyleProp<ViewStyle>;
};

function isNotFoundError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'response' in error &&
    Number((error as { response?: { status?: number } }).response?.status) === 404
  );
}

function SheetPanel({
  title,
  subtitle,
  headerAction,
  headerBottom,
  footer,
  children,
  style,
  bodyStyle,
  footerStyle,
}: SheetPanelProps) {
  return (
    <View style={[styles.sheet, style]}>
      <View style={styles.sheetHandle} />
      <View style={styles.sheetHeader}>
        <View style={styles.sheetHeaderCopy}>
          <Text style={styles.sheetTitle}>{title}</Text>
          {subtitle ? <Text style={styles.sheetSubtitle}>{subtitle}</Text> : null}
        </View>
        {headerAction ? <View style={styles.sheetHeaderAction}>{headerAction}</View> : null}
      </View>
      {headerBottom ? <View style={styles.sheetHeaderBottom}>{headerBottom}</View> : null}
      <View style={[styles.sheetBody, bodyStyle]}>{children}</View>
      {footer ? <View style={[styles.sheetFooter, footerStyle]}>{footer}</View> : null}
    </View>
  );
}

export function EventPhotoManagerSheet({
  visible,
  eventId,
  entryMode = 'browse',
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
  const moveEntryHandledRef = useRef(false);
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
      moveEntryHandledRef.current = false;
      return;
    }
    setSelectedPhotoIds([]);
    setMovePickerVisible(false);
    setPickerVisible(false);
    setNewEventTitle('');
    setNewEventLocation('');
    moveEntryHandledRef.current = false;
    void loadData();
  }, [loadData, visible]);

  useEffect(() => {
    if (!visible || entryMode !== 'move-target' || moveEntryHandledRef.current) {
      return;
    }
    if (!event) {
      return;
    }

    moveEntryHandledRef.current = true;
    if (event.photos.length === 0) {
      setMovePickerVisible(false);
      return;
    }

    setSelectedPhotoIds(event.photos.map((photo) => photo.id));
    setMovePickerVisible(true);
  }, [entryMode, event, visible]);

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

  const gridHeader = selectionMode ? (
    <View style={styles.modeBar}>
      <Text style={styles.modeBarText}>{`已选择 ${selectedPhotoIds.length} 张照片`}</Text>
    </View>
  ) : null;

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
        <GestureHandlerRootView style={styles.gestureRoot}>
          <View style={styles.modalBackdrop}>
            <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} disabled={!canClose} />

            <SheetPanel
              title="照片管理"
              headerAction={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="添加照片"
                  onPress={() => setPickerVisible(true)}
                  disabled={pickerSubmitting || isActionLoading}
                  style={({ pressed }) => [
                    styles.addPhotoButton,
                    pressed && styles.pressed,
                    (pickerSubmitting || isActionLoading) && styles.disabledAction,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="image-plus"
                    size={20}
                    color={JourneyPalette.accent}
                  />
                </Pressable>
              }
              headerBottom={gridHeader}
              style={styles.modalSheet}
              bodyStyle={styles.modalBody}
              footer={
                selectionMode ? (
                  <View style={styles.contextActions}>
                    <Pressable
                      onPress={() => setMovePickerVisible(true)}
                      disabled={isActionLoading}
                      style={({ pressed }) => [
                        styles.contextActionButton,
                        pressed && styles.pressed,
                        isActionLoading && styles.disabledAction,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="arrow-right-bold-box-outline"
                        size={18}
                        color="#FFFFFF"
                      />
                      <Text style={styles.contextActionText}>移动</Text>
                    </Pressable>
                    <Pressable
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
                      disabled={isActionLoading}
                      style={({ pressed }) => [
                        styles.contextActionButton,
                        styles.contextDeleteButton,
                        pressed && styles.pressed,
                        isActionLoading && styles.disabledAction,
                      ]}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={18} color="#FFFFFF" />
                      <Text style={styles.contextActionText}>删除</Text>
                    </Pressable>
                  </View>
                ) : null
              }
              footerStyle={selectionMode ? styles.contextFooter : undefined}
            >
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
                    browseTapBehavior="select-or-open-on-double"
                    variant="photo-manager"
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
            </SheetPanel>
          </View>
        </GestureHandlerRootView>
      </Modal>

      <PhotoLibraryPickerModal
        visible={pickerVisible}
        title="添加照片到当前事件"
        hint={`导入到“${event?.title || '未命名事件'}”`}
        confirmLabel="导入到当前事件"
        confirmLoading={pickerSubmitting}
        permissionContext="event-add-photo"
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

          <SheetPanel
            title="移动目标选择"
            subtitle={`已选 ${selectedPhotoIds.length} 张`}
            style={styles.moveSheet}
          >
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
          </SheetPanel>
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
    backgroundColor: 'rgba(2, 6, 23, 0.4)',
  },
  sheet: {
    position: 'relative',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    backgroundColor: JourneyPalette.background,
    paddingTop: 0,
    paddingBottom: 0,
  },
  sheetHandle: {
    position: 'absolute',
    top: 12,
    left: '50%',
    marginLeft: -22,
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: JourneyPalette.lineStrong,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  sheetHeaderCopy: {
    flex: 1,
    gap: 6,
  },
  sheetHeaderAction: {
    justifyContent: 'center',
  },
  sheetTitle: {
    color: JourneyPalette.ink,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  sheetSubtitle: {
    color: JourneyPalette.inkSoft,
    fontSize: 14,
    lineHeight: 21,
  },
  sheetHeaderBottom: {
    flexShrink: 0,
  },
  sheetBody: {
    flex: 1,
    minHeight: 0,
  },
  sheetFooter: {
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  modalSheet: {
    height: '88%',
  },
  modalBody: {
    flex: 1,
    minHeight: 0,
  },
  moveSheet: {
    height: '78%',
  },
  addPhotoButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    backgroundColor: JourneyPalette.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeBar: {
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  modeBarText: {
    color: JourneyPalette.muted,
    fontSize: 13,
    fontWeight: '700',
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
    minHeight: 0,
  },
  contextFooter: {
    marginTop: 0,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    backgroundColor: '#020617',
    paddingTop: 24,
    paddingHorizontal: 24,
    paddingBottom: 44,
  },
  contextActions: {
    flexDirection: 'row',
    gap: 12,
  },
  contextActionButton: {
    flex: 1,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  contextDeleteButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.22)',
  },
  contextActionText: {
    color: JourneyPalette.white,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  moveContent: {
    gap: 16,
    paddingBottom: 8,
  },
  moveCard: {
    gap: 12,
    backgroundColor: JourneyPalette.surfaceVariant,
  },
  targetEventList: {
    gap: 10,
  },
  targetEventItem: {
    borderRadius: 20,
    backgroundColor: JourneyPalette.background,
    paddingHorizontal: 16,
    paddingVertical: 14,
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
    minHeight: 56,
    borderRadius: 20,
    backgroundColor: JourneyPalette.background,
    paddingHorizontal: 18,
    color: JourneyPalette.ink,
    fontSize: 16,
  },
  mutedText: {
    color: JourneyPalette.inkSoft,
  },
  disabledAction: {
    opacity: 0.45,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.7,
  },
});
