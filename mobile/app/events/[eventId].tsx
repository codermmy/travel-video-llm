import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

import { EventEditSheet } from '@/components/event/EventEditSheet';
import { EventJourneyChapterCard } from '@/components/event/EventJourneyChapterCard';
import { EventPhotoManagerSheet } from '@/components/event/EventPhotoManagerSheet';
import { PhotoGrid } from '@/components/photo/PhotoGrid';
import { eventApi } from '@/services/api/eventApi';
import {
  clearEventCoverOverride,
  saveEventCoverOverride,
} from '@/services/media/localMediaRegistry';
import { taskApi } from '@/services/api/taskApi';
import { generateSlideshowPreviewVideo } from '@/services/slideshow/slideshowExportService';
import { buildScenes } from '@/services/slideshow/slideshowSceneBuilder';
import { usePhotoViewerStore } from '@/stores/photoViewerStore';
import { useSlideshowStore } from '@/stores/slideshowStore';
import { JourneyPalette } from '@/styles/colors';
import type { EventDetail } from '@/types/event';
import { formatDateRange } from '@/utils/dateUtils';
import { getEventStatusMeta } from '@/utils/eventStatus';
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

function normalizeCopy(text?: string | null): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function takeSentence(text?: string | null, maxChars = 28): string {
  const normalized = normalizeCopy(text);
  if (!normalized) {
    return '';
  }
  const firstSentence = normalized.split(/[。！？!?]/)[0]?.trim() || normalized;
  const result =
    firstSentence.length > maxChars ? `${firstSentence.slice(0, maxChars).trim()}…` : firstSentence;
  return result || normalized.slice(0, maxChars);
}

function takeParagraph(text?: string | null, maxChars = 80): string {
  const normalized = normalizeCopy(text);
  if (!normalized) {
    return '';
  }
  return normalized.length > maxChars ? `${normalized.slice(0, maxChars).trim()}…` : normalized;
}

const PREVIEW_PRIME_SLIDE_DURATION_MS = 3200;

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
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isPhotoManagerVisible, setIsPhotoManagerVisible] = useState(false);
  const [photoManagerEntryMode, setPhotoManagerEntryMode] = useState<'browse' | 'move-target'>(
    'browse',
  );
  const [isMoreActionsVisible, setIsMoreActionsVisible] = useState(false);
  const [expandedChapterId, setExpandedChapterId] = useState<string | null>(null);
  const [isFullStoryExpanded, setIsFullStoryExpanded] = useState(false);
  const previewPrimeKeyRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (!event) {
      return;
    }
    if (
      event.storyFreshness !== 'fresh' ||
      event.slideshowFreshness !== 'fresh' ||
      event.hasPendingStructureChanges ||
      event.photos.length === 0
    ) {
      return;
    }

    const scenes = buildScenes(event.photos, event.chapters);
    if (scenes.length === 0) {
      return;
    }

    const primeKey = [
      event.id,
      event.eventVersion,
      event.storyGeneratedFromVersion ?? 'story-missing',
      event.slideshowGeneratedFromVersion ?? 'slideshow-missing',
      event.photos.length,
      event.chapters.length,
    ].join(':');

    if (previewPrimeKeyRef.current === primeKey) {
      return;
    }
    previewPrimeKeyRef.current = primeKey;

    void generateSlideshowPreviewVideo({
      event: {
        id: event.id,
        title: event.title,
        emotionTag: event.emotionTag ?? null,
        musicUrl: event.musicUrl ?? null,
        storyText: event.storyText ?? null,
        fullStory: event.fullStory ?? null,
        storyFreshness: event.storyFreshness,
        slideshowFreshness: event.slideshowFreshness,
        hasPendingStructureChanges: event.hasPendingStructureChanges,
        chapters: event.chapters,
        photoGroups: event.photoGroups,
      },
      photos: event.photos,
      scenes,
      slideDurationMs: PREVIEW_PRIME_SLIDE_DURATION_MS,
      aspectMode: 'auto',
    }).catch((error) => {
      previewPrimeKeyRef.current = null;
      console.warn('[event-detail] failed to warm slideshow preview video', error);
    });
  }, [event]);

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
        emotionTag: event.emotionTag ?? null,
        musicUrl: event.musicUrl ?? null,
        storyText: event.storyText ?? null,
        fullStory: event.fullStory ?? null,
        storyFreshness: event.storyFreshness,
        slideshowFreshness: event.slideshowFreshness,
        hasPendingStructureChanges: event.hasPendingStructureChanges,
        chapters: event.chapters,
        photoGroups: event.photoGroups,
      },
      event.photos,
    );

    router.push('/slideshow');
  }, [event, router, setSlideshowSession]);

  const onOpenPhotoViewer = useCallback(() => {
    if (!event || event.photos.length === 0) {
      Alert.alert('暂无照片', '该事件目前没有可查看的照片。');
      return;
    }
    setPhotoViewerSession(event.photos, 0);
    router.push('/photo-viewer');
  }, [event, router, setPhotoViewerSession]);

  const pollTaskUntilSettled = useCallback(async (taskId?: string | null) => {
    if (!taskId) {
      return 'settled' as const;
    }

    const start = Date.now();
    while (Date.now() - start < 90_000) {
      const task = await taskApi.getTaskStatus(taskId);
      if (task.status === 'success' || task.status === 'failure') {
        return 'settled' as const;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    return 'timeout' as const;
  }, []);

  const retryAiStory = useCallback(async () => {
    if (!event) {
      return;
    }

    try {
      setIsRegenerating(true);
      const result = await eventApi.regenerateStory(event.id);
      const pollResult = await pollTaskUntilSettled(result.taskId);
      await loadDetail();
      Alert.alert(
        '已提交',
        pollResult === 'timeout'
          ? '大事件生成耗时会更长，后台仍在继续处理。你可以先返回列表，稍后再进来看结果。'
          : '故事生成任务已刷新。',
      );
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
  const chapterSections = useMemo(() => {
    if (!event) {
      return [];
    }

    return [...event.chapters]
      .sort((left, right) => left.photoStartIndex - right.photoStartIndex)
      .map((chapter) => {
        const chapterPhotos = event.photos.slice(
          chapter.photoStartIndex,
          chapter.photoEndIndex + 1,
        );
        return {
          chapter,
          chapterPhotos,
          teaserText:
            takeSentence(chapter.slideshowCaption, 24) ||
            takeSentence(chapter.chapterStory, 28) ||
            takeSentence(chapter.chapterIntro, 28) ||
            takeSentence(chapter.chapterSummary, 28) ||
            `这一段回忆由 ${chapterPhotos.length} 张照片慢慢展开。`,
          descriptionText:
            takeParagraph(chapter.chapterStory, 96) ||
            takeParagraph(chapter.chapterIntro, 96) ||
            takeParagraph(chapter.chapterSummary, 96) ||
            null,
        };
      });
  }, [event]);
  const introText = useMemo(() => {
    if (!event) {
      return '';
    }
    const firstChapter = chapterSections[0]?.chapter;
    return (
      takeParagraph(firstChapter?.slideshowCaption, 72) ||
      takeParagraph(firstChapter?.chapterStory, 84) ||
      takeParagraph(event.fullStory || event.storyText, 84) ||
      '这一段旅途先从照片开始，让故事慢一点浮出来。'
    );
  }, [chapterSections, event]);
  const automaticCover = useMemo(() => {
    if (!event) {
      return { photoId: null, uri: null };
    }
    return resolveCoverCandidateFromPhotos(event.photos, [event.coverPhotoId]);
  }, [event]);
  const coverUri = event?.localCoverUri ?? automaticCover.uri ?? event?.coverPhotoUrl ?? null;

  const openEditModal = useCallback(() => {
    if (!event) {
      return;
    }
    setIsEditModalVisible(true);
  }, [event]);

  const openPhotoManager = useCallback(() => {
    if (!event) {
      return;
    }
    setIsMoreActionsVisible(false);
    setPhotoManagerEntryMode('browse');
    setIsPhotoManagerVisible(true);
  }, [event]);

  const openMoveTargetPicker = useCallback(() => {
    if (!event) {
      return;
    }
    if (event.photos.length === 0) {
      Alert.alert('暂无可移动照片', '当前事件还没有可移动的照片。');
      return;
    }
    setIsMoreActionsVisible(false);
    Alert.alert(
      '移动整组照片',
      '这一步会默认选中当前事件的全部照片，再让你选择目标事件。确认后继续。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '继续',
          onPress: () => {
            setPhotoManagerEntryMode('move-target');
            setIsPhotoManagerVisible(true);
          },
        },
      ],
    );
  }, [event]);

  const openMoreActions = useCallback(() => {
    setIsMoreActionsVisible(true);
  }, []);

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

  const confirmDeleteEvent = useCallback(() => {
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

  const canRetryManually = Boolean(event?.aiError) || event?.status === 'ai_failed';
  const detailEventTone = useMemo(
    () => (event ? getEventStatusMeta(event).tone : ('importing' as const)),
    [event],
  );
  const primaryQuickAction = useMemo(() => {
    if (detailEventTone === 'ready') {
      return {
        kind: 'play' as const,
        label: '播放回忆',
        icon: 'play-circle-outline' as const,
        onPress: onPlaySlideshow,
        disabled: false,
      };
    }
    if (detailEventTone === 'failed' && canRetryManually) {
      return {
        kind: 'retry' as const,
        label: isRegenerating ? '重试中...' : '重试更新',
        icon: 'refresh' as const,
        onPress: () => {
          void retryAiStory();
        },
        disabled: isRegenerating,
      };
    }
    return {
      kind: 'photos' as const,
      label: '查看照片',
      icon: 'image-outline' as const,
      onPress: onOpenPhotoViewer,
      disabled: false,
    };
  }, [
    canRetryManually,
    detailEventTone,
    isRegenerating,
    onOpenPhotoViewer,
    onPlaySlideshow,
    retryAiStory,
  ]);
  const secondaryQuickAction = useMemo(() => {
    if (primaryQuickAction.kind === 'photos') {
      return {
        label: '管理照片',
        icon: 'image-multiple-outline' as const,
        onPress: openPhotoManager,
      };
    }
    return {
      label: '查看照片',
      icon: 'image-outline' as const,
      onPress: onOpenPhotoViewer,
    };
  }, [onOpenPhotoViewer, openPhotoManager, primaryQuickAction.kind]);

  if (loading) {
    return (
      <SafeAreaView style={styles.centerScreen}>
        <StatusBar barStyle="dark-content" />
        <LinearGradient colors={['#EEF4FF', '#F8FBFF']} style={styles.loadingOrb}>
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
            <Pressable style={styles.topBarPill} onPress={openMoreActions}>
              <MaterialCommunityIcons name="dots-horizontal" size={15} color="#FFF9F2" />
              <Text style={styles.topBarPillText}>更多</Text>
            </Pressable>
          </View>

          <View style={styles.heroMeta}>
            <Text style={styles.heroEyebrow}>MEMORY STORY</Text>
            <Text style={styles.heroTitle}>{event.title || '未命名事件'}</Text>
            <Text style={styles.heroMetaLine}>
              {resolveLocation(event)} · {dateRangeText} · {event.photoCount} 张照片
            </Text>
          </View>
        </View>

        <View style={styles.quickActions}>
          <Pressable
            style={[
              styles.primaryAction,
              styles.flexAction,
              primaryQuickAction.disabled && styles.disabledAction,
            ]}
            onPress={primaryQuickAction.onPress}
            disabled={primaryQuickAction.disabled}
          >
            {primaryQuickAction.kind === 'retry' && isRegenerating ? (
              <ActivityIndicator size="small" color="#FFF9F2" />
            ) : (
              <MaterialCommunityIcons name={primaryQuickAction.icon} size={16} color="#FFF9F2" />
            )}
            <Text style={styles.primaryActionText}>{primaryQuickAction.label}</Text>
          </Pressable>
          <Pressable
            style={[styles.secondaryAction, styles.flexAction]}
            onPress={secondaryQuickAction.onPress}
          >
            <MaterialCommunityIcons
              name={secondaryQuickAction.icon}
              size={16}
              color={JourneyPalette.ink}
            />
            <Text style={styles.secondaryActionText}>{secondaryQuickAction.label}</Text>
          </Pressable>
          <Pressable style={[styles.secondaryAction, styles.flexAction]} onPress={openMoreActions}>
            <MaterialCommunityIcons name="dots-horizontal" size={18} color={JourneyPalette.ink} />
            <Text style={styles.secondaryActionText}>更多</Text>
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
              <Text style={styles.noticeText}>端侧识别完成后会自动更新故事。</Text>
            </View>
          </View>
        ) : null}

        {event.storyFreshness === 'stale' ||
        event.slideshowFreshness === 'stale' ||
        event.hasPendingStructureChanges ? (
          <View style={styles.noticeCard}>
            <MaterialCommunityIcons name="update" size={18} color={JourneyPalette.warning} />
            <View style={styles.noticeCopy}>
              <Text style={styles.noticeTitle}>内容待自动更新</Text>
              <Text style={styles.noticeText}>照片或事件刚有变更，系统会在后台自动刷新。</Text>
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
                {event.aiError || '可稍后重试，或从“更多”里手动刷新。'}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>故事引子</Text>
          </View>
          <Text style={styles.sectionBody}>{introText}</Text>
        </View>

        {chapterSections.length > 0 ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>旅程章节</Text>
            </View>
            <View style={styles.chapterList}>
              {chapterSections.map(({ chapter, chapterPhotos, teaserText, descriptionText }) => (
                <EventJourneyChapterCard
                  key={chapter.id}
                  chapter={chapter}
                  photos={chapterPhotos}
                  teaserText={teaserText}
                  descriptionText={descriptionText}
                  expanded={expandedChapterId === chapter.id}
                  onToggle={() => {
                    setExpandedChapterId((previous) =>
                      previous === chapter.id ? null : chapter.id,
                    );
                  }}
                  onPhotoPress={(photo, index) => {
                    onPhotoPress(photo, chapter.photoStartIndex + index);
                  }}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>相册</Text>
          </View>
          <PhotoGrid
            photos={event.photos}
            onPhotoPress={onPhotoPress}
            emptyText="这个事件还没有可展示的照片"
          />
        </View>

        {fullStory ? (
          <View style={styles.sectionCard}>
            <Pressable
              style={({ pressed }) => [styles.storyReaderToggle, pressed && styles.pressed]}
              onPress={() => setIsFullStoryExpanded((previous) => !previous)}
            >
              <View style={styles.storyReaderCopy}>
                <Text style={styles.sectionTitle}>完整故事</Text>
                <Text style={styles.sectionBodyMuted}>
                  {isFullStoryExpanded ? '收起完整旁白' : '展开阅读全文'}
                </Text>
              </View>
              <MaterialCommunityIcons
                name={isFullStoryExpanded ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={JourneyPalette.inkSoft}
              />
            </Pressable>
            {isFullStoryExpanded ? <Text style={styles.sectionBody}>{fullStory}</Text> : null}
          </View>
        ) : (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>完整故事</Text>
            <Text style={styles.sectionBodyMuted}>
              {event.aiError ? `生成失败：${event.aiError}` : '故事尚未完成，稍后会自动补齐。'}
            </Text>
          </View>
        )}
      </ScrollView>

      <EventEditSheet
        visible={isEditModalVisible}
        event={event}
        onClose={() => setIsEditModalVisible(false)}
        onSaved={() => {
          setIsEditModalVisible(false);
          void loadDetail();
          Alert.alert('已保存', '事件基础信息已更新。');
        }}
        onDeleted={() => {
          setIsEditModalVisible(false);
          router.back();
        }}
      />
      <EventPhotoManagerSheet
        visible={isPhotoManagerVisible}
        eventId={event.id}
        entryMode={photoManagerEntryMode}
        onClose={() => {
          setIsPhotoManagerVisible(false);
          setPhotoManagerEntryMode('browse');
        }}
        onChanged={({ deletedCurrentEvent }) => {
          setIsPhotoManagerVisible(false);
          setPhotoManagerEntryMode('browse');
          if (deletedCurrentEvent) {
            Alert.alert('事件已删除', '当前事件照片已清空，系统已自动删除该事件。');
            router.back();
            return;
          }
          void loadDetail();
        }}
      />

      <Modal
        visible={isMoreActionsVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsMoreActionsVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setIsMoreActionsVisible(false)}
          />
          <View style={styles.actionSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.actionSheetTitle}>更多操作</Text>
            <Text style={styles.actionSheetHint}>
              低频操作收纳在这里，首页动作只保留播放和看照片。
            </Text>

            <Pressable
              style={({ pressed }) => [styles.actionSheetRow, pressed && styles.pressed]}
              onPress={() => {
                setIsMoreActionsVisible(false);
                openEditModal();
              }}
            >
              <MaterialCommunityIcons name="pencil-outline" size={18} color={JourneyPalette.ink} />
              <Text style={styles.actionSheetRowText}>编辑事件</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.actionSheetRow, pressed && styles.pressed]}
              onPress={openPhotoManager}
            >
              <MaterialCommunityIcons
                name="image-multiple-outline"
                size={18}
                color={JourneyPalette.ink}
              />
              <Text style={styles.actionSheetRowText}>管理照片</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.actionSheetRow, pressed && styles.pressed]}
              onPress={openMoveTargetPicker}
            >
              <MaterialCommunityIcons name="swap-horizontal" size={18} color={JourneyPalette.ink} />
              <Text style={styles.actionSheetRowText}>移动整组照片</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.actionSheetRow, pressed && styles.pressed]}
              onPress={() => {
                setIsMoreActionsVisible(false);
                setIsCoverPickerVisible(true);
              }}
            >
              <MaterialCommunityIcons
                name="image-edit-outline"
                size={18}
                color={JourneyPalette.ink}
              />
              <Text style={styles.actionSheetRowText}>更换封面</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.actionSheetRow, pressed && styles.pressed]}
              onPress={() => {
                setIsMoreActionsVisible(false);
                void onResetCover();
              }}
            >
              <MaterialCommunityIcons
                name="image-sync-outline"
                size={18}
                color={JourneyPalette.ink}
              />
              <Text style={styles.actionSheetRowText}>恢复默认封面</Text>
            </Pressable>

            {canRetryManually && (
              <Pressable
                style={({ pressed }) => [
                  styles.actionSheetRow,
                  isRegenerating && styles.disabledAction,
                  pressed && styles.pressed,
                ]}
                onPress={() => {
                  setIsMoreActionsVisible(false);
                  void retryAiStory();
                }}
                disabled={isRegenerating}
              >
                {isRegenerating ? (
                  <ActivityIndicator size="small" color={JourneyPalette.accent} />
                ) : (
                  <MaterialCommunityIcons name="refresh" size={18} color={JourneyPalette.accent} />
                )}
                <Text style={[styles.actionSheetRowText, styles.actionSheetRowTextAccent]}>
                  手动重试更新
                </Text>
              </Pressable>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.actionSheetRow,
                styles.actionSheetRowDanger,
                pressed && styles.pressed,
              ]}
              onPress={() => {
                setIsMoreActionsVisible(false);
                confirmDeleteEvent();
              }}
            >
              <MaterialCommunityIcons
                name="trash-can-outline"
                size={18}
                color={JourneyPalette.danger}
              />
              <Text style={[styles.actionSheetRowText, styles.actionSheetRowTextDanger]}>
                删除事件
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.actionSheetCancel, pressed && styles.pressed]}
              onPress={() => setIsMoreActionsVisible(false)}
            >
              <Text style={styles.actionSheetCancelText}>取消</Text>
            </Pressable>
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
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setIsCoverPickerVisible(false)}
          />
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
  heroMetaLine: {
    marginTop: 12,
    color: '#FFF9F2',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
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
    backgroundColor: JourneyPalette.cardAlt,
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
    gap: 12,
  },
  storyReaderToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  storyReaderCopy: {
    flex: 1,
    gap: 4,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(21, 32, 31, 0.42)',
  },
  actionSheet: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: JourneyPalette.card,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 10,
  },
  actionSheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  actionSheetHint: {
    marginBottom: 4,
    color: JourneyPalette.inkSoft,
    lineHeight: 20,
  },
  actionSheetRow: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: JourneyPalette.cardAlt,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionSheetRowDanger: {
    backgroundColor: JourneyPalette.dangerSoft,
    borderColor: JourneyPalette.dangerBorder,
  },
  actionSheetRowText: {
    color: JourneyPalette.ink,
    fontWeight: '800',
  },
  actionSheetRowTextAccent: {
    color: JourneyPalette.accent,
  },
  actionSheetRowTextDanger: {
    color: JourneyPalette.danger,
  },
  actionSheetCancel: {
    minHeight: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.cardAlt,
  },
  actionSheetCancelText: {
    color: JourneyPalette.ink,
    fontWeight: '800',
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
