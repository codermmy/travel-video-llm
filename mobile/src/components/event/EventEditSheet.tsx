import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { PhotoGrid } from '@/components/photo/PhotoGrid';
import { eventApi } from '@/services/api/eventApi';
import {
  clearEventCoverOverride,
  saveEventCoverOverride,
} from '@/services/media/localMediaRegistry';
import { JourneyPalette } from '@/styles/colors';
import type { EventDetail, EventRecord } from '@/types/event';
import { getPreferredPhotoThumbnailUri, resolveCoverCandidateFromPhotos } from '@/utils/mediaRefs';

type EventEditSheetProps = {
  visible: boolean;
  event:
    | Pick<EventRecord, 'id' | 'title' | 'locationName'>
    | Pick<EventDetail, 'id' | 'title' | 'locationName'>
    | null;
  onClose: () => void;
  onSaved: (message?: string) => void;
  onDeleted: () => void;
  onChanged?: (message?: string) => void;
};

export function EventEditSheet({
  visible,
  event,
  onClose,
  onSaved,
  onDeleted,
  onChanged,
}: EventEditSheetProps) {
  const [editTitle, setEditTitle] = useState('');
  const [editLocationName, setEditLocationName] = useState('');
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [coverPickerVisible, setCoverPickerVisible] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUpdatingCover, setIsUpdatingCover] = useState(false);

  useEffect(() => {
    if (!event || !visible) {
      return;
    }
    setEditTitle(event.title ?? '');
    setEditLocationName(event.locationName ?? '');
  }, [event, visible]);

  useEffect(() => {
    if (!visible || !event) {
      setDetail(null);
      setCoverPickerVisible(false);
      return;
    }

    void (async () => {
      try {
        setLoadingDetail(true);
        const next = await eventApi.getEventDetail(event.id);
        setDetail(next);
      } finally {
        setLoadingDetail(false);
      }
    })();
  }, [event, visible]);

  const automaticCover = useMemo(
    () =>
      detail
        ? resolveCoverCandidateFromPhotos(detail.photos, [
            detail.coverPhotoId,
            detail.selectedCoverPhotoId,
          ])
        : { photoId: null, uri: null },
    [detail],
  );
  const currentCoverUri =
    detail?.localCoverUri ?? automaticCover.uri ?? detail?.coverPhotoUrl ?? null;
  const isCustomCover = Boolean(
    detail?.selectedCoverPhotoId &&
    automaticCover.photoId &&
    detail.selectedCoverPhotoId !== automaticCover.photoId,
  );

  const handleClose = useCallback(() => {
    if (isSaving || isUpdatingCover) {
      return;
    }
    onClose();
  }, [isSaving, isUpdatingCover, onClose]);

  const handleSelectCoverPhoto = useCallback(
    async (photo: EventDetail['photos'][number]) => {
      if (!detail) {
        return;
      }

      const nextCoverUri = getPreferredPhotoThumbnailUri(photo);
      try {
        setIsUpdatingCover(true);
        await saveEventCoverOverride({
          eventId: detail.id,
          photoId: photo.id,
          localCoverUri: nextCoverUri,
        });
        setDetail((previous) =>
          previous
            ? {
                ...previous,
                localCoverUri: nextCoverUri,
                selectedCoverPhotoId: photo.id,
              }
            : previous,
        );
        setCoverPickerVisible(false);
        onChanged?.('封面已更新');
      } catch (error) {
        Alert.alert('封面更新失败', error instanceof Error ? error.message : '请稍后再试');
      } finally {
        setIsUpdatingCover(false);
      }
    },
    [detail, onChanged],
  );

  const handleResetCover = useCallback(async () => {
    if (!detail) {
      return;
    }

    try {
      setIsUpdatingCover(true);
      await clearEventCoverOverride(detail.id);
      setDetail((previous) =>
        previous
          ? {
              ...previous,
              localCoverUri: automaticCover.uri,
              selectedCoverPhotoId: automaticCover.photoId,
            }
          : previous,
      );
      onChanged?.('封面已恢复默认');
    } catch (error) {
      Alert.alert('恢复默认失败', error instanceof Error ? error.message : '请稍后再试');
    } finally {
      setIsUpdatingCover(false);
    }
  }, [automaticCover.photoId, automaticCover.uri, detail, onChanged]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} disabled={isSaving} />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>编辑事件</Text>
            <Pressable
              onPress={handleClose}
              disabled={isSaving || isUpdatingCover}
              style={({ pressed }) => [
                styles.modalCloseBtn,
                pressed && styles.pressed,
                (isSaving || isUpdatingCover) && styles.disabledAction,
              ]}
            >
              <MaterialCommunityIcons name="close" size={18} color={JourneyPalette.inkSoft} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.coverCard}>
              <Text style={styles.fieldLabel}>封面</Text>
              <View style={styles.coverRow}>
                <View style={styles.coverPreview}>
                  {currentCoverUri ? (
                    <Image source={{ uri: currentCoverUri }} style={styles.coverImage} />
                  ) : (
                    <View style={styles.coverFallback}>
                      <MaterialCommunityIcons
                        name="image-outline"
                        size={28}
                        color={JourneyPalette.muted}
                      />
                    </View>
                  )}
                </View>
                <View style={styles.coverActions}>
                  <Pressable
                    onPress={() => setCoverPickerVisible((previous) => !previous)}
                    disabled={loadingDetail || isUpdatingCover}
                    style={({ pressed }) => [
                      styles.coverActionButton,
                      pressed && styles.pressed,
                      (loadingDetail || isUpdatingCover) && styles.disabledAction,
                    ]}
                  >
                    <Text style={styles.coverActionText}>更换封面</Text>
                  </Pressable>
                  {isCustomCover ? (
                    <Pressable
                      onPress={() => {
                        void handleResetCover();
                      }}
                      disabled={isUpdatingCover}
                      style={({ pressed }) => [
                        styles.coverActionButton,
                        styles.coverActionButtonSecondary,
                        pressed && styles.pressed,
                        isUpdatingCover && styles.disabledAction,
                      ]}
                    >
                      <Text style={styles.coverActionText}>恢复默认</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            </View>

            {coverPickerVisible ? (
              loadingDetail ? (
                <View style={styles.loadingCoverState}>
                  <ActivityIndicator color={JourneyPalette.accent} />
                </View>
              ) : (
                <PhotoGrid
                  photos={detail?.photos ?? []}
                  onPhotoPress={(photo) => {
                    void handleSelectCoverPhoto(photo);
                  }}
                  emptyText="这个事件还没有可用封面"
                  selectedPhotoId={detail?.selectedCoverPhotoId ?? automaticCover.photoId}
                />
              )
            ) : null}

            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>事件标题</Text>
              <TextInput
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="给这段回忆起个名字"
                placeholderTextColor={JourneyPalette.muted}
                style={styles.fieldInput}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>地点</Text>
              <TextInput
                value={editLocationName}
                onChangeText={setEditLocationName}
                placeholder="例如：杭州西湖"
                placeholderTextColor={JourneyPalette.muted}
                style={styles.fieldInput}
              />
            </View>
          </ScrollView>

          <View style={styles.modalActions}>
            <Pressable
              onPress={() => {
                if (!event) {
                  return;
                }
                Alert.alert(
                  '删除事件',
                  '删除后，本事件照片会回到“无事件”状态，现有故事也会移除。',
                  [
                    { text: '取消', style: 'cancel' },
                    {
                      text: '删除',
                      style: 'destructive',
                      onPress: () => {
                        void (async () => {
                          try {
                            await eventApi.deleteEvent(event.id);
                            onDeleted();
                          } catch (error) {
                            Alert.alert(
                              '删除失败',
                              error instanceof Error ? error.message : '请稍后再试',
                            );
                          }
                        })();
                      },
                    },
                  ],
                );
              }}
              style={({ pressed }) => [styles.modalDangerBtn, pressed && styles.pressed]}
            >
              <Text style={styles.modalDangerBtnText}>删除事件</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (!event) {
                  return;
                }
                void (async () => {
                  try {
                    setIsSaving(true);
                    await eventApi.updateEvent(event.id, {
                      title: editTitle.trim(),
                      locationName: editLocationName.trim(),
                    });
                    onSaved('事件信息已更新');
                  } catch (error) {
                    Alert.alert('保存失败', error instanceof Error ? error.message : '请稍后再试');
                  } finally {
                    setIsSaving(false);
                  }
                })();
              }}
              style={({ pressed }) => [
                styles.modalPrimaryBtn,
                pressed && styles.pressed,
                isSaving && styles.disabledAction,
              ]}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="#FFF9F2" />
              ) : (
                <Text style={styles.modalPrimaryBtnText}>保存</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(21, 32, 31, 0.42)',
  },
  modalSheet: {
    maxHeight: '88%',
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
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.cardAlt,
  },
  content: {
    paddingTop: 16,
    paddingBottom: 8,
    gap: 16,
  },
  coverCard: {
    gap: 12,
  },
  coverRow: {
    gap: 12,
  },
  coverPreview: {
    width: '100%',
    height: 188,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: JourneyPalette.cardAlt,
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverActions: {
    flexDirection: 'row',
    gap: 10,
  },
  coverActionButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.cardAlt,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverActionButtonSecondary: {
    backgroundColor: JourneyPalette.card,
  },
  coverActionText: {
    color: JourneyPalette.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  loadingCoverState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  formGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: JourneyPalette.ink,
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
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  modalPrimaryBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: JourneyPalette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrimaryBtnText: {
    color: '#FFF9F2',
    fontWeight: '800',
  },
  modalDangerBtn: {
    minHeight: 48,
    borderRadius: 999,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.dangerSoft,
    borderWidth: 1,
    borderColor: JourneyPalette.dangerBorder,
  },
  modalDangerBtnText: {
    color: JourneyPalette.danger,
    fontWeight: '800',
  },
  disabledAction: {
    opacity: 0.55,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
});
