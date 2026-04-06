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
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SelectableMediaGrid } from '@/components/photo/SelectableMediaGrid';
import { ActionButton, SectionLabel, SurfaceCard } from '@/components/ui/revamp';
import { eventApi } from '@/services/api/eventApi';
import { photoApi } from '@/services/api/photoApi';
import { usePhotoViewerStore } from '@/stores/photoViewerStore';
import { JourneyPalette } from '@/styles/colors';
import type { EventDetail, EventRecord } from '@/types/event';
import { getPreferredPhotoThumbnailUri } from '@/utils/mediaRefs';

type EventPhotoManagerScreenProps = {
  eventId: string | null;
  onClose: () => void;
  onChanged: (params: { deletedCurrentEvent: boolean }) => void;
};

type EventPhotoManagerSheetProps = EventPhotoManagerScreenProps & {
  visible: boolean;
  entryMode?: 'browse' | 'move-target';
};

export function EventPhotoManagerScreen({
  eventId,
  onClose,
  onChanged,
}: EventPhotoManagerScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const setPhotoViewerSession = usePhotoViewerStore((state) => state.setSession);
  const [loading, setLoading] = useState(false);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [availableEvents, setAvailableEvents] = useState<EventRecord[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [movePickerVisible, setMovePickerVisible] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventLocation, setNewEventLocation] = useState('');
  const selectionMode = selectedPhotoIds.length > 0;

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
    setSelectedPhotoIds([]);
    setMovePickerVisible(false);
    setNewEventTitle('');
    setNewEventLocation('');
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData]),
  );

  const selectableItems = useMemo(
    () =>
      (event?.photos ?? []).map((photo) => ({
        id: photo.id,
        key: photo.id,
        uri: getPreferredPhotoThumbnailUri(photo),
      })),
    [event],
  );

  const handleBatchResult = useCallback(
    async (deletedEventIds: string[]) => {
      if (eventId && deletedEventIds.includes(eventId)) {
        setMovePickerVisible(false);
        onChanged({ deletedCurrentEvent: true });
        return;
      }

      setSelectedPhotoIds([]);
      setMovePickerVisible(false);
      onChanged({ deletedCurrentEvent: false });
    },
    [eventId, onChanged],
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

  return (
    <View style={styles.screen}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="关闭"
        onPress={onClose}
        style={({ pressed }) => [
          styles.dismissButton,
          { top: Math.max(insets.top + 12, 18) },
          pressed && styles.pressed,
        ]}
      >
        <MaterialCommunityIcons name="arrow-left" size={20} color={JourneyPalette.ink} />
      </Pressable>

      <View style={[styles.header, { paddingTop: Math.max(insets.top + 16, 60) }]}>
        <Text style={styles.headerTitle}>照片管理</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="添加照片"
          onPress={() => {
            if (!eventId || isActionLoading) {
              return;
            }
            router.push({
              pathname: '/events/[eventId]/photos/import',
              params: { eventId },
            });
          }}
          disabled={!eventId || isActionLoading}
          style={({ pressed }) => [
            styles.addPhotoButton,
            pressed && styles.pressed,
            (!eventId || isActionLoading) && styles.disabledAction,
          ]}
        >
          <MaterialCommunityIcons name="plus" size={22} color={JourneyPalette.accent} />
        </Pressable>
      </View>

      {selectionMode ? (
        <View style={styles.modeBar}>
          <Text style={styles.modeBarText}>{`已选择 ${selectedPhotoIds.length} 张照片`}</Text>
        </View>
      ) : null}

      <View style={styles.gridArea}>
        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={JourneyPalette.accent} />
            <Text style={styles.loadingText}>正在加载事件照片...</Text>
          </View>
        ) : (
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
        )}
      </View>

      {selectionMode ? (
        <View
          style={[
            styles.contextFooter,
            {
              paddingBottom: Math.max(insets.bottom + 20, 44),
            },
          ]}
        >
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
                color={JourneyPalette.white}
              />
              <Text style={styles.contextActionText}>移动</Text>
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
                styles.contextActionButton,
                styles.contextDeleteButton,
                pressed && styles.pressed,
                isActionLoading && styles.disabledAction,
              ]}
            >
              <MaterialCommunityIcons
                name="trash-can-outline"
                size={18}
                color={JourneyPalette.white}
              />
              <Text style={styles.contextActionText}>删除</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

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
            <View style={styles.moveHandle} />
            <View style={styles.moveHeader}>
              <Text style={styles.moveTitle}>移动目标选择</Text>
              <Text style={styles.moveSubtitle}>{`已选 ${selectedPhotoIds.length} 张`}</Text>
            </View>

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
          </View>
        </View>
      </Modal>
    </View>
  );
}

export function EventPhotoManagerSheet({
  visible,
  eventId,
  onClose,
  onChanged,
}: EventPhotoManagerSheetProps) {
  if (!visible) {
    return null;
  }

  return <EventPhotoManagerScreen eventId={eventId} onClose={onClose} onChanged={onChanged} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: JourneyPalette.background,
  },
  dismissButton: {
    position: 'absolute',
    left: 16,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: JourneyPalette.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
  },
  headerTitle: {
    color: JourneyPalette.ink,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  addPhotoButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: JourneyPalette.surfaceVariant,
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
  gridArea: {
    flex: 1,
    minHeight: 0,
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: JourneyPalette.inkSoft,
  },
  contextFooter: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    backgroundColor: JourneyPalette.ink,
    paddingTop: 24,
    paddingHorizontal: 24,
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
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(2, 6, 23, 0.4)',
  },
  moveSheet: {
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    backgroundColor: JourneyPalette.background,
    paddingTop: 20,
    paddingHorizontal: 24,
    paddingBottom: 40,
    maxHeight: '78%',
  },
  moveHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: JourneyPalette.lineStrong,
    marginBottom: 18,
  },
  moveHeader: {
    marginBottom: 16,
  },
  moveTitle: {
    color: JourneyPalette.ink,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  moveSubtitle: {
    marginTop: 6,
    color: JourneyPalette.inkSoft,
    fontSize: 14,
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
