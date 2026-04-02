import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { PhotoGrid } from '@/components/photo/PhotoGrid';
import {
  cleanupPreparedEnhancementUploads,
  getEnhancementEligiblePhotos,
  getRecommendedEnhancementPhotoIds,
  prepareEnhancementUploads,
} from '@/services/album/eventEnhancementService';
import { eventApi } from '@/services/api/eventApi';
import { photoApi } from '@/services/api/photoApi';
import {
  clearEventCoverOverride,
  saveEventCoverOverride,
} from '@/services/media/localMediaRegistry';
import { taskApi } from '@/services/api/taskApi';
import { usePhotoViewerStore } from '@/stores/photoViewerStore';
import { useSlideshowStore } from '@/stores/slideshowStore';
import { JourneyPalette } from '@/styles/colors';
import type { EventDetail, EventRecord } from '@/types/event';
import { formatDateRange } from '@/utils/dateUtils';
import { getEventDetailStatusMeta } from '@/utils/eventStatus';
import { formatFileSize } from '@/utils/imageUtils';
import { getPreferredPhotoThumbnailUri, resolveCoverCandidateFromPhotos } from '@/utils/mediaRefs';

function getFallbackDateRange(event: EventDetail): string {
  if (!event.startTime && !event.endTime) {
    return '时间待补充';
  }

  const start = event.startTime || event.endTime || '';
  const end = event.endTime || event.startTime || '';

  try {
    return formatDateRange(start, end);
  } catch {
    return `${start || '-'} - ${end || '-'}`;
  }
}

function resolveLocation(event: EventDetail): string {
  if (event.detailedLocation?.trim()) {
    return event.detailedLocation;
  }
  if (event.locationName?.trim()) {
    return event.locationName;
  }
  if (typeof event.gpsLat === 'number' && typeof event.gpsLon === 'number') {
    return `${event.gpsLat.toFixed(4)}, ${event.gpsLon.toFixed(4)}`;
  }
  return '地点待补充';
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return '暂无';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '暂无';
  }
  return `${date.toLocaleDateString('zh-CN')} ${date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

export default function EventDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ eventId: string }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [coverFailed, setCoverFailed] = useState(false);
  const [isCoverPickerVisible, setIsCoverPickerVisible] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isEnhancementPickerVisible, setIsEnhancementPickerVisible] = useState(false);
  const [selectedEnhancementIds, setSelectedEnhancementIds] = useState<string[]>([]);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editLocationName, setEditLocationName] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isPhotoManagerVisible, setIsPhotoManagerVisible] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [availableEvents, setAvailableEvents] = useState<EventRecord[]>([]);
  const [isPhotoActionLoading, setIsPhotoActionLoading] = useState(false);
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventLocation, setNewEventLocation] = useState('');

  const setPhotoViewerSession = usePhotoViewerStore((state) => state.setSession);
  const setSlideshowSession = useSlideshowStore((state) => state.setSession);

  const loadDetail = useCallback(async () => {
    if (!eventId) {
      setError('缺少事件 ID');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await eventApi.getEventDetail(eventId);
      setEvent(data);
      setCoverFailed(false);
    } catch (loadError) {
      console.error('[event-detail] failed to load detail', loadError);
      setError(loadError instanceof Error ? loadError.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const onPhotoPress = useCallback(
    (_: EventDetail['photos'][number], index: number) => {
      if (!event || event.photos.length === 0) {
        return;
      }
      setPhotoViewerSession(event.photos, index);
      router.push('/photo-viewer');
    },
    [event, router, setPhotoViewerSession],
  );

  const onPlaySlideshow = useCallback(() => {
    if (!event || event.photos.length === 0) {
      Alert.alert('暂无照片', '该事件目前没有可播放的照片。');
      return;
    }

    setSlideshowSession(
      {
        id: event.id,
        title: event.title,
        musicUrl: event.musicUrl ?? null,
        storyText: event.storyText ?? null,
        fullStory: event.fullStory ?? null,
        chapters: event.chapters,
        photoGroups: event.photoGroups,
      },
      event.photos,
    );

    router.push('/slideshow');
  }, [event, router, setSlideshowSession]);

  const pollTaskUntilSettled = useCallback(async (taskId?: string | null) => {
    if (!taskId) {
      return;
    }

    const start = Date.now();
    while (Date.now() - start < 60_000) {
      const task = await taskApi.getTaskStatus(taskId);
      if (task.status === 'success' || task.status === 'failure') {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }, []);

  const retryAiStory = useCallback(async () => {
    if (!event) {
      return;
    }

    try {
      setIsRegenerating(true);
      const result = await eventApi.regenerateStory(event.id);
      await pollTaskUntilSettled(result.taskId);
      await loadDetail();
      Alert.alert('已提交', '故事生成任务已刷新。');
    } catch (retryError) {
      Alert.alert('重试失败', retryError instanceof Error ? retryError.message : '请稍后再试');
    } finally {
      setIsRegenerating(false);
    }
  }, [event, loadDetail, pollTaskUntilSettled]);

  const dateRangeText = useMemo(() => {
    if (!event) {
      return '';
    }
    return getFallbackDateRange(event);
  }, [event]);

  const fullStory = event?.fullStory || event?.storyText || null;
  const automaticCover = useMemo(() => {
    if (!event) {
      return { photoId: null, uri: null };
    }
    return resolveCoverCandidateFromPhotos(event.photos, [event.coverPhotoId]);
  }, [event]);
  const coverUri = event?.localCoverUri ?? automaticCover.uri ?? event?.coverPhotoUrl ?? null;
  const enhancementEligiblePhotos = useMemo(
    () => (event ? getEnhancementEligiblePhotos(event.photos) : []),
    [event],
  );
  const enhancementSelectedPhotos = useMemo(() => {
    if (!event) {
      return [];
    }
    const selectedIdSet = new Set(selectedEnhancementIds);
    return event.photos.filter((photo) => selectedIdSet.has(photo.id));
  }, [event, selectedEnhancementIds]);
  const selectedManagedPhotos = useMemo(() => {
    if (!event) {
      return [];
    }
    const selectedIdSet = new Set(selectedPhotoIds);
    return event.photos.filter((photo) => selectedIdSet.has(photo.id));
  }, [event, selectedPhotoIds]);
  const enhancementSummary = event?.enhancement ?? {
    status: 'none' as const,
    assetCount: 0,
    totalBytes: 0,
    canRetry: false,
    lastUploadedAt: null,
    retainedUntil: null,
  };

  const openEnhancementPicker = useCallback(() => {
    if (!event) {
      return;
    }
    const recommended = getRecommendedEnhancementPhotoIds(event.photos);
    setSelectedEnhancementIds(recommended);
    setIsEnhancementPickerVisible(true);
  }, [event]);

  const openEditModal = useCallback(() => {
    if (!event) {
      return;
    }
    setEditTitle(event.title ?? '');
    setEditLocationName(event.locationName ?? '');
    setIsEditModalVisible(true);
  }, [event]);

  const openPhotoManager = useCallback(async () => {
    if (!event) {
      return;
    }
    setSelectedPhotoIds([]);
    setNewEventTitle('');
    setNewEventLocation('');
    setIsPhotoManagerVisible(true);
    try {
      const allEvents = await eventApi.listAllEvents();
      setAvailableEvents(allEvents.filter((item) => item.id !== event.id));
    } catch (loadError) {
      console.warn('[event-detail] failed to load available events', loadError);
      setAvailableEvents([]);
    }
  }, [event]);

  const toggleManagedPhoto = useCallback((photoId: string) => {
    setSelectedPhotoIds((previous) =>
      previous.includes(photoId) ? previous.filter((id) => id !== photoId) : [...previous, photoId],
    );
  }, []);

  const saveEventBasics = useCallback(async () => {
    if (!event) {
      return;
    }

    try {
      setIsSavingEdit(true);
      await eventApi.updateEvent(event.id, {
        title: editTitle.trim(),
        locationName: editLocationName.trim(),
      });
      setIsEditModalVisible(false);
      await loadDetail();
      Alert.alert('已保存', '事件基础信息已更新。');
    } catch (saveError) {
      Alert.alert('保存失败', saveError instanceof Error ? saveError.message : '请稍后再试');
    } finally {
      setIsSavingEdit(false);
    }
  }, [editLocationName, editTitle, event, loadDetail]);

  const deleteCurrentEvent = useCallback(() => {
    if (!event) {
      return;
    }

    Alert.alert('删除事件', '删除后，本事件照片会回到“无事件”状态，现有故事也会移除。', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await eventApi.deleteEvent(event.id);
              router.back();
            } catch (deleteError) {
              Alert.alert(
                '删除失败',
                deleteError instanceof Error ? deleteError.message : '请稍后再试',
              );
            }
          })();
        },
      },
    ]);
  }, [event, router]);

  const applyPhotoSelection = useCallback(
    async (mode: 'remove' | 'move' | 'create', targetEventId?: string) => {
      if (!event || selectedPhotoIds.length === 0) {
        Alert.alert('未选择照片', '请先选择至少一张照片。');
        return;
      }

      try {
        setIsPhotoActionLoading(true);
        if (mode === 'remove') {
          await photoApi.reassignPhotosToEvent(selectedPhotoIds, null);
        } else if (mode === 'move') {
          if (!targetEventId) {
            Alert.alert('缺少目标事件', '请选择一个目标事件。');
            return;
          }
          await photoApi.reassignPhotosToEvent(selectedPhotoIds, targetEventId);
        } else {
          await eventApi.createEvent({
            title: newEventTitle.trim() || undefined,
            locationName: newEventLocation.trim() || undefined,
            photoIds: selectedPhotoIds,
          });
        }

        setIsPhotoManagerVisible(false);
        setSelectedPhotoIds([]);
        setNewEventTitle('');
        setNewEventLocation('');
        await loadDetail();
      } catch (photoActionError) {
        Alert.alert(
          '操作失败',
          photoActionError instanceof Error ? photoActionError.message : '请稍后再试',
        );
      } finally {
        setIsPhotoActionLoading(false);
      }
    },
    [event, loadDetail, newEventLocation, newEventTitle, selectedPhotoIds],
  );

  const toggleEnhancementPhoto = useCallback((photoId: string) => {
    setSelectedEnhancementIds((previous) => {
      if (previous.includes(photoId)) {
        return previous.filter((id) => id !== photoId);
      }
      if (previous.length >= 5) {
        return previous;
      }
      return [...previous, photoId];
    });
  }, []);

  const submitEnhancement = useCallback(async () => {
    if (!event) {
      return;
    }
    if (enhancementSelectedPhotos.length < 3 || enhancementSelectedPhotos.length > 5) {
      Alert.alert('选择数量不符合要求', '请勾选 3-5 张代表图后再继续。');
      return;
    }

    let preparedUploads: Awaited<ReturnType<typeof prepareEnhancementUploads>> = [];
    try {
      setIsEnhancing(true);
      preparedUploads = await prepareEnhancementUploads(enhancementSelectedPhotos);
      const result = await eventApi.enhanceStory(event.id, { uploads: preparedUploads });
      await pollTaskUntilSettled(result.taskId);
      await loadDetail();
      setIsEnhancementPickerVisible(false);
      Alert.alert('增强完成', '已使用代表图重新生成更强故事。');
    } catch (enhanceError) {
      Alert.alert('增强失败', enhanceError instanceof Error ? enhanceError.message : '请稍后再试');
    } finally {
      await cleanupPreparedEnhancementUploads(preparedUploads);
      setIsEnhancing(false);
    }
  }, [enhancementSelectedPhotos, event, loadDetail, pollTaskUntilSettled]);

  const retryEnhancement = useCallback(async () => {
    if (!event) {
      return;
    }

    try {
      setIsEnhancing(true);
      const result = await eventApi.enhanceStory(event.id, { reuseExisting: true });
      await pollTaskUntilSettled(result.taskId);
      await loadDetail();
      Alert.alert('已提交', '已复用 7 天内的增强素材重新生成故事。');
    } catch (retryError) {
      Alert.alert('增强重试失败', retryError instanceof Error ? retryError.message : '请稍后再试');
    } finally {
      setIsEnhancing(false);
    }
  }, [event, loadDetail, pollTaskUntilSettled]);

  const onSelectCoverPhoto = useCallback(
    async (photo: EventDetail['photos'][number]) => {
      if (!event) {
        return;
      }

      const nextCoverUri = getPreferredPhotoThumbnailUri(photo);
      try {
        await saveEventCoverOverride({
          eventId: event.id,
          photoId: photo.id,
          localCoverUri: nextCoverUri,
        });
        setEvent((previous) =>
          previous
            ? {
                ...previous,
                localCoverUri: nextCoverUri,
                selectedCoverPhotoId: photo.id,
              }
            : previous,
        );
        setCoverFailed(false);
        setIsCoverPickerVisible(false);
      } catch (coverError) {
        Alert.alert(
          '封面更新失败',
          coverError instanceof Error ? coverError.message : '请稍后再试',
        );
      }
    },
    [event],
  );

  const onResetCover = useCallback(async () => {
    if (!event) {
      return;
    }

    try {
      await clearEventCoverOverride(event.id);
      setEvent((previous) =>
        previous
          ? {
              ...previous,
              localCoverUri: automaticCover.uri,
              selectedCoverPhotoId: automaticCover.photoId,
            }
          : previous,
      );
      setCoverFailed(false);
      setIsCoverPickerVisible(false);
    } catch (coverError) {
      Alert.alert('恢复默认失败', coverError instanceof Error ? coverError.message : '请稍后再试');
    }
  }, [automaticCover.photoId, automaticCover.uri, event]);

  if (loading) {
    return (
      <SafeAreaView style={styles.centerScreen}>
        <StatusBar barStyle="dark-content" />
        <LinearGradient colors={['#F8F1E7', '#ECF0E8']} style={styles.loadingOrb}>
          <MaterialCommunityIcons name="image-filter-hdr" size={28} color={JourneyPalette.accent} />
        </LinearGradient>
        <ActivityIndicator size="large" color={JourneyPalette.accent} />
        <Text style={styles.centerText}>正在加载事件详情...</Text>
      </SafeAreaView>
    );
  }

  if (!event || error) {
    return (
      <SafeAreaView style={styles.centerScreen}>
        <StatusBar barStyle="dark-content" />
        <LinearGradient colors={['#FAECE9', '#F8F1E8']} style={styles.loadingOrb}>
          <MaterialCommunityIcons
            name="cloud-alert-outline"
            size={30}
            color={JourneyPalette.danger}
          />
        </LinearGradient>
        <Text style={styles.errorText}>{error || '未找到事件'}</Text>
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
          onPress={loadDetail}
        >
          <Text style={styles.primaryBtnText}>重试</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.ghostBtn, pressed && styles.pressed]}
          onPress={() => router.back()}
        >
          <Text style={styles.ghostBtnText}>返回</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const statusMeta = getEventDetailStatusMeta(event.status);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          {coverUri && !coverFailed ? (
            <Image
              source={{ uri: coverUri }}
              style={styles.heroImage}
              resizeMode="cover"
              onError={() => setCoverFailed(true)}
            />
          ) : (
            <LinearGradient colors={['#DADFD4', '#E7DCCD']} style={styles.heroFallback}>
              <MaterialCommunityIcons
                name="image-filter-hdr"
                size={40}
                color={JourneyPalette.accent}
              />
              <Text style={styles.heroFallbackText}>暂无封面图片</Text>
            </LinearGradient>
          )}

          <LinearGradient
            colors={['rgba(21,32,31,0.1)', 'rgba(21,32,31,0.38)', 'rgba(21,32,31,0.76)']}
            style={styles.heroShade}
          />

          <View style={styles.heroTopBar}>
            <Pressable style={styles.topBarButton} onPress={() => router.back()}>
              <MaterialCommunityIcons name="arrow-left" size={18} color="#FFF9F2" />
            </Pressable>
            <Pressable
              style={styles.topBarPill}
              onPress={() => setIsCoverPickerVisible(true)}
              disabled={event.photos.length === 0}
            >
              <MaterialCommunityIcons name="image-edit-outline" size={15} color="#FFF9F2" />
              <Text style={styles.topBarPillText}>更换封面</Text>
            </Pressable>
          </View>

          <View style={styles.heroMeta}>
            <Text style={styles.heroEyebrow}>TRAVEL STORY</Text>
            <Text style={styles.heroTitle}>{event.title || '未命名事件'}</Text>
            <View style={styles.heroChipRow}>
              <View style={styles.heroChip}>
                <MaterialCommunityIcons name="map-marker-outline" size={13} color="#FFF9F2" />
                <Text style={styles.heroChipText}>{resolveLocation(event)}</Text>
              </View>
              <View style={styles.heroChip}>
                <MaterialCommunityIcons name="calendar-month-outline" size={13} color="#FFF9F2" />
                <Text style={styles.heroChipText}>{dateRangeText}</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{event.photoCount}</Text>
            <Text style={styles.summaryLabel}>照片</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryValue}>{event.emotionTag || '未标注'}</Text>
            <Text style={styles.summaryLabel}>心情</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={[styles.summaryValue, { color: statusMeta.color }]}>
              {statusMeta.label}
            </Text>
            <Text style={styles.summaryLabel}>状态</Text>
          </View>
        </View>

        <View style={styles.quickActions}>
          <Pressable style={[styles.primaryAction, styles.flexAction]} onPress={onPlaySlideshow}>
            <MaterialCommunityIcons name="play-circle-outline" size={16} color="#FFF9F2" />
            <Text style={styles.primaryActionText}>播放幻灯片</Text>
          </Pressable>
          <Pressable
            style={[
              styles.secondaryAction,
              styles.flexAction,
              isRegenerating && styles.disabledAction,
            ]}
            onPress={retryAiStory}
            disabled={isRegenerating}
          >
            {isRegenerating ? (
              <ActivityIndicator size="small" color={JourneyPalette.ink} />
            ) : (
              <>
                <MaterialCommunityIcons name="robot-outline" size={16} color={JourneyPalette.ink} />
                <Text style={styles.secondaryActionText}>刷新故事</Text>
              </>
            )}
          </Pressable>
        </View>

        <View style={styles.quickActions}>
          <Pressable style={[styles.secondaryAction, styles.flexAction]} onPress={openEditModal}>
            <MaterialCommunityIcons name="pencil-outline" size={16} color={JourneyPalette.ink} />
            <Text style={styles.secondaryActionText}>编辑事件</Text>
          </Pressable>
          <Pressable style={[styles.secondaryAction, styles.flexAction]} onPress={openPhotoManager}>
            <MaterialCommunityIcons
              name="image-multiple-outline"
              size={16}
              color={JourneyPalette.ink}
            />
            <Text style={styles.secondaryActionText}>调整照片归属</Text>
          </Pressable>
        </View>

        {event.status === 'waiting_for_vision' ? (
          <View style={styles.noticeCard}>
            <MaterialCommunityIcons
              name="progress-clock"
              size={18}
              color={JourneyPalette.inkSoft}
            />
            <View style={styles.noticeCopy}>
              <Text style={styles.noticeTitle}>照片仍在整理</Text>
              <Text style={styles.noticeText}>端侧识别完成后，系统会自动更新故事。</Text>
            </View>
          </View>
        ) : null}

        {event.status === 'ai_failed' ? (
          <View style={styles.noticeCard}>
            <MaterialCommunityIcons
              name="alert-circle-outline"
              size={18}
              color={JourneyPalette.danger}
            />
            <View style={styles.noticeCopy}>
              <Text style={styles.noticeTitle}>最近一次生成失败</Text>
              <Text style={styles.noticeText}>
                {event.aiError || '可以稍后自动重试，或手动点击“刷新故事”重试。'}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>旅行故事</Text>
            {event.storyFreshness === 'stale' ? (
              <View style={styles.staleBadge}>
                <MaterialCommunityIcons name="update" size={12} color={JourneyPalette.warning} />
                <Text style={styles.staleBadgeText}>内容待更新</Text>
              </View>
            ) : null}
          </View>
          {fullStory ? (
            <Text style={styles.sectionBody}>{fullStory}</Text>
          ) : (
            <Text style={styles.sectionBodyMuted}>
              {event.aiError ? `生成失败：${event.aiError}` : '故事尚未完成，稍后会自动补齐。'}
            </Text>
          )}
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>云端增强</Text>
            {enhancementSummary.canRetry ? (
              <View style={styles.retryBadge}>
                <Text style={styles.retryBadgeText}>7 天内可直接重试</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.sectionBodyMuted}>
            只会上传你手动勾选的 3-5
            张压缩代表图，用于本事件更强故事重生成；默认路径不会上传整组照片。
          </Text>

          <View style={styles.infoPanel}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>上传内容</Text>
              <Text style={styles.infoValue}>3-5 张压缩代表图</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>当前保留</Text>
              <Text style={styles.infoValue}>
                {enhancementSummary.assetCount} 张 · {formatFileSize(enhancementSummary.totalBytes)}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>最近上传</Text>
              <Text style={styles.infoValue}>
                {formatDateTime(enhancementSummary.lastUploadedAt)}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>最近到期</Text>
              <Text style={styles.infoValue}>
                {formatDateTime(enhancementSummary.retainedUntil)}
              </Text>
            </View>
          </View>

          <Text style={styles.sectionHint}>
            推荐优先选择构图稳定、场景代表性强的照片。当前可用于增强的本地照片有{' '}
            {enhancementEligiblePhotos.length} 张。
          </Text>

          <View style={styles.quickActions}>
            <Pressable
              style={[
                styles.primaryAction,
                styles.flexAction,
                (isEnhancing || enhancementEligiblePhotos.length < 3) && styles.disabledAction,
              ]}
              disabled={isEnhancing || enhancementEligiblePhotos.length < 3}
              onPress={openEnhancementPicker}
            >
              {isEnhancing ? (
                <ActivityIndicator size="small" color="#FFF9F2" />
              ) : (
                <>
                  <MaterialCommunityIcons name="creation-outline" size={16} color="#FFF9F2" />
                  <Text style={styles.primaryActionText}>选择代表图并增强</Text>
                </>
              )}
            </Pressable>
            <Pressable
              style={[
                styles.secondaryAction,
                styles.flexAction,
                (!enhancementSummary.canRetry || isEnhancing) && styles.disabledAction,
              ]}
              disabled={!enhancementSummary.canRetry || isEnhancing}
              onPress={retryEnhancement}
            >
              <MaterialCommunityIcons name="refresh" size={16} color={JourneyPalette.ink} />
              <Text style={styles.secondaryActionText}>直接重试增强</Text>
            </Pressable>
          </View>
        </View>

        {event.chapters.length > 0 ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>章节</Text>
            <View style={styles.chapterList}>
              {event.chapters.map((chapter) => (
                <View key={chapter.id} style={styles.chapterItem}>
                  <Text style={styles.chapterTitle}>
                    {chapter.chapterTitle || `第 ${chapter.chapterIndex} 章`}
                  </Text>
                  {chapter.chapterStory ? (
                    <Text style={styles.chapterStory}>{chapter.chapterStory}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>相册</Text>
            <Text style={styles.sectionHint}>{event.photos.length} 张</Text>
          </View>
          <Text style={styles.sectionBodyMuted}>
            支持批量移出当前事件、移动到其他事件，或选中若干照片新建事件。
          </Text>
          <PhotoGrid
            photos={event.photos}
            onPhotoPress={onPhotoPress}
            emptyText="这个事件还没有可展示的照片"
          />
        </View>
      </ScrollView>

      <Modal
        visible={isEditModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalCopy}>
                <Text style={styles.modalTitle}>编辑事件</Text>
                <Text style={styles.modalHint}>
                  标题不会再被后续 AI 自动覆盖；地点修改会触发故事刷新。
                </Text>
              </View>
              <Pressable
                onPress={() => setIsEditModalVisible(false)}
                style={({ pressed }) => [styles.modalCloseBtn, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons name="close" size={18} color={JourneyPalette.inkSoft} />
              </Pressable>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.fieldLabel}>事件标题</Text>
              <TextInput
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="给这段旅程起个名字"
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

            <View style={styles.modalActions}>
              <Pressable
                onPress={deleteCurrentEvent}
                style={({ pressed }) => [styles.modalDangerBtn, pressed && styles.pressed]}
              >
                <Text style={styles.modalDangerBtnText}>删除事件</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void saveEventBasics();
                }}
                style={({ pressed }) => [
                  styles.modalPrimaryBtn,
                  pressed && styles.pressed,
                  isSavingEdit && styles.disabledAction,
                ]}
                disabled={isSavingEdit}
              >
                {isSavingEdit ? (
                  <ActivityIndicator color="#FFF9F2" />
                ) : (
                  <Text style={styles.modalPrimaryBtnText}>保存修改</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isPhotoManagerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsPhotoManagerVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalCopy}>
                <Text style={styles.modalTitle}>调整照片归属</Text>
                <Text style={styles.modalHint}>
                  先选照片，再移出、移动到其他事件，或直接新建事件。
                </Text>
              </View>
              <Pressable
                onPress={() => setIsPhotoManagerVisible(false)}
                style={({ pressed }) => [styles.modalCloseBtn, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons name="close" size={18} color={JourneyPalette.inkSoft} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalContent}>
              <View style={styles.selectionStats}>
                <Text style={styles.selectionStatsText}>
                  已选择 {selectedPhotoIds.length} / {event.photos.length}
                </Text>
                <Text style={styles.selectionStatsHint}>
                  批量改归属后，故事会按最新版本自动刷新。
                </Text>
              </View>

              <View style={styles.selectionGrid}>
                {event.photos.map((photo) => {
                  const coverCandidate = getPreferredPhotoThumbnailUri(photo);
                  const selectedIndex = selectedPhotoIds.indexOf(photo.id);
                  const isSelected = selectedIndex >= 0;
                  return (
                    <Pressable
                      key={photo.id}
                      onPress={() => toggleManagedPhoto(photo.id)}
                      style={({ pressed }) => [
                        styles.selectionItem,
                        isSelected && styles.selectionItemSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      {coverCandidate ? (
                        <Image source={{ uri: coverCandidate }} style={styles.selectionImage} />
                      ) : (
                        <View style={styles.selectionPlaceholder}>
                          <MaterialCommunityIcons
                            name="image-off-outline"
                            size={18}
                            color={JourneyPalette.muted}
                          />
                        </View>
                      )}
                      <View style={styles.selectionShade} />
                      {isSelected ? (
                        <View style={styles.selectionTopRow}>
                          <View style={styles.selectionIndexBadge}>
                            <Text style={styles.selectionIndexText}>{selectedIndex + 1}</Text>
                          </View>
                        </View>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.formCard}>
                <Text style={styles.fieldLabel}>移动到已有事件</Text>
                {availableEvents.length > 0 ? (
                  <View style={styles.targetEventList}>
                    {availableEvents.map((targetEvent) => (
                      <Pressable
                        key={targetEvent.id}
                        onPress={() => {
                          void applyPhotoSelection('move', targetEvent.id);
                        }}
                        style={({ pressed }) => [
                          styles.targetEventItem,
                          pressed && styles.pressed,
                          isPhotoActionLoading && styles.disabledAction,
                        ]}
                        disabled={isPhotoActionLoading}
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
                  <Text style={styles.sectionBodyMuted}>暂时没有其他可移动到的事件。</Text>
                )}
              </View>

              <View style={styles.formCard}>
                <Text style={styles.fieldLabel}>选中照片新建事件</Text>
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
                    void applyPhotoSelection('create');
                  }}
                  style={({ pressed }) => [
                    styles.modalPrimaryBtn,
                    pressed && styles.pressed,
                    (selectedManagedPhotos.length === 0 || isPhotoActionLoading) &&
                      styles.disabledAction,
                  ]}
                  disabled={selectedManagedPhotos.length === 0 || isPhotoActionLoading}
                >
                  <Text style={styles.modalPrimaryBtnText}>新建事件并转移选中照片</Text>
                </Pressable>
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  void applyPhotoSelection('remove');
                }}
                style={({ pressed }) => [
                  styles.modalGhostBtn,
                  pressed && styles.pressed,
                  (selectedManagedPhotos.length === 0 || isPhotoActionLoading) &&
                    styles.disabledAction,
                ]}
                disabled={selectedManagedPhotos.length === 0 || isPhotoActionLoading}
              >
                <Text style={styles.modalGhostBtnText}>移出当前事件</Text>
              </Pressable>
              <Pressable
                onPress={() => setIsPhotoManagerVisible(false)}
                style={({ pressed }) => [styles.modalPrimaryBtn, pressed && styles.pressed]}
              >
                <Text style={styles.modalPrimaryBtnText}>完成</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isEnhancementPickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsEnhancementPickerVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalCopy}>
                <Text style={styles.modalTitle}>选择代表图</Text>
                <Text style={styles.modalHint}>
                  勾选 3-5 张本地照片。系统已按代表性预选，上传后保留 7 天用于直接重试。
                </Text>
              </View>
              <Pressable
                onPress={() => setIsEnhancementPickerVisible(false)}
                style={({ pressed }) => [styles.modalCloseBtn, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons name="close" size={18} color={JourneyPalette.inkSoft} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalContent}>
              <View style={styles.selectionStats}>
                <Text style={styles.selectionStatsText}>
                  已选择 {selectedEnhancementIds.length} / 5
                </Text>
                <Text style={styles.selectionStatsHint}>
                  至少 3 张，当前可选 {enhancementEligiblePhotos.length} 张
                </Text>
              </View>

              <View style={styles.selectionGrid}>
                {enhancementEligiblePhotos.map((photo) => {
                  const coverCandidate = getPreferredPhotoThumbnailUri(photo);
                  const selectedIndex = selectedEnhancementIds.indexOf(photo.id);
                  const isSelected = selectedIndex >= 0;
                  return (
                    <Pressable
                      key={photo.id}
                      onPress={() => toggleEnhancementPhoto(photo.id)}
                      style={({ pressed }) => [
                        styles.selectionItem,
                        isSelected && styles.selectionItemSelected,
                        pressed && styles.pressed,
                      ]}
                    >
                      {coverCandidate ? (
                        <Image source={{ uri: coverCandidate }} style={styles.selectionImage} />
                      ) : (
                        <View style={styles.selectionPlaceholder}>
                          <MaterialCommunityIcons
                            name="image-off-outline"
                            size={18}
                            color={JourneyPalette.muted}
                          />
                        </View>
                      )}

                      <View style={styles.selectionShade} />
                      <View style={styles.selectionTopRow}>
                        <View style={styles.selectionScoreBadge}>
                          <Text style={styles.selectionScoreText}>
                            {Math.round((photo.vision?.cover_score ?? 0) * 100)}
                          </Text>
                        </View>
                        {isSelected ? (
                          <View style={styles.selectionIndexBadge}>
                            <Text style={styles.selectionIndexText}>{selectedIndex + 1}</Text>
                          </View>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() =>
                  setSelectedEnhancementIds(getRecommendedEnhancementPhotoIds(event.photos))
                }
                style={({ pressed }) => [styles.modalGhostBtn, pressed && styles.pressed]}
              >
                <Text style={styles.modalGhostBtnText}>恢复推荐</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void submitEnhancement();
                }}
                style={({ pressed }) => [
                  styles.modalPrimaryBtn,
                  pressed && styles.pressed,
                  (selectedEnhancementIds.length < 3 || isEnhancing) && styles.disabledAction,
                ]}
                disabled={selectedEnhancementIds.length < 3 || isEnhancing}
              >
                {isEnhancing ? (
                  <ActivityIndicator color="#FFF9F2" />
                ) : (
                  <Text style={styles.modalPrimaryBtnText}>上传并增强</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={isCoverPickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsCoverPickerVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <View style={styles.modalCopy}>
                <Text style={styles.modalTitle}>选择事件封面</Text>
                <Text style={styles.modalHint}>优先使用本地缩略图，无图时回退到远端图片。</Text>
              </View>
              <Pressable
                onPress={() => setIsCoverPickerVisible(false)}
                style={({ pressed }) => [styles.modalCloseBtn, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons name="close" size={18} color={JourneyPalette.inkSoft} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalContent}>
              <PhotoGrid
                photos={event.photos}
                onPhotoPress={(photo) => {
                  void onSelectCoverPhoto(photo);
                }}
                emptyText="这个事件还没有可用封面候选"
                selectedPhotoId={event.selectedCoverPhotoId ?? automaticCover.photoId}
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  void onResetCover();
                }}
                style={({ pressed }) => [styles.modalGhostBtn, pressed && styles.pressed]}
              >
                <Text style={styles.modalGhostBtnText}>恢复默认</Text>
              </Pressable>
              <Pressable
                onPress={() => setIsCoverPickerVisible(false)}
                style={({ pressed }) => [styles.modalPrimaryBtn, pressed && styles.pressed]}
              >
                <Text style={styles.modalPrimaryBtnText}>完成</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: JourneyPalette.cardAlt,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
    gap: 14,
  },
  centerScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.cardAlt,
    padding: 24,
  },
  loadingOrb: {
    width: 76,
    height: 76,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  centerText: {
    marginTop: 10,
    color: JourneyPalette.inkSoft,
  },
  errorText: {
    marginTop: 10,
    marginBottom: 16,
    color: JourneyPalette.danger,
  },
  heroCard: {
    height: 360,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: '#DCD9D2',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroFallbackText: {
    marginTop: 8,
    fontSize: 12,
    color: JourneyPalette.inkSoft,
    fontWeight: '600',
  },
  heroShade: {
    ...StyleSheet.absoluteFillObject,
  },
  heroTopBar: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topBarButton: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(24,35,34,0.34)',
  },
  topBarPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(24,35,34,0.34)',
  },
  topBarPillText: {
    color: '#FFF9F2',
    fontWeight: '800',
    fontSize: 12,
  },
  heroMeta: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 18,
  },
  heroEyebrow: {
    color: 'rgba(255,249,242,0.88)',
    fontSize: 11,
    letterSpacing: 1.1,
    fontWeight: '800',
  },
  heroTitle: {
    marginTop: 8,
    color: '#FFF9F2',
    fontSize: 30,
    fontWeight: '800',
  },
  heroChipRow: {
    marginTop: 12,
    gap: 8,
  },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,249,242,0.18)',
  },
  heroChipText: {
    color: '#FFF9F2',
    fontSize: 12,
    fontWeight: '700',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryCard: {
    flex: 1,
    borderRadius: 22,
    backgroundColor: JourneyPalette.card,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 10,
  },
  summaryValue: {
    fontSize: 15,
    fontWeight: '800',
    color: JourneyPalette.ink,
    textAlign: 'center',
  },
  summaryLabel: {
    marginTop: 5,
    fontSize: 11,
    color: JourneyPalette.muted,
  },
  quickActions: {
    flexDirection: 'row',
    gap: 10,
  },
  flexAction: {
    flex: 1,
  },
  primaryAction: {
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: JourneyPalette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryActionText: {
    color: '#FFF9F2',
    fontWeight: '800',
  },
  secondaryAction: {
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: '#EDE5D8',
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  secondaryActionText: {
    color: JourneyPalette.ink,
    fontWeight: '800',
  },
  disabledAction: {
    opacity: 0.55,
  },
  noticeCard: {
    borderRadius: 22,
    backgroundColor: JourneyPalette.card,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  noticeCopy: {
    flex: 1,
    gap: 4,
  },
  noticeTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 20,
    color: JourneyPalette.inkSoft,
  },
  sectionCard: {
    borderRadius: 26,
    backgroundColor: JourneyPalette.card,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    padding: 18,
    gap: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  sectionBody: {
    fontSize: 15,
    lineHeight: 25,
    color: JourneyPalette.ink,
  },
  sectionBodyMuted: {
    fontSize: 14,
    lineHeight: 22,
    color: JourneyPalette.inkSoft,
  },
  sectionHint: {
    color: JourneyPalette.muted,
    lineHeight: 20,
  },
  staleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: JourneyPalette.warningSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  staleBadgeText: {
    color: JourneyPalette.warning,
    fontWeight: '800',
    fontSize: 11,
  },
  retryBadge: {
    borderRadius: 999,
    backgroundColor: JourneyPalette.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  retryBadgeText: {
    color: JourneyPalette.accent,
    fontSize: 11,
    fontWeight: '800',
  },
  infoPanel: {
    borderRadius: 20,
    backgroundColor: JourneyPalette.cardAlt,
    padding: 14,
    gap: 10,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  infoLabel: {
    color: JourneyPalette.muted,
    fontSize: 13,
  },
  infoValue: {
    color: JourneyPalette.ink,
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
    textAlign: 'right',
  },
  chapterList: {
    gap: 10,
  },
  chapterItem: {
    borderRadius: 20,
    backgroundColor: JourneyPalette.cardAlt,
    padding: 14,
    gap: 8,
  },
  chapterTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  chapterStory: {
    color: JourneyPalette.inkSoft,
    lineHeight: 22,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(21, 32, 31, 0.42)',
  },
  modalSheet: {
    maxHeight: '82%',
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
  modalContent: {
    paddingTop: 16,
    paddingBottom: 12,
  },
  formGroup: {
    gap: 8,
    marginTop: 14,
  },
  formCard: {
    borderRadius: 20,
    backgroundColor: JourneyPalette.cardAlt,
    padding: 14,
    gap: 10,
    marginBottom: 14,
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
  selectionStats: {
    borderRadius: 18,
    backgroundColor: JourneyPalette.cardAlt,
    padding: 14,
    marginBottom: 14,
  },
  selectionStatsText: {
    fontSize: 15,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  selectionStatsHint: {
    marginTop: 4,
    color: JourneyPalette.inkSoft,
  },
  selectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  selectionItem: {
    width: '31%',
    aspectRatio: 1,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#DFE5DE',
  },
  selectionItemSelected: {
    borderWidth: 2,
    borderColor: JourneyPalette.accent,
  },
  selectionImage: {
    width: '100%',
    height: '100%',
  },
  selectionPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E7E4DC',
  },
  selectionShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(21, 32, 31, 0.16)',
  },
  selectionTopRow: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  targetEventList: {
    gap: 8,
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
    color: JourneyPalette.ink,
    fontWeight: '800',
    fontSize: 14,
  },
  targetEventMeta: {
    color: JourneyPalette.inkSoft,
    fontSize: 12,
  },
  selectionScoreBadge: {
    borderRadius: 999,
    backgroundColor: 'rgba(255,249,242,0.82)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  selectionScoreText: {
    color: JourneyPalette.ink,
    fontSize: 11,
    fontWeight: '800',
  },
  selectionIndexBadge: {
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.accent,
  },
  selectionIndexText: {
    color: '#FFF9F2',
    fontWeight: '800',
    fontSize: 12,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  modalGhostBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: '#EDE5D8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalGhostBtnText: {
    color: JourneyPalette.ink,
    fontWeight: '800',
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
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: '#F6D9D6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDangerBtnText: {
    color: JourneyPalette.danger,
    fontWeight: '800',
  },
  primaryBtn: {
    minWidth: 132,
    minHeight: 46,
    borderRadius: 999,
    backgroundColor: JourneyPalette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#FFF9F2',
    fontWeight: '800',
  },
  ghostBtn: {
    marginTop: 10,
    minWidth: 132,
    minHeight: 46,
    borderRadius: 999,
    backgroundColor: '#EDE5D8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnText: {
    color: JourneyPalette.ink,
    fontWeight: '800',
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
});
