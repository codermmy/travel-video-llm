import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EventEditSheet } from '@/components/event/EventEditSheet';
import { EventJourneyChapterCard } from '@/components/event/EventJourneyChapterCard';
import { EventPhotoManagerSheet } from '@/components/event/EventPhotoManagerSheet';
import { eventApi } from '@/services/api/eventApi';
import { taskApi } from '@/services/api/taskApi';
import { generateSlideshowPreviewVideo } from '@/services/slideshow/slideshowExportService';
import { buildScenes } from '@/services/slideshow/slideshowSceneBuilder';
import { usePhotoViewerStore } from '@/stores/photoViewerStore';
import { useSlideshowStore } from '@/stores/slideshowStore';
import { JourneyPalette } from '@/styles/colors';
import type { EventDetail } from '@/types/event';
import { resolveCoverCandidateFromPhotos } from '@/utils/mediaRefs';

const PREVIEW_PRIME_SLIDE_DURATION_MS = 3200;
const DEFAULT_EYEBROW = 'MARCH 2026 · HANGZHOU';
const EVENT_TITLE_FALLBACK = '未命名回忆';
const STORY_FALLBACK = '这段回忆还没有生成故事。';
const CHAPTER_TITLE_FALLBACK = '未命名章节';
const CHAPTER_DESCRIPTION_FALLBACK = '这段章节还没有正文描述。';

type StatusNotice = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  body: string;
  iconColor: string;
  backgroundColor: string;
};

function normalizeCopy(text?: string | null): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function resolveMonthLabel(timestamp?: string | null): string | null {
  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
}

function resolveCityLabel(event: EventDetail): string | null {
  const source = normalizeCopy(event.locationName) || normalizeCopy(event.detailedLocation);
  if (!source) {
    return null;
  }

  const city = source.split(/[·•｜|,，/]/)[0]?.trim() || source;
  return city ? city.toUpperCase() : null;
}

function resolveEyebrow(event: EventDetail): string {
  const monthLabel = resolveMonthLabel(event.startTime || event.endTime);
  const cityLabel = resolveCityLabel(event);

  if (!monthLabel || !cityLabel) {
    return DEFAULT_EYEBROW;
  }

  return `${monthLabel} · ${cityLabel}`;
}

function resolveStoryText(event: EventDetail): string {
  return normalizeCopy(event.fullStory) || normalizeCopy(event.storyText) || STORY_FALLBACK;
}

function buildStatusNotice(event: EventDetail): StatusNotice | null {
  if (event.status === 'ai_failed') {
    return {
      icon: 'alert-circle-outline',
      title: '最近一次生成失败',
      body: event.aiError || '可以稍后从菜单里重新生成故事。',
      iconColor: JourneyPalette.danger,
      backgroundColor: JourneyPalette.dangerSoft,
    };
  }

  if (event.status === 'waiting_for_vision') {
    return {
      icon: 'progress-clock',
      title: '照片仍在整理',
      body: '端侧识别完成后会自动更新故事。',
      iconColor: JourneyPalette.inkSoft,
      backgroundColor: JourneyPalette.surfaceVariant,
    };
  }

  if (
    event.storyFreshness === 'stale' ||
    event.slideshowFreshness === 'stale' ||
    event.hasPendingStructureChanges
  ) {
    return {
      icon: 'update',
      title: '内容待自动更新',
      body: '照片或事件刚有变更，系统会在后台自动刷新。',
      iconColor: JourneyPalette.warning,
      backgroundColor: JourneyPalette.warningSoft,
    };
  }

  return null;
}

export default function EventDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ eventId: string }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [coverFailed, setCoverFailed] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isPhotoManagerVisible, setIsPhotoManagerVisible] = useState(false);
  const [photoManagerEntryMode, setPhotoManagerEntryMode] = useState<'browse' | 'move-target'>(
    'browse',
  );
  const [isMoreActionsVisible, setIsMoreActionsVisible] = useState(false);
  const [expandedChapterId, setExpandedChapterId] = useState<string | null>(null);
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
    }).catch((previewError) => {
      previewPrimeKeyRef.current = null;
      console.warn('[event-detail] failed to warm slideshow preview video', previewError);
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
          titleText: normalizeCopy(chapter.chapterTitle) || CHAPTER_TITLE_FALLBACK,
          descriptionText:
            normalizeCopy(chapter.chapterStory) ||
            normalizeCopy(chapter.chapterIntro) ||
            normalizeCopy(chapter.chapterSummary) ||
            CHAPTER_DESCRIPTION_FALLBACK,
        };
      });
  }, [event]);

  const automaticCover = useMemo(() => {
    if (!event) {
      return { photoId: null, uri: null };
    }
    return resolveCoverCandidateFromPhotos(event.photos, [event.coverPhotoId]);
  }, [event]);

  const coverUri = event?.localCoverUri ?? automaticCover.uri ?? event?.coverPhotoUrl ?? null;
  const eyebrowText = useMemo(() => (event ? resolveEyebrow(event) : DEFAULT_EYEBROW), [event]);
  const displayTitle = useMemo(
    () => (event ? normalizeCopy(event.title) || EVENT_TITLE_FALLBACK : EVENT_TITLE_FALLBACK),
    [event],
  );
  const storyText = useMemo(() => (event ? resolveStoryText(event) : STORY_FALLBACK), [event]);
  const statusNotice = useMemo(() => (event ? buildStatusNotice(event) : null), [event]);

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

  const openMoreActions = useCallback(() => {
    setIsMoreActionsVisible(true);
  }, []);

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
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <View style={styles.hero}>
          {coverUri && !coverFailed ? (
            <Image
              source={{ uri: coverUri }}
              style={styles.heroImage}
              resizeMode="cover"
              onError={() => setCoverFailed(true)}
            />
          ) : (
            <LinearGradient colors={['#D8E1EC', '#BAC8DA']} style={styles.heroFallback}>
              <MaterialCommunityIcons
                name="image-filter-hdr"
                size={42}
                color="rgba(255,255,255,0.92)"
              />
              <Text style={styles.heroFallbackText}>暂无封面图片</Text>
            </LinearGradient>
          )}

          <LinearGradient
            colors={['rgba(0, 0, 0, 0.18)', 'rgba(0, 0, 0, 0.36)', 'rgba(0, 0, 0, 0.72)']}
            style={styles.heroOverlay}
          />

          <View style={styles.heroTopBar}>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => [styles.heroControlButton, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="arrow-left" size={20} color={JourneyPalette.white} />
            </Pressable>

            <Pressable
              onPress={openMoreActions}
              style={({ pressed }) => [styles.heroControlButton, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons
                name="dots-horizontal"
                size={20}
                color={JourneyPalette.white}
              />
            </Pressable>
          </View>

          <View style={styles.playEntry}>
            <Pressable
              onPress={onPlaySlideshow}
              style={({ pressed }) => [styles.playButton, pressed && styles.pressed]}
            >
              <MaterialCommunityIcons name="play" size={34} color={JourneyPalette.white} />
            </Pressable>
            <Text style={styles.playLabel}>Play Memory</Text>
          </View>
        </View>

        <View style={styles.contentSheet}>
          <Text style={styles.eyebrow}>{eyebrowText}</Text>
          <Text numberOfLines={2} style={styles.pageTitle}>
            {displayTitle}
          </Text>
          <Text style={styles.storyText}>{storyText}</Text>

          {chapterSections.length > 0 ? (
            <>
              <Text style={styles.sectionLabel}>故事章节</Text>
              <View style={styles.chapterList}>
                {chapterSections.map(({ chapter, chapterPhotos, titleText, descriptionText }) => (
                  <EventJourneyChapterCard
                    key={chapter.id}
                    chapter={{
                      ...chapter,
                      chapterTitle: titleText,
                    }}
                    photos={chapterPhotos}
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
            </>
          ) : null}

          {statusNotice ? (
            <View style={[styles.noticeCard, { backgroundColor: statusNotice.backgroundColor }]}>
              <MaterialCommunityIcons
                name={statusNotice.icon}
                size={18}
                color={statusNotice.iconColor}
              />
              <View style={styles.noticeCopy}>
                <Text style={styles.noticeTitle}>{statusNotice.title}</Text>
                <Text style={styles.noticeText}>{statusNotice.body}</Text>
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <EventEditSheet
        visible={isEditModalVisible}
        event={event}
        onClose={() => setIsEditModalVisible(false)}
        onSaved={(message) => {
          setIsEditModalVisible(false);
          void loadDetail();
          Alert.alert('已保存', message || '事件基础信息已更新。');
        }}
        onChanged={() => {
          void loadDetail();
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
        <View style={styles.menuBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setIsMoreActionsVisible(false)}
          />

          <View style={styles.menuSheet}>
            <View style={styles.menuHandle} />

            <Pressable
              style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
              onPress={() => {
                setIsMoreActionsVisible(false);
                openEditModal();
              }}
            >
              <MaterialCommunityIcons name="pencil-outline" size={24} color={JourneyPalette.ink} />
              <Text style={styles.menuRowText}>重命名回忆</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
              onPress={openPhotoManager}
            >
              <MaterialCommunityIcons
                name="image-multiple-outline"
                size={24}
                color={JourneyPalette.ink}
              />
              <Text style={styles.menuRowText}>管理照片</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.menuRow,
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
                <ActivityIndicator size="small" color={JourneyPalette.ink} />
              ) : (
                <MaterialCommunityIcons name="refresh" size={24} color={JourneyPalette.ink} />
              )}
              <Text style={styles.menuRowText}>重新生成故事</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
              onPress={() => {
                setIsMoreActionsVisible(false);
                confirmDeleteEvent();
              }}
            >
              <MaterialCommunityIcons
                name="trash-can-outline"
                size={24}
                color={JourneyPalette.danger}
              />
              <Text style={[styles.menuRowText, styles.menuRowTextDanger]}>删除这段回忆</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: JourneyPalette.surfaceVariant,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 56,
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
  hero: {
    height: 480,
    backgroundColor: JourneyPalette.cardMuted,
    position: 'relative',
    overflow: 'hidden',
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
    marginTop: 10,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  heroTopBar: {
    position: 'absolute',
    top: 54,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroControlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2, 6, 23, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  playEntry: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    width: 180,
    alignItems: 'center',
    transform: [{ translateX: -90 }, { translateY: -56 }],
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    marginBottom: 16,
  },
  playLabel: {
    color: JourneyPalette.white,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2,
  },
  contentSheet: {
    marginTop: -40,
    backgroundColor: JourneyPalette.background,
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    paddingTop: 40,
    paddingHorizontal: 28,
    paddingBottom: 40,
  },
  eyebrow: {
    marginBottom: 12,
    color: JourneyPalette.muted,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  pageTitle: {
    marginBottom: 24,
    color: JourneyPalette.ink,
    fontSize: 36,
    lineHeight: 40,
    fontWeight: '900',
    letterSpacing: -1.5,
  },
  storyText: {
    marginBottom: 40,
    color: JourneyPalette.inkSoft,
    fontSize: 17,
    lineHeight: 31,
    fontWeight: '500',
  },
  sectionLabel: {
    marginBottom: 20,
    color: JourneyPalette.ink,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  chapterList: {
    gap: 20,
  },
  noticeCard: {
    marginTop: 32,
    borderRadius: 28,
    padding: 24,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  noticeCopy: {
    flex: 1,
    gap: 6,
  },
  noticeTitle: {
    color: JourneyPalette.ink,
    fontSize: 17,
    fontWeight: '900',
    letterSpacing: -0.4,
  },
  noticeText: {
    color: JourneyPalette.inkSoft,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '500',
  },
  menuBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(2, 6, 23, 0.4)',
  },
  menuSheet: {
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    backgroundColor: JourneyPalette.background,
    paddingTop: 32,
    paddingHorizontal: 24,
    paddingBottom: 48,
  },
  menuHandle: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: JourneyPalette.lineStrong,
    marginBottom: 24,
  },
  menuRow: {
    paddingVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  menuRowText: {
    color: JourneyPalette.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  menuRowTextDanger: {
    color: JourneyPalette.danger,
  },
  disabledAction: {
    opacity: 0.45,
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
    color: JourneyPalette.white,
    fontWeight: '800',
  },
  ghostBtn: {
    marginTop: 10,
    minWidth: 132,
    minHeight: 46,
    borderRadius: 999,
    backgroundColor: JourneyPalette.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnText: {
    color: JourneyPalette.ink,
    fontWeight: '800',
  },
  pressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.7,
  },
});
