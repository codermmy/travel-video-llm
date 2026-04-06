import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { EventEditSheet } from '@/components/event/EventEditSheet';
import { EventJourneyChapterCard } from '@/components/event/EventJourneyChapterCard';
import { eventApi } from '@/services/api/eventApi';
import { taskApi } from '@/services/api/taskApi';
import { generateSlideshowPreviewVideo } from '@/services/slideshow/slideshowExportService';
import { buildScenes } from '@/services/slideshow/slideshowSceneBuilder';
import { usePhotoViewerStore } from '@/stores/photoViewerStore';
import { useSlideshowStore } from '@/stores/slideshowStore';
import { JourneyPalette } from '@/styles/colors';
import type { EventChapter } from '@/types/chapter';
import type { EventDetail } from '@/types/event';
import { getCompactLocationText } from '@/utils/locationDisplay';
import { consumeEventPhotoManagerResult } from '@/utils/photoRouteResults';
import { resolveCoverCandidateFromPhotos } from '@/utils/mediaRefs';

const PREVIEW_PRIME_SLIDE_DURATION_MS = 3200;
const SHEET_STOP_RATIOS = [0.65, 0.33, 0.05] as const;
const DEFAULT_EVENT_CONTEXT = '2026 April · Hangzhou';
const DEFAULT_HERO_SUBTITLE = '这一程不急着抵达，只让旅途把心绪放慢。';
const DEFAULT_HERO_TITLE = '这段旅程在风里慢慢展开';
const DEFAULT_READING_TITLE = '风从湖面掠过，故事在这一页开始慢下来。';
const STORY_FALLBACK = '这段回忆还没有生成故事。';
const CHAPTER_TITLE_FALLBACK = '未命名章节';
const CHAPTER_BODY_FALLBACK = '这段章节还没有正文描述。';
const HERO_PLAY_BUTTON_SIZE = 76;

type SheetStop = 1 | 2 | 3;

type ChapterSection = {
  chapter: EventChapter;
  chapterNumber: number;
  chapterPhotos: EventDetail['photos'];
  titleText: string;
  summaryText: string;
  bodyText: string;
};

function normalizeInlineCopy(text?: string | null): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function splitParagraphs(text?: string | null): string[] {
  return (text || '')
    .replace(/\r/g, '')
    .split(/\n{2,}/)
    .map((paragraph) =>
      paragraph
        .replace(/\s*\n\s*/g, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);
}

function joinParagraphs(text?: string | null): string {
  return splitParagraphs(text).join('\n\n');
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getNearestStopIndex(offset: number, offsets: readonly number[]): number {
  return offsets.reduce((nearestIndex, stopOffset, index, values) => {
    const nearestDistance = Math.abs(values[nearestIndex] - offset);
    const nextDistance = Math.abs(stopOffset - offset);
    return nextDistance < nearestDistance ? index : nearestIndex;
  }, 0);
}

function resolveDateLabel(timestamp?: string | null): string | null {
  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const monthLabel = date.toLocaleDateString('en-US', { month: 'long' });
  return `${date.getFullYear()} ${monthLabel}`;
}

function compactLocationLabel(value: string): string {
  const source = value.split(/[·•｜|,，/]/)[0]?.trim() || value.trim();
  if (!source) {
    return '';
  }

  if (/[\u4e00-\u9fff]/.test(source)) {
    const cityMatch = source.match(/^(.+?)(?:市|州|盟|地区)/);
    if (cityMatch?.[1]) {
      return cityMatch[1];
    }
  }

  return source;
}

function resolveLocationLabel(event: EventDetail): string | null {
  const source =
    normalizeInlineCopy(getCompactLocationText(event)) ||
    normalizeInlineCopy(event.locationName) ||
    normalizeInlineCopy(event.detailedLocation);
  if (!source) {
    return null;
  }

  const label = compactLocationLabel(source);
  return label || null;
}

function resolveEventContextLabel(event: EventDetail): string {
  const dateLabel = resolveDateLabel(event.startTime || event.endTime);
  const locationLabel = resolveLocationLabel(event);

  if (!dateLabel || !locationLabel) {
    return DEFAULT_EVENT_CONTEXT;
  }

  return `${dateLabel} · ${locationLabel}`;
}

function resolveStorySource(event: EventDetail): string | null {
  return joinParagraphs(event.fullStory) || joinParagraphs(event.storyText) || null;
}

function trimStorySnippet(text?: string | null, maxChars = 60): string {
  const normalized = normalizeInlineCopy(text);
  if (!normalized) {
    return '';
  }
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return normalized
    .slice(0, maxChars)
    .replace(/[，。；、,.!?！？\s]+$/g, '')
    .trim();
}

function resolveHeroTitle(event: EventDetail): string {
  return normalizeInlineCopy(event.heroTitle) || DEFAULT_HERO_TITLE;
}

function resolveHeroSubtitle(event: EventDetail): string {
  return normalizeInlineCopy(event.heroSummary) || DEFAULT_HERO_SUBTITLE;
}

function resolveStoryText(event: EventDetail): string {
  return resolveStorySource(event) || STORY_FALLBACK;
}

function resolveReadingTitle(event: EventDetail): string {
  return normalizeInlineCopy(event.title) || DEFAULT_READING_TITLE;
}

function resolveChapterShortStory(chapter: EventChapter): string {
  return (
    trimStorySnippet(chapter.chapterStory) ||
    trimStorySnippet(chapter.chapterSummary) ||
    trimStorySnippet(chapter.chapterIntro) ||
    CHAPTER_BODY_FALLBACK
  );
}

export default function EventDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ eventId: string }>();
  const eventId = Array.isArray(params.eventId) ? params.eventId[0] : params.eventId;
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [coverFailed, setCoverFailed] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [isMoreActionsVisible, setIsMoreActionsVisible] = useState(false);
  const [isStoryExpanded, setIsStoryExpanded] = useState(false);
  const [sheetStop, setSheetStop] = useState<SheetStop>(1);
  const [isSheetDragging, setIsSheetDragging] = useState(false);
  const [expandedChapterIds, setExpandedChapterIds] = useState<Record<string, boolean>>({});
  const previewPrimeKeyRef = useRef<string | null>(null);
  const dragStartOffsetRef = useRef(0);
  const dragStartStopIndexRef = useRef(0);
  const sheetScrollRef = useRef<ScrollView | null>(null);
  const sheetScrollOffsetRef = useRef(0);

  const setPhotoViewerSession = usePhotoViewerStore((state) => state.setSession);
  const setSlideshowSession = useSlideshowStore((state) => state.setSession);

  const stopOffsets = useMemo(
    () => SHEET_STOP_RATIOS.map((ratio) => windowHeight * ratio),
    [windowHeight],
  );
  const sheetTop = useRef(new Animated.Value(stopOffsets[0])).current;
  const sheetTopValueRef = useRef(stopOffsets[0]);
  const lastWindowHeightRef = useRef(windowHeight);

  useEffect(() => {
    const listenerId = sheetTop.addListener(({ value }) => {
      sheetTopValueRef.current = value;
    });

    return () => {
      sheetTop.removeListener(listenerId);
    };
  }, [sheetTop]);

  useEffect(() => {
    if (lastWindowHeightRef.current === windowHeight) {
      return;
    }

    lastWindowHeightRef.current = windowHeight;
    const nextOffset = stopOffsets[sheetStop - 1];
    sheetTop.stopAnimation();
    sheetTop.setValue(nextOffset);
    sheetTopValueRef.current = nextOffset;
  }, [sheetStop, sheetTop, stopOffsets, windowHeight]);

  const animateSheetToStop = useCallback(
    (nextStop: SheetStop, animated = true) => {
      const nextOffset = stopOffsets[nextStop - 1];
      setSheetStop(nextStop);

      if (!animated) {
        sheetTop.stopAnimation();
        sheetTop.setValue(nextOffset);
        sheetTopValueRef.current = nextOffset;
        return;
      }

      Animated.timing(sheetTop, {
        toValue: nextOffset,
        duration: 420,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: false,
      }).start();
    },
    [sheetTop, stopOffsets],
  );

  const collapseSheetToDefault = useCallback(
    (animated = true) => {
      sheetScrollOffsetRef.current = 0;
      sheetScrollRef.current?.scrollTo({ y: 0, animated: false });
      animateSheetToStop(1, animated);
    },
    [animateSheetToStop],
  );

  const finishSheetDrag = useCallback(
    (deltaY: number) => {
      setIsSheetDragging(false);

      const nearestStopIndex = getNearestStopIndex(sheetTopValueRef.current, stopOffsets);
      let nextStopIndex = nearestStopIndex;

      if (Math.abs(deltaY) >= 16) {
        if (deltaY < 0 && nearestStopIndex <= dragStartStopIndexRef.current) {
          nextStopIndex = Math.min(stopOffsets.length - 1, dragStartStopIndexRef.current + 1);
        } else if (deltaY > 0 && nearestStopIndex >= dragStartStopIndexRef.current) {
          nextStopIndex = Math.max(0, dragStartStopIndexRef.current - 1);
        }
      }

      animateSheetToStop((nextStopIndex + 1) as SheetStop);
    },
    [animateSheetToStop, stopOffsets],
  );

  const finishSheetContentLift = useCallback(
    (deltaY: number) => {
      setIsSheetDragging(false);
      if (deltaY < -16 || sheetTopValueRef.current <= (stopOffsets[0] + stopOffsets[1]) / 2) {
        animateSheetToStop(2);
        return;
      }
      animateSheetToStop(1);
    },
    [animateSheetToStop, stopOffsets],
  );

  const finishSheetContentDrop = useCallback(
    (deltaY: number) => {
      setIsSheetDragging(false);
      if (deltaY > 18 || sheetTopValueRef.current >= (stopOffsets[0] + stopOffsets[1]) / 2) {
        collapseSheetToDefault();
        return;
      }
      animateSheetToStop(2);
    },
    [animateSheetToStop, collapseSheetToDefault, stopOffsets],
  );

  const sheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gestureState) => {
          const verticalDistance = Math.abs(gestureState.dy);
          const horizontalDistance = Math.abs(gestureState.dx);
          return verticalDistance > horizontalDistance && verticalDistance > 3;
        },
        onPanResponderGrant: () => {
          dragStartOffsetRef.current = sheetTopValueRef.current;
          dragStartStopIndexRef.current = sheetStop - 1;
          setIsSheetDragging(true);
          sheetTop.stopAnimation();
        },
        onPanResponderMove: (_event, gestureState) => {
          const nextOffset = clamp(
            dragStartOffsetRef.current + gestureState.dy,
            stopOffsets[2],
            stopOffsets[0],
          );
          sheetTop.setValue(nextOffset);
        },
        onPanResponderRelease: (_event, gestureState) => {
          finishSheetDrag(gestureState.dy);
        },
        onPanResponderTerminate: (_event, gestureState) => {
          finishSheetDrag(gestureState.dy);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [finishSheetDrag, sheetStop, sheetTop, stopOffsets],
  );

  const sheetContentPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gestureState) => {
          if (sheetStop !== 1) {
            return false;
          }
          const verticalDistance = Math.abs(gestureState.dy);
          const horizontalDistance = Math.abs(gestureState.dx);
          return gestureState.dy < -4 && verticalDistance > horizontalDistance;
        },
        onPanResponderGrant: () => {
          dragStartOffsetRef.current = sheetTopValueRef.current;
          setIsSheetDragging(true);
          sheetTop.stopAnimation();
        },
        onPanResponderMove: (_event, gestureState) => {
          const nextOffset = clamp(
            dragStartOffsetRef.current + gestureState.dy,
            stopOffsets[1],
            stopOffsets[0],
          );
          sheetTop.setValue(nextOffset);
        },
        onPanResponderRelease: (_event, gestureState) => {
          finishSheetContentLift(gestureState.dy);
        },
        onPanResponderTerminate: (_event, gestureState) => {
          finishSheetContentLift(gestureState.dy);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [finishSheetContentLift, sheetStop, sheetTop, stopOffsets],
  );

  const sheetContentCollapsePanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_event, gestureState) => {
          if (sheetStop !== 2 || sheetScrollOffsetRef.current > 2) {
            return false;
          }
          const verticalDistance = Math.abs(gestureState.dy);
          const horizontalDistance = Math.abs(gestureState.dx);
          return gestureState.dy > 4 && verticalDistance > horizontalDistance;
        },
        onPanResponderGrant: () => {
          dragStartOffsetRef.current = sheetTopValueRef.current;
          setIsSheetDragging(true);
          sheetTop.stopAnimation();
        },
        onPanResponderMove: (_event, gestureState) => {
          const nextOffset = clamp(
            dragStartOffsetRef.current + gestureState.dy,
            stopOffsets[1],
            stopOffsets[0],
          );
          sheetTop.setValue(nextOffset);
        },
        onPanResponderRelease: (_event, gestureState) => {
          finishSheetContentDrop(gestureState.dy);
        },
        onPanResponderTerminate: (_event, gestureState) => {
          finishSheetContentDrop(gestureState.dy);
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [finishSheetContentDrop, sheetStop, sheetTop, stopOffsets],
  );

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

  useFocusEffect(
    useCallback(() => {
      if (!eventId) {
        return;
      }

      const result = consumeEventPhotoManagerResult(eventId);
      if (!result) {
        return;
      }

      if (result.deletedCurrentEvent) {
        router.back();
        return;
      }

      void loadDetail();
    }, [eventId, loadDetail, router]),
  );

  useEffect(() => {
    if (!event) {
      return;
    }

    setIsStoryExpanded(false);
    setExpandedChapterIds({});
    setIsSheetDragging(false);
    sheetScrollOffsetRef.current = 0;
    sheetScrollRef.current?.scrollTo({ y: 0, animated: false });
    animateSheetToStop(1, false);
  }, [animateSheetToStop, event]);

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

  const chapterSections = useMemo<ChapterSection[]>(() => {
    if (!event) {
      return [];
    }

    return [...event.chapters]
      .sort((left, right) => left.photoStartIndex - right.photoStartIndex)
      .map((chapter, index) => {
        const chapterPhotos = event.photos.slice(
          chapter.photoStartIndex,
          chapter.photoEndIndex + 1,
        );

        return {
          chapter,
          chapterNumber: index + 1,
          chapterPhotos,
          titleText: normalizeInlineCopy(chapter.chapterTitle) || CHAPTER_TITLE_FALLBACK,
          summaryText: resolveChapterShortStory(chapter),
          bodyText: resolveChapterShortStory(chapter),
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
  const eventContextText = useMemo(
    () => (event ? resolveEventContextLabel(event) : DEFAULT_EVENT_CONTEXT),
    [event],
  );
  const heroTitle = useMemo(() => (event ? resolveHeroTitle(event) : DEFAULT_HERO_TITLE), [event]);
  const readingTitle = useMemo(
    () => (event ? resolveReadingTitle(event) : DEFAULT_READING_TITLE),
    [event],
  );
  const heroSubtitle = useMemo(
    () => (event ? resolveHeroSubtitle(event) : DEFAULT_HERO_SUBTITLE),
    [event],
  );
  const storyText = useMemo(() => (event ? resolveStoryText(event) : STORY_FALLBACK), [event]);

  const openEditModal = useCallback(() => {
    if (!event) {
      return;
    }
    setIsEditModalVisible(true);
  }, [event]);

  const openPhotoManager = useCallback(() => {
    if (!eventId) {
      return;
    }
    setIsMoreActionsVisible(false);
    router.push({
      pathname: '/events/[eventId]/photos',
      params: { eventId },
    });
  }, [eventId, router]);

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

  const topControlTop = Math.max(insets.top + 12, 56);
  const heroPlayTop = Math.max(topControlTop + 84, stopOffsets[1] - HERO_PLAY_BUTTON_SIZE - 12);
  const heroCopyTop = Math.max(stopOffsets[1] + 8, heroPlayTop + HERO_PLAY_BUTTON_SIZE + 12);
  const sheetRadius = sheetStop === 1 ? 38 : sheetStop === 2 ? 34 : 30;
  const showVideoIndicator = sheetStop !== 1;
  const isSheetCompact = sheetStop === 3;
  const sheetScrollEnabled = sheetStop !== 1;
  const showHeroCollapseLayer = sheetStop >= 2;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.heroLayer}>
        {coverUri && !coverFailed ? (
          <Image
            source={{ uri: coverUri }}
            style={styles.heroImage}
            resizeMode="cover"
            onError={() => setCoverFailed(true)}
          />
        ) : (
          <LinearGradient colors={['#0F172A', '#1E293B', '#334155']} style={styles.heroFallback}>
            <MaterialCommunityIcons
              name="image-filter-hdr"
              size={44}
              color="rgba(255,255,255,0.94)"
            />
          </LinearGradient>
        )}

        <LinearGradient
          colors={['rgba(2, 6, 23, 0.12)', 'rgba(2, 6, 23, 0.42)', 'rgba(2, 6, 23, 0.82)']}
          locations={[0, 0.36, 1]}
          style={styles.heroOverlay}
        />

        {showHeroCollapseLayer ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="收起故事面板"
            onPress={() => collapseSheetToDefault()}
            style={styles.heroTapDismissLayer}
          />
        ) : null}

        <View style={[styles.topControls, { top: topControlTop }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="返回"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.heroControlButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="arrow-left" size={20} color={JourneyPalette.white} />
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="更多操作"
            onPress={openMoreActions}
            style={({ pressed }) => [styles.heroControlButton, pressed && styles.pressed]}
          >
            <MaterialCommunityIcons name="dots-horizontal" size={20} color={JourneyPalette.white} />
          </Pressable>
        </View>

        <View style={[styles.heroPlayButtonWrap, { top: heroPlayTop }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="播放视频回忆"
            onPress={onPlaySlideshow}
            style={({ pressed }) => [styles.heroPlayButton, pressed && styles.pressed]}
          >
            <View style={styles.heroPlayButtonCore}>
              <MaterialCommunityIcons name="play" size={28} color={JourneyPalette.white} />
            </View>
          </Pressable>
        </View>

        <View pointerEvents="none" style={[styles.heroContent, { top: heroCopyTop }]}>
          <Text numberOfLines={3} style={styles.heroTitle}>
            {heroTitle}
          </Text>
          <Text numberOfLines={2} style={styles.heroSubtitle}>
            {heroSubtitle}
          </Text>
        </View>
      </View>

      <Animated.View
        style={[
          styles.sheet,
          {
            top: sheetTop,
            borderTopLeftRadius: sheetRadius,
            borderTopRightRadius: sheetRadius,
          },
        ]}
      >
        <View style={styles.sheetTopEdge} {...sheetPanResponder.panHandlers} />

        <View
          style={[
            styles.videoIndicator,
            showVideoIndicator ? styles.videoIndicatorVisible : styles.videoIndicatorHidden,
            isSheetCompact ? styles.videoIndicatorCompact : styles.videoIndicatorMid,
          ]}
        />

        <View style={styles.sheetGrabZone} {...sheetPanResponder.panHandlers}>
          <View style={[styles.sheetHandle, isSheetDragging && styles.sheetHandleActive]} />
        </View>

        <View style={styles.sheetScrollContainer}>
          <ScrollView
            ref={sheetScrollRef}
            style={styles.sheetScroll}
            scrollEnabled={sheetScrollEnabled}
            contentInsetAdjustmentBehavior="never"
            showsVerticalScrollIndicator={false}
            onScroll={(event) => {
              sheetScrollOffsetRef.current = Math.max(event.nativeEvent.contentOffset.y, 0);
            }}
            scrollEventThrottle={16}
            contentContainerStyle={[
              styles.sheetScrollContent,
              { paddingBottom: Math.max(insets.bottom + 28, 42) },
            ]}
            {...(sheetStop === 2 ? sheetContentCollapsePanResponder.panHandlers : {})}
          >
            <View>
              <Text style={styles.eyebrow}>{eventContextText}</Text>
              <Text numberOfLines={3} style={styles.sheetTitle}>
                {readingTitle}
              </Text>

              <View style={styles.storyPreview}>
                <Text numberOfLines={isStoryExpanded ? undefined : 3} style={styles.storyCopy}>
                  {storyText}
                </Text>

                {!isStoryExpanded ? (
                  <LinearGradient
                    colors={['rgba(248, 250, 252, 0)', 'rgba(248, 250, 252, 1)']}
                    style={styles.storyFadeMask}
                    pointerEvents="none"
                  />
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={isStoryExpanded ? '收起故事' : '展开故事'}
                  onPress={() => setIsStoryExpanded((previous) => !previous)}
                  style={({ pressed }) => [styles.storyToggle, pressed && styles.pressed]}
                >
                  <MaterialCommunityIcons
                    name="chevron-down"
                    size={20}
                    color={JourneyPalette.ink}
                    style={isStoryExpanded ? styles.toggleIconOpen : null}
                  />
                </Pressable>
              </View>

              {chapterSections.length > 0 ? (
                <View style={styles.chapterList}>
                  {chapterSections.map(
                    ({
                      chapter,
                      chapterNumber,
                      chapterPhotos,
                      titleText,
                      summaryText,
                      bodyText,
                    }) => (
                      <EventJourneyChapterCard
                        key={chapter.id}
                        chapter={{
                          ...chapter,
                          chapterTitle: titleText,
                        }}
                        chapterNumber={chapterNumber}
                        photos={chapterPhotos}
                        summaryText={summaryText}
                        bodyText={bodyText}
                        expanded={Boolean(expandedChapterIds[chapter.id])}
                        onToggle={() => {
                          setExpandedChapterIds((previous) => ({
                            ...previous,
                            [chapter.id]: !previous[chapter.id],
                          }));
                        }}
                        onPhotoPress={(photo, index) => {
                          onPhotoPress(photo, chapter.photoStartIndex + index);
                        }}
                      />
                    ),
                  )}
                </View>
              ) : null}
            </View>
          </ScrollView>

          {sheetStop === 1 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="展开故事面板"
              onPress={() => animateSheetToStop(2)}
              style={styles.sheetPreviewTapOverlay}
              {...sheetContentPanResponder.panHandlers}
            />
          ) : null}
        </View>
      </Animated.View>

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
    backgroundColor: JourneyPalette.ink,
  },
  heroLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: JourneyPalette.ink,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  heroFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  heroTapDismissLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  topControls: {
    position: 'absolute',
    left: 18,
    right: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 3,
  },
  heroControlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(2, 6, 23, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 12px 24px rgba(2, 6, 23, 0.18)',
  },
  heroContent: {
    position: 'absolute',
    left: 24,
    right: 24,
    zIndex: 2,
  },
  heroPlayButtonWrap: {
    position: 'absolute',
    left: 24,
    zIndex: 3,
  },
  heroTitle: {
    color: JourneyPalette.white,
    fontSize: 34,
    lineHeight: 35,
    fontWeight: '900',
    letterSpacing: -1.4,
    marginBottom: 10,
  },
  heroSubtitle: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  heroPlayButton: {
    width: HERO_PLAY_BUTTON_SIZE,
    height: HERO_PLAY_BUTTON_SIZE,
    borderRadius: HERO_PLAY_BUTTON_SIZE / 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(2, 6, 23, 0.24)',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 18px 32px rgba(2, 6, 23, 0.22)',
    flexShrink: 0,
  },
  heroPlayButtonCore: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 4,
    backgroundColor: 'rgba(248, 250, 252, 0.985)',
    overflow: 'hidden',
    boxShadow: '0px 32px 70px rgba(2, 6, 23, 0.22)',
  },
  sheetTopEdge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 18,
    zIndex: 3,
  },
  videoIndicator: {
    alignSelf: 'stretch',
    marginTop: 8,
    borderRadius: 999,
    backgroundColor: 'transparent',
  },
  videoIndicatorVisible: {
    opacity: 1,
  },
  videoIndicatorHidden: {
    opacity: 0,
  },
  videoIndicatorMid: {
    height: 10,
    marginHorizontal: 84,
    backgroundColor: 'rgba(37, 99, 235, 0.32)',
  },
  videoIndicatorCompact: {
    height: 8,
    marginHorizontal: 120,
    backgroundColor: 'rgba(37, 99, 235, 0.42)',
  },
  sheetGrabZone: {
    paddingTop: 10,
    paddingHorizontal: 24,
    paddingBottom: 6,
    alignItems: 'center',
    zIndex: 2,
  },
  sheetHandle: {
    width: 48,
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(71, 85, 105, 0.22)',
  },
  sheetHandleActive: {
    backgroundColor: 'rgba(37, 99, 235, 0.34)',
  },
  sheetScrollContainer: {
    flex: 1,
    position: 'relative',
  },
  sheetScroll: {
    flex: 1,
  },
  sheetPreviewTapOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetScrollContent: {
    paddingTop: 14,
    paddingHorizontal: 24,
  },
  eyebrow: {
    marginBottom: 14,
    color: JourneyPalette.muted,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  sheetTitle: {
    marginBottom: 18,
    color: JourneyPalette.ink,
    fontSize: 34,
    lineHeight: 36,
    fontWeight: '900',
    letterSpacing: -1.8,
  },
  storyPreview: {
    position: 'relative',
    marginBottom: 24,
    paddingBottom: 18,
  },
  storyCopy: {
    color: JourneyPalette.inkSoft,
    fontSize: 16,
    lineHeight: 30,
    fontWeight: '500',
  },
  storyFadeMask: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 18,
    height: 56,
  },
  storyToggle: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
    backgroundColor: 'rgba(255,255,255,0.78)',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0px 12px 24px rgba(15, 23, 42, 0.08)',
  },
  toggleIconOpen: {
    transform: [{ rotate: '180deg' }],
  },
  chapterList: {
    gap: 16,
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
  menuBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(2, 6, 23, 0.42)',
  },
  menuSheet: {
    borderTopLeftRadius: 40,
    borderTopRightRadius: 40,
    backgroundColor: 'rgba(248,250,252,0.98)',
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
