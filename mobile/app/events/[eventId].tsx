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
import {
  clearEventCoverOverride,
  saveEventCoverOverride,
} from '@/services/media/localMediaRegistry';
import { taskApi } from '@/services/api/taskApi';
import { usePhotoViewerStore } from '@/stores/photoViewerStore';
import { useSlideshowStore } from '@/stores/slideshowStore';
import type { EventDetail, EventStatus } from '@/types/event';
import { formatDateRange } from '@/utils/dateUtils';
import { formatFileSize } from '@/utils/imageUtils';
import { getPreferredPhotoThumbnailUri, resolveCoverCandidateFromPhotos } from '@/utils/mediaRefs';

const STATUS_META: Record<EventStatus, { label: string; color: string }> = {
  clustered: { label: '已聚类（待AI）', color: '#6A7BA4' },
  ai_pending: { label: '待生成', color: '#7C87AA' },
  ai_processing: { label: 'AI 生成中', color: '#2D6EF5' },
  generated: { label: '已完成', color: '#0C9C7E' },
  ai_failed: { label: '生成失败', color: '#C34A5F' },
};

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
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
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

  const setPhotoViewerSession = usePhotoViewerStore((s) => s.setSession);
  const setSlideshowSession = useSlideshowStore((s) => s.setSession);

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
    } catch (err) {
      console.error('[event-detail] failed to load detail', err);
      setError(err instanceof Error ? err.message : '加载失败');
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
    } catch (err) {
      Alert.alert('重试失败', err instanceof Error ? err.message : '请稍后再试');
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
    const idSet = new Set(selectedEnhancementIds);
    return event.photos.filter((photo) => idSet.has(photo.id));
  }, [event, selectedEnhancementIds]);
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

  const toggleEnhancementPhoto = useCallback((photoId: string) => {
    setSelectedEnhancementIds((prev) => {
      if (prev.includes(photoId)) {
        return prev.filter((id) => id !== photoId);
      }
      if (prev.length >= 5) {
        return prev;
      }
      return [...prev, photoId];
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
    } catch (err) {
      Alert.alert('增强失败', err instanceof Error ? err.message : '请稍后再试');
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
    } catch (err) {
      Alert.alert('增强重试失败', err instanceof Error ? err.message : '请稍后再试');
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
        setEvent((prev) =>
          prev
            ? {
                ...prev,
                localCoverUri: nextCoverUri,
                selectedCoverPhotoId: photo.id,
              }
            : prev,
        );
        setCoverFailed(false);
        setIsCoverPickerVisible(false);
      } catch (err) {
        Alert.alert('封面更新失败', err instanceof Error ? err.message : '请稍后再试');
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
      setEvent((prev) =>
        prev
          ? {
              ...prev,
              localCoverUri: automaticCover.uri,
              selectedCoverPhotoId: automaticCover.photoId,
            }
          : prev,
      );
      setCoverFailed(false);
      setIsCoverPickerVisible(false);
    } catch (err) {
      Alert.alert('恢复默认失败', err instanceof Error ? err.message : '请稍后再试');
    }
  }, [automaticCover.photoId, automaticCover.uri, event]);

  if (loading) {
    return (
      <SafeAreaView style={styles.centerScreen}>
        <StatusBar barStyle="dark-content" />
        <ActivityIndicator size="large" color="#2F6AF6" />
        <Text style={styles.centerText}>正在加载事件详情...</Text>
      </SafeAreaView>
    );
  }

  if (!event || error) {
    return (
      <SafeAreaView style={styles.centerScreen}>
        <StatusBar barStyle="dark-content" />
        <MaterialCommunityIcons name="cloud-alert-outline" size={42} color="#D55D5D" />
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

  const statusMeta = STATUS_META[event.status] ?? STATUS_META.clustered;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" />
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
            <LinearGradient colors={['#DDE8FF', '#E9F8F2']} style={styles.heroFallback}>
              <MaterialCommunityIcons name="image-filter-hdr" size={38} color="#4C66A8" />
              <Text style={styles.heroFallbackText}>暂无封面图片</Text>
            </LinearGradient>
          )}

          <LinearGradient
            colors={['transparent', 'rgba(18,33,63,0.22)', 'rgba(18,33,63,0.7)']}
            style={styles.heroShade}
          />

          <Pressable style={styles.backBtn} onPress={() => router.back()}>
            <MaterialCommunityIcons name="arrow-left" size={18} color="#10204A" />
            <Text style={styles.backBtnText}>返回</Text>
          </Pressable>

          <Pressable
            style={styles.coverActionBtn}
            onPress={() => setIsCoverPickerVisible(true)}
            disabled={event.photos.length === 0}
          >
            <MaterialCommunityIcons name="image-edit-outline" size={16} color="#10204A" />
            <Text style={styles.coverActionBtnText}>更换封面</Text>
          </Pressable>

          <View style={styles.heroMeta}>
            <Text style={styles.heroTitle}>{event.title || '未命名事件'}</Text>
            <Text style={styles.heroSub}>{resolveLocation(event)}</Text>
            <Text style={styles.heroSub}>{dateRangeText}</Text>
            <Text style={styles.heroHint}>
              {event.selectedCoverPhotoId ? '当前使用本地优先封面' : '封面将优先使用本地图片'}
            </Text>
          </View>
        </View>

        <View style={styles.quickStats}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{event.photoCount}</Text>
            <Text style={styles.statLabel}>照片</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{event.emotionTag || '未标注'}</Text>
            <Text style={styles.statLabel}>心情</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: statusMeta.color }]}>{statusMeta.label}</Text>
            <Text style={styles.statLabel}>状态</Text>
          </View>
        </View>

        {fullStory ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>旅行故事</Text>
            <Text style={styles.sectionBody}>{fullStory}</Text>
          </View>
        ) : (
          <View style={styles.warningCard}>
            <View style={styles.warningHeader}>
              <MaterialCommunityIcons name="robot-outline" size={18} color="#9A5A37" />
              <Text style={styles.warningTitle}>故事尚未完成</Text>
            </View>
            <Text style={styles.warningText}>
              {event.aiError ? `原因：${event.aiError}` : 'AI 正在生成中，或尚未开始。'}
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.retryAiBtn,
                pressed && styles.pressed,
                isRegenerating && styles.retryAiBtnDisabled,
              ]}
              disabled={isRegenerating}
              onPress={retryAiStory}
            >
              {isRegenerating ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.retryAiBtnText}>重试生成故事</Text>
              )}
            </Pressable>
          </View>
        )}

        <View style={styles.sectionCard}>
          <View style={styles.enhancementHeader}>
            <View style={styles.enhancementTitleWrap}>
              <MaterialCommunityIcons name="cloud-upload-outline" size={18} color="#355CB0" />
              <Text style={styles.sectionTitle}>云端增强</Text>
            </View>
            {enhancementSummary.canRetry ? (
              <View style={styles.enhancementBadge}>
                <Text style={styles.enhancementBadgeText}>7 天内可直重试</Text>
              </View>
            ) : null}
          </View>

          <Text style={styles.sectionBody}>
            只会上传你手动勾选的 3-5
            张压缩代表图，用于本事件更强故事重生成；默认路径不会上传整组照片。
          </Text>

          <View style={styles.enhancementInfoCard}>
            <View style={styles.enhancementInfoRow}>
              <Text style={styles.enhancementInfoLabel}>上传内容</Text>
              <Text style={styles.enhancementInfoValue}>3-5 张压缩代表图</Text>
            </View>
            <View style={styles.enhancementInfoRow}>
              <Text style={styles.enhancementInfoLabel}>当前保留</Text>
              <Text style={styles.enhancementInfoValue}>
                {enhancementSummary.assetCount} 张 · {formatFileSize(enhancementSummary.totalBytes)}
              </Text>
            </View>
            <View style={styles.enhancementInfoRow}>
              <Text style={styles.enhancementInfoLabel}>最近到期</Text>
              <Text style={styles.enhancementInfoValue}>
                {formatDateTime(enhancementSummary.retainedUntil)}
              </Text>
            </View>
          </View>

          <Text style={styles.sectionHint}>
            推荐优先选择构图稳定、场景代表性强的照片。当前可用于增强的本地照片有{' '}
            {enhancementEligiblePhotos.length} 张。
          </Text>

          <View style={styles.enhancementActions}>
            <Pressable
              style={({ pressed }) => [
                styles.enhancementPrimaryBtn,
                pressed && styles.pressed,
                (isEnhancing || enhancementEligiblePhotos.length < 3) && styles.retryAiBtnDisabled,
              ]}
              disabled={isEnhancing || enhancementEligiblePhotos.length < 3}
              onPress={openEnhancementPicker}
            >
              {isEnhancing ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.enhancementPrimaryBtnText}>选择代表图并增强</Text>
              )}
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.enhancementGhostBtn,
                pressed && styles.pressed,
                (!enhancementSummary.canRetry || isEnhancing) && styles.retryAiBtnDisabled,
              ]}
              disabled={!enhancementSummary.canRetry || isEnhancing}
              onPress={retryEnhancement}
            >
              <Text style={styles.enhancementGhostBtnText}>直接重试增强</Text>
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
                    {chapter.chapterTitle || `第${chapter.chapterIndex}章`}
                  </Text>
                  {chapter.chapterStory ? (
                    <Text style={styles.chapterStory}>{chapter.chapterStory}</Text>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {event.musicUrl ? (
          <View style={styles.sectionCard}>
            <View style={styles.musicHeader}>
              <View style={styles.musicTitleWrap}>
                <MaterialCommunityIcons name="music-circle-outline" size={18} color="#3D57A7" />
                <Text style={styles.sectionTitle}>背景音乐</Text>
              </View>
            </View>
            <Text style={styles.sectionHint}>已关联音乐资源，幻灯片播放时将自动加载。</Text>
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <View style={styles.albumHeader}>
            <Text style={styles.sectionTitle}>相册 · {event.photos.length} 张</Text>
            <Pressable
              style={({ pressed }) => [styles.playBtn, pressed && styles.pressed]}
              onPress={onPlaySlideshow}
            >
              <MaterialCommunityIcons name="play-circle-outline" size={16} color="#FFFFFF" />
              <Text style={styles.playBtnText}>播放幻灯片</Text>
            </Pressable>
          </View>

          <PhotoGrid
            photos={event.photos}
            onPhotoPress={onPhotoPress}
            emptyText="这个事件还没有可展示的照片"
          />
        </View>
      </ScrollView>

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
              <View>
                <Text style={styles.modalTitle}>选择代表图</Text>
                <Text style={styles.modalHint}>
                  勾选 3-5 张本地照片。系统已按代表性预选，上传后保留 7 天用于直接重试。
                </Text>
              </View>
              <Pressable
                onPress={() => setIsEnhancementPickerVisible(false)}
                style={({ pressed }) => [styles.modalCloseBtn, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons name="close" size={18} color="#5C6C90" />
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
                            color="#8090B2"
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
                  (selectedEnhancementIds.length < 3 || isEnhancing) && styles.retryAiBtnDisabled,
                ]}
                disabled={selectedEnhancementIds.length < 3 || isEnhancing}
              >
                {isEnhancing ? (
                  <ActivityIndicator color="#FFFFFF" />
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
              <View>
                <Text style={styles.modalTitle}>选择事件封面</Text>
                <Text style={styles.modalHint}>优先使用本地缩略图，无图时回退到远端图片。</Text>
              </View>
              <Pressable
                onPress={() => setIsCoverPickerVisible(false)}
                style={({ pressed }) => [styles.modalCloseBtn, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons name="close" size={18} color="#5C6C90" />
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
    backgroundColor: '#F3F6FB',
  },
  content: {
    padding: 16,
    paddingBottom: 30,
    gap: 14,
  },
  centerScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F6FB',
    padding: 24,
  },
  centerText: {
    marginTop: 10,
    color: '#617194',
  },
  errorText: {
    marginTop: 10,
    marginBottom: 16,
    color: '#4E5C7F',
  },
  heroCard: {
    height: 280,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D8E2F7',
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
    color: '#4A5E93',
    fontWeight: '600',
  },
  heroShade: {
    ...StyleSheet.absoluteFillObject,
  },
  backBtn: {
    position: 'absolute',
    top: 14,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  coverActionBtn: {
    position: 'absolute',
    top: 14,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  coverActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#10204A',
  },
  backBtnText: {
    marginLeft: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#10204A',
  },
  heroMeta: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 14,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
  },
  heroSub: {
    marginTop: 5,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
  },
  heroHint: {
    marginTop: 7,
    color: 'rgba(255,255,255,0.86)',
    fontSize: 11,
  },
  quickStats: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E8FA',
    alignItems: 'center',
    paddingVertical: 11,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#28385E',
    textAlign: 'center',
  },
  statLabel: {
    marginTop: 4,
    fontSize: 11,
    color: '#7E8CAE',
  },
  sectionCard: {
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E8FA',
    padding: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#28385E',
  },
  sectionBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 22,
    color: '#4C5C80',
  },
  enhancementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  enhancementTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  enhancementBadge: {
    borderRadius: 999,
    backgroundColor: '#EEF4FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  enhancementBadgeText: {
    color: '#355CB0',
    fontSize: 11,
    fontWeight: '700',
  },
  enhancementInfoCard: {
    marginTop: 12,
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DBE5FA',
    backgroundColor: '#F7FAFF',
    padding: 12,
  },
  enhancementInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  enhancementInfoLabel: {
    color: '#6E7FA2',
    fontSize: 12,
  },
  enhancementInfoValue: {
    color: '#27416E',
    fontSize: 12,
    fontWeight: '700',
  },
  enhancementActions: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  enhancementPrimaryBtn: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: '#2F6AF6',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  enhancementPrimaryBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  enhancementGhostBtn: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D8E2F7',
    backgroundColor: '#F8FAFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  enhancementGhostBtnText: {
    color: '#47608D',
    fontSize: 12,
    fontWeight: '700',
  },
  chapterList: {
    marginTop: 10,
    gap: 10,
  },
  chapterItem: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4EBFC',
    backgroundColor: '#F8FAFF',
    padding: 10,
  },
  chapterTitle: {
    fontSize: 13,
    color: '#2F4A82',
    fontWeight: '800',
  },
  chapterStory: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    color: '#4E628D',
  },
  warningCard: {
    borderRadius: 16,
    backgroundColor: '#FFF7EE',
    borderWidth: 1,
    borderColor: '#F4DDC8',
    padding: 14,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  warningTitle: {
    fontSize: 15,
    color: '#854E32',
    fontWeight: '700',
  },
  warningText: {
    marginTop: 8,
    fontSize: 12,
    lineHeight: 18,
    color: '#8A5B3F',
  },
  retryAiBtn: {
    marginTop: 12,
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#D46A3E',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  retryAiBtnDisabled: {
    opacity: 0.7,
  },
  retryAiBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  sectionHint: {
    marginTop: 8,
    fontSize: 12,
    color: '#6E7FA2',
  },
  musicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  musicTitleWrap: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  albumHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    backgroundColor: '#2F6AF6',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  playBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  primaryBtn: {
    borderRadius: 999,
    backgroundColor: '#2F6AF6',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  ghostBtn: {
    marginTop: 10,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ghostBtnText: {
    color: '#66779D',
    fontWeight: '600',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(7, 14, 29, 0.42)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '78%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: '#F7F9FE',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
  },
  modalHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#D1D9EB',
  },
  modalHeader: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#26365D',
  },
  modalHint: {
    marginTop: 4,
    fontSize: 12,
    color: '#6C7B9D',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF0FF',
  },
  modalContent: {
    paddingTop: 14,
    paddingBottom: 10,
  },
  selectionStats: {
    gap: 4,
    marginBottom: 14,
  },
  selectionStatsText: {
    color: '#25365F',
    fontSize: 14,
    fontWeight: '800',
  },
  selectionStatsHint: {
    color: '#7284A8',
    fontSize: 12,
  },
  selectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectionItem: {
    position: 'relative',
    width: '31%',
    aspectRatio: 1,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#DCE5FA',
    backgroundColor: '#EDF2FF',
  },
  selectionItemSelected: {
    borderColor: '#2F6AF6',
    borderWidth: 2,
  },
  selectionImage: {
    width: '100%',
    height: '100%',
  },
  selectionPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 33, 68, 0.08)',
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
  selectionScoreBadge: {
    minWidth: 30,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignItems: 'center',
  },
  selectionScoreText: {
    color: '#27416E',
    fontSize: 10,
    fontWeight: '800',
  },
  selectionIndexBadge: {
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: '#2F6AF6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectionIndexText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  modalActions: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalGhostBtn: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#D5DDF2',
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  modalGhostBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#5B6B90',
  },
  modalPrimaryBtn: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 11,
    alignItems: 'center',
    backgroundColor: '#2F6AF6',
  },
  modalPrimaryBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
});
