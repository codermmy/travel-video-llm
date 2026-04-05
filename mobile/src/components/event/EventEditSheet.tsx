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
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleClose}
          disabled={isSaving || isUpdatingCover}
        />

        <View style={styles.sheet}>
          <View style={styles.handle} />

          <ScrollView contentContainerStyle={styles.content}>
            <View style={styles.block}>
              <Text style={styles.blockLabel}>封面</Text>

              <View style={styles.coverPreview}>
                {currentCoverUri ? (
                  <Image
                    source={{ uri: currentCoverUri }}
                    style={styles.coverImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.coverFallback}>
                    <MaterialCommunityIcons
                      name="image-outline"
                      size={30}
                      color={JourneyPalette.muted}
                    />
                  </View>
                )}
              </View>

              <View style={styles.inlineActions}>
                <Pressable
                  onPress={() => setCoverPickerVisible((previous) => !previous)}
                  disabled={loadingDetail || isUpdatingCover}
                  style={({ pressed }) => [
                    styles.inlineAction,
                    pressed && styles.pressed,
                    (loadingDetail || isUpdatingCover) && styles.disabledAction,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="image-edit-outline"
                    size={18}
                    color={JourneyPalette.ink}
                  />
                  <Text style={styles.inlineActionText}>更换封面</Text>
                </Pressable>

                {isCustomCover ? (
                  <Pressable
                    onPress={() => {
                      void handleResetCover();
                    }}
                    disabled={isUpdatingCover}
                    style={({ pressed }) => [
                      styles.inlineAction,
                      pressed && styles.pressed,
                      isUpdatingCover && styles.disabledAction,
                    ]}
                  >
                    <MaterialCommunityIcons name="restore" size={18} color={JourneyPalette.ink} />
                    <Text style={styles.inlineActionText}>恢复默认</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            {coverPickerVisible ? (
              loadingDetail ? (
                <View style={styles.loadingState}>
                  <ActivityIndicator color={JourneyPalette.accent} />
                </View>
              ) : (
                <View style={styles.block}>
                  <PhotoGrid
                    photos={detail?.photos ?? []}
                    onPhotoPress={(photo) => {
                      void handleSelectCoverPhoto(photo);
                    }}
                    emptyText="这个事件还没有可用封面"
                    selectedPhotoId={detail?.selectedCoverPhotoId ?? automaticCover.photoId}
                  />
                </View>
              )
            ) : null}

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>事件标题</Text>
              <TextInput
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="给这段回忆起个名字"
                placeholderTextColor={JourneyPalette.muted}
                style={styles.fieldInput}
              />
            </View>

            <View style={styles.fieldGroup}>
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

          <View style={styles.footer}>
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
              style={({ pressed }) => [styles.dangerButton, pressed && styles.pressed]}
            >
              <Text style={styles.dangerButtonText}>删除事件</Text>
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
                styles.primaryButton,
                pressed && styles.pressed,
                isSaving && styles.disabledAction,
              ]}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color={JourneyPalette.white} />
              ) : (
                <Text style={styles.primaryButtonText}>保存</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(2, 6, 23, 0.4)',
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    backgroundColor: JourneyPalette.background,
    paddingTop: 32,
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  handle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: JourneyPalette.lineStrong,
    marginBottom: 24,
  },
  content: {
    gap: 24,
    paddingBottom: 16,
  },
  block: {
    gap: 16,
  },
  blockLabel: {
    color: JourneyPalette.ink,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  coverPreview: {
    width: '100%',
    height: 188,
    borderRadius: 24,
    overflow: 'hidden',
    backgroundColor: JourneyPalette.surfaceVariant,
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
  inlineActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  inlineAction: {
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: JourneyPalette.surfaceVariant,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  inlineActionText: {
    color: JourneyPalette.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  fieldGroup: {
    gap: 10,
  },
  fieldLabel: {
    color: JourneyPalette.ink,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  fieldInput: {
    minHeight: 56,
    borderRadius: 20,
    backgroundColor: JourneyPalette.surfaceVariant,
    paddingHorizontal: 18,
    color: JourneyPalette.ink,
    fontSize: 16,
  },
  footer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  dangerButton: {
    minHeight: 56,
    borderRadius: 999,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.dangerSoft,
  },
  dangerButtonText: {
    color: JourneyPalette.danger,
    fontWeight: '800',
  },
  primaryButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.accent,
  },
  primaryButtonText: {
    color: JourneyPalette.white,
    fontWeight: '800',
    fontSize: 16,
  },
  disabledAction: {
    opacity: 0.45,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.7,
  },
});
