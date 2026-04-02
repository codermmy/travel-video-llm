import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated as RNAnimated,
  AppState,
  Image,
  type LayoutChangeEvent,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Audio, type AVPlaybackSource } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Easing,
  createAnimatedComponent,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { EventChapter } from '@/types/chapter';
import {
  PlaybackState,
  type SlideshowAudioPlan,
  type SlideshowAudioSegment,
  type SlideshowProps,
} from '@/types/slideshow';
import { formatDateTime } from '@/utils/dateUtils';
import { getPhotoOriginalCandidates } from '@/utils/mediaRefs';
import {
  buildSlideshowAudioPlan,
  getAudioSegmentAtPosition,
  getAudioVolumeAtPosition,
} from '@/services/slideshow/slideshowAudioService';
import { exportSlideshowVideo } from '@/services/slideshow/slideshowExportService';
import { buildSlideshowCompositionProfile } from '@/services/slideshow/slideshowCompositionProfile';
import { getSlideshowPhotoSceneLayout } from '@/services/slideshow/slideshowCompositionLayout';
import {
  buildSceneTimeline,
  findTimelineSceneAtPosition,
  getTimelineTotalDurationMs,
} from '@/services/slideshow/slideshowSceneBuilder';

const MotionImage = createAnimatedComponent(Image);

const SPEED_OPTIONS_MS = [2200, 3200, 4800] as const;
const DEFAULT_SLIDE_DURATION_MS = 3200;
const CONTROL_AUTO_HIDE_MS = 3000;
const DEFAULT_LOCAL_BGM = require('../../../assets/audio/default-bgm.wav');
const GENERIC_CAPTION_SET = new Set([
  '旅途瞬间 · 光影流动 · 当下心情',
  '旅途瞬间·光影流动·当下心情',
]);

type MusicSourceStatus = 'loading' | 'remote' | 'fallback' | 'none' | 'error';
type SlideshowSceneType = 'chapter-intro' | 'photo' | 'chapter-summary' | 'collage';
type TransitionPreset =
  | 'chapter-fade'
  | 'dissolve'
  | 'drift-left'
  | 'drift-right'
  | 'zoom-in'
  | 'montage-rise';

type SlideshowScene = {
  id: string;
  type: SlideshowSceneType;
  chapter: EventChapter | null;
  photo: SlideshowProps['photos'][number] | null;
  photos: SlideshowProps['photos'];
  photoIndex: number;
  title: string;
  body: string | null;
  minimumDurationMs: number;
  transitionPreset: TransitionPreset;
  subtitleDelayMs: number;
};

function normalizeText(text?: string | null): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function getPhotoUri(
  photo: SlideshowProps['photos'][number] | null | undefined,
  failedCandidateIndex = 0,
): string | null {
  return getPhotoOriginalCandidates(photo)[failedCandidateIndex] ?? null;
}

function isGenericCaption(input?: string | null): boolean {
  if (!input) {
    return false;
  }
  const normalized = input.replace(/\s+/g, '').trim();
  return GENERIC_CAPTION_SET.has(normalized);
}

function getMusicStatusText(status: MusicSourceStatus): string {
  switch (status) {
    case 'remote':
      return '音乐：远程资源';
    case 'fallback':
      return '音乐：本地默认';
    case 'none':
      return '音乐：无可用音源';
    case 'error':
      return '音乐：加载失败';
    case 'loading':
    default:
      return '音乐：加载中';
  }
}

function formatDurationLabel(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function computeReadingDuration(text: string, minMs: number, maxMs: number): number {
  const charCount = normalizeText(text).length;
  const estimate = 1400 + charCount * 95;
  return Math.max(minMs, Math.min(maxMs, estimate));
}

function buildPhotoSubtitle(
  photo: SlideshowProps['photos'][number] | null | undefined,
  chapter: EventChapter | null,
): string | null {
  const microStory = normalizeText(photo?.microStory);
  if (microStory) {
    return microStory;
  }

  const caption = normalizeText(photo?.caption);
  if (caption && !isGenericCaption(caption)) {
    return caption;
  }

  const slideshowCaption = normalizeText(chapter?.slideshowCaption);
  if (slideshowCaption) {
    return slideshowCaption;
  }

  return null;
}

function getChapterTitle(chapter: EventChapter | null | undefined): string {
  if (!chapter) {
    return '旅行片段';
  }
  return chapter.chapterTitle?.trim() || `第 ${chapter.chapterIndex} 章`;
}

function getSceneDisplayPhoto(
  scene: SlideshowScene | null | undefined,
  photos: SlideshowProps['photos'],
) {
  if (!scene) {
    return null;
  }
  return scene.photos[0] ?? scene.photo ?? photos[scene.photoIndex] ?? null;
}

function getSceneTypeLabel(scene: SlideshowScene | null): string {
  if (!scene) {
    return '';
  }
  if (scene.type === 'chapter-intro') {
    return '章节序幕';
  }
  if (scene.type === 'chapter-summary') {
    return '章节尾声';
  }
  if (scene.type === 'collage') {
    return '片段蒙太奇';
  }
  return '';
}

function getPhotoTransitionPreset(
  photoIndex: number,
  chapter: EventChapter | null,
): TransitionPreset {
  const seed = (chapter?.chapterIndex ?? 0) + photoIndex;
  const presets: TransitionPreset[] = ['dissolve', 'drift-left', 'drift-right', 'zoom-in'];
  return presets[seed % presets.length] ?? 'dissolve';
}

function getTransitionConfig(preset: TransitionPreset): {
  durationMs: number;
  subtitleDelayMs: number;
  incoming: { opacity: number; translateX: number; translateY: number; scale: number };
  outgoing: { opacity: number; translateX: number; translateY: number; scale: number };
} {
  switch (preset) {
    case 'chapter-fade':
      return {
        durationMs: 520,
        subtitleDelayMs: 0,
        incoming: { opacity: 0, translateX: 0, translateY: 16, scale: 0.985 },
        outgoing: { opacity: 0, translateX: 0, translateY: -10, scale: 1.015 },
      };
    case 'drift-left':
      return {
        durationMs: 420,
        subtitleDelayMs: 260,
        incoming: { opacity: 0, translateX: 22, translateY: 0, scale: 1.02 },
        outgoing: { opacity: 0, translateX: -18, translateY: 0, scale: 0.995 },
      };
    case 'drift-right':
      return {
        durationMs: 420,
        subtitleDelayMs: 260,
        incoming: { opacity: 0, translateX: -22, translateY: 0, scale: 1.02 },
        outgoing: { opacity: 0, translateX: 18, translateY: 0, scale: 0.995 },
      };
    case 'zoom-in':
      return {
        durationMs: 460,
        subtitleDelayMs: 300,
        incoming: { opacity: 0, translateX: 0, translateY: 0, scale: 1.08 },
        outgoing: { opacity: 0, translateX: 0, translateY: 0, scale: 0.96 },
      };
    case 'montage-rise':
      return {
        durationMs: 520,
        subtitleDelayMs: 0,
        incoming: { opacity: 0, translateX: 0, translateY: 22, scale: 0.98 },
        outgoing: { opacity: 0, translateX: 0, translateY: -18, scale: 1.02 },
      };
    case 'dissolve':
    default:
      return {
        durationMs: 380,
        subtitleDelayMs: 220,
        incoming: { opacity: 0, translateX: 0, translateY: 0, scale: 1.01 },
        outgoing: { opacity: 0, translateX: 0, translateY: 0, scale: 1 },
      };
  }
}

function pickCollagePhotos(chapterPhotos: SlideshowProps['photos']): SlideshowProps['photos'] {
  if (chapterPhotos.length <= 3) {
    return chapterPhotos;
  }

  const middleIndex = Math.floor(chapterPhotos.length / 2);
  const selected = [
    chapterPhotos[0],
    chapterPhotos[middleIndex],
    chapterPhotos[chapterPhotos.length - 1],
  ].filter(Boolean);

  return Array.from(new Map(selected.map((photo) => [photo.id, photo])).values());
}

function buildScenes(
  photos: SlideshowProps['photos'],
  chapters: EventChapter[] | undefined,
): SlideshowScene[] {
  if (photos.length === 0) {
    return [];
  }

  const safeChapters = [...(chapters || [])].sort(
    (left, right) => left.photoStartIndex - right.photoStartIndex,
  );
  if (safeChapters.length === 0) {
    return photos.map((photo, photoIndex) => {
      const subtitle = buildPhotoSubtitle(photo, null);
      return {
        id: `photo-${photo.id}`,
        type: 'photo' as const,
        chapter: null,
        photo,
        photos: [photo],
        photoIndex,
        title: '',
        body: subtitle,
        minimumDurationMs: subtitle
          ? computeReadingDuration(subtitle, 2400, 4600)
          : DEFAULT_SLIDE_DURATION_MS,
        transitionPreset: getPhotoTransitionPreset(photoIndex, null),
        subtitleDelayMs: 240,
      };
    });
  }

  const chapterStartMap = new Map<number, EventChapter>();
  const chapterEndMap = new Map<number, EventChapter>();
  const chapterByPhotoIndex = new Map<number, EventChapter>();

  for (const chapter of safeChapters) {
    chapterStartMap.set(chapter.photoStartIndex, chapter);
    chapterEndMap.set(chapter.photoEndIndex, chapter);
    for (let index = chapter.photoStartIndex; index <= chapter.photoEndIndex; index += 1) {
      chapterByPhotoIndex.set(index, chapter);
    }
  }

  const scenes: SlideshowScene[] = [];

  for (let photoIndex = 0; photoIndex < photos.length; photoIndex += 1) {
    const chapterAtStart = chapterStartMap.get(photoIndex);
    if (chapterAtStart) {
      const chapterPhotos = photos.slice(
        chapterAtStart.photoStartIndex,
        chapterAtStart.photoEndIndex + 1,
      );
      const introText =
        normalizeText(chapterAtStart.chapterIntro) ||
        normalizeText(chapterAtStart.slideshowCaption);
      if (introText) {
        scenes.push({
          id: `chapter-intro-${chapterAtStart.id}`,
          type: 'chapter-intro',
          chapter: chapterAtStart,
          photo: chapterPhotos[0] ?? null,
          photos: chapterPhotos.slice(0, 1),
          photoIndex,
          title: getChapterTitle(chapterAtStart),
          body: introText,
          minimumDurationMs: computeReadingDuration(introText, 2800, 5000),
          transitionPreset: 'chapter-fade',
          subtitleDelayMs: 0,
        });
      }

      const collagePhotos = pickCollagePhotos(chapterPhotos);
      if (collagePhotos.length >= 2) {
        scenes.push({
          id: `chapter-collage-${chapterAtStart.id}`,
          type: 'collage',
          chapter: chapterAtStart,
          photo: collagePhotos[0] ?? null,
          photos: collagePhotos,
          photoIndex,
          title: getChapterTitle(chapterAtStart),
          body: normalizeText(chapterAtStart.slideshowCaption) || null,
          minimumDurationMs: 3600,
          transitionPreset: 'montage-rise',
          subtitleDelayMs: 0,
        });
      }
    }

    const chapter = chapterByPhotoIndex.get(photoIndex) ?? null;
    const photo = photos[photoIndex];
    const subtitle = buildPhotoSubtitle(photo, chapter);

    scenes.push({
      id: `photo-${photo.id}`,
      type: 'photo',
      chapter,
      photo,
      photos: [photo],
      photoIndex,
      title: '',
      body: subtitle,
      minimumDurationMs: subtitle
        ? computeReadingDuration(subtitle, 2400, 4600)
        : DEFAULT_SLIDE_DURATION_MS,
      transitionPreset: getPhotoTransitionPreset(photoIndex, chapter),
      subtitleDelayMs: 240,
    });

    const chapterAtEnd = chapterEndMap.get(photoIndex);
    if (chapterAtEnd) {
      const chapterPhotos = photos.slice(
        chapterAtEnd.photoStartIndex,
        chapterAtEnd.photoEndIndex + 1,
      );
      const summaryText = normalizeText(chapterAtEnd.chapterSummary);
      if (summaryText) {
        scenes.push({
          id: `chapter-summary-${chapterAtEnd.id}`,
          type: 'chapter-summary',
          chapter: chapterAtEnd,
          photo: chapterPhotos[chapterPhotos.length - 1] ?? chapterPhotos[0] ?? null,
          photos: chapterPhotos.slice(-1),
          photoIndex,
          title: getChapterTitle(chapterAtEnd),
          body: summaryText,
          minimumDurationMs: computeReadingDuration(summaryText, 2600, 4400),
          transitionPreset: 'chapter-fade',
          subtitleDelayMs: 0,
        });
      }
    }
  }

  return scenes;
}

function getSceneHeaderLabel(scene: SlideshowScene | null, totalPhotos: number): string {
  if (!scene) {
    return totalPhotos > 0 ? `1 / ${totalPhotos}` : '旅行片段';
  }
  if (scene.type === 'photo') {
    return `${scene.photoIndex + 1} / ${totalPhotos}`;
  }
  return getChapterTitle(scene.chapter);
}

function CollageTile({
  photo,
  style,
}: {
  photo?: SlideshowProps['photos'][number];
  style?: object;
}) {
  const uri = getPhotoUri(photo);

  if (!uri) {
    return (
      <View style={[styles.collageTile, styles.collageFallbackTile, style]}>
        <MaterialCommunityIcons name="image-outline" size={18} color="#D6B897" />
      </View>
    );
  }

  return <Image source={{ uri }} style={[styles.collageTile, style]} resizeMode="cover" />;
}

function CollageSceneLayout({ photos }: { photos: SlideshowProps['photos'] }) {
  if (photos.length <= 1) {
    return (
      <View style={styles.collageWrap}>
        <CollageTile photo={photos[0]} style={styles.collageSingle} />
      </View>
    );
  }

  if (photos.length === 2) {
    return (
      <View style={styles.collageWrap}>
        <CollageTile photo={photos[0]} style={styles.collageHalf} />
        <CollageTile photo={photos[1]} style={styles.collageHalf} />
      </View>
    );
  }

  return (
    <View style={styles.collageWrap}>
      <CollageTile photo={photos[0]} style={styles.collageLead} />
      <View style={styles.collageStack}>
        <CollageTile photo={photos[1]} style={styles.collageStackItem} />
        <CollageTile photo={photos[2]} style={styles.collageStackItem} />
      </View>
    </View>
  );
}

function SceneLayer({
  scene,
  eventTitle,
  photoUri,
  photoSceneLayout,
  viewportWidth,
  viewportHeight,
  motionStyle,
  onPhotoLoad,
  onPhotoError,
}: {
  scene: SlideshowScene;
  eventTitle: string;
  photoUri: string | null;
  photoSceneLayout: {
    stageLeftRatio: number;
    stageTopRatio: number;
    stageWidthRatio: number;
    stageHeightRatio: number;
  };
  viewportWidth: number;
  viewportHeight: number;
  motionStyle?: object;
  onPhotoLoad?: (event: any) => void;
  onPhotoError?: () => void;
}) {
  if (scene.type === 'photo') {
    const photoStageStyle = {
      position: 'absolute' as const,
      left: viewportWidth * photoSceneLayout.stageLeftRatio,
      top: viewportHeight * photoSceneLayout.stageTopRatio,
      width: viewportWidth * photoSceneLayout.stageWidthRatio,
      height: viewportHeight * photoSceneLayout.stageHeightRatio,
    };

    return (
      <View style={styles.photoFrame}>
        <View style={[styles.photoStage, photoStageStyle]}>
          {photoUri ? (
            motionStyle ? (
              <MotionImage
                source={{ uri: photoUri }}
                style={[styles.photoStageImage, motionStyle]}
                resizeMode="contain"
                onLoad={onPhotoLoad}
                onError={onPhotoError}
              />
            ) : (
              <Image
                source={{ uri: photoUri }}
                style={styles.photoStageImage}
                resizeMode="contain"
                onLoad={onPhotoLoad}
                onError={onPhotoError}
              />
            )
          ) : (
            <View style={styles.photoMissingState}>
              <MaterialCommunityIcons name="image-broken-variant" size={34} color="#E7D2BB" />
              <Text style={styles.photoMissingText}>当前照片暂时不可用</Text>
            </View>
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.08)']}
            style={styles.photoStageShade}
          />
        </View>
      </View>
    );
  }

  if (scene.type === 'collage') {
    return (
      <View style={styles.collageSceneWrap}>
        <View style={styles.collageSceneCard}>
          <View style={styles.chapterSceneMetaRow}>
            <Text style={styles.chapterSceneEyebrow}>{getSceneTypeLabel(scene)}</Text>
            <View style={styles.chapterSceneDivider} />
            <Text style={styles.chapterSceneMetaText}>{scene.photos.length} 张照片</Text>
          </View>
          <Text style={styles.chapterSceneTitle}>{scene.title || eventTitle}</Text>
          {scene.body ? <Text style={styles.collageSceneBody}>{scene.body}</Text> : null}
          <CollageSceneLayout photos={scene.photos.slice(0, 3)} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.chapterSceneWrap}>
      <LinearGradient
        colors={['rgba(28,18,12,0.38)', 'rgba(28,18,12,0.72)', 'rgba(20,13,9,0.92)']}
        style={styles.chapterSceneCard}
      >
        {photoUri ? (
          <View style={styles.chapterSceneImageFrame}>
            <Image source={{ uri: photoUri }} style={styles.chapterSceneImage} resizeMode="cover" />
          </View>
        ) : null}
        <View style={styles.chapterSceneMetaRow}>
          <Text style={styles.chapterSceneEyebrow}>{getSceneTypeLabel(scene)}</Text>
          <View style={styles.chapterSceneDivider} />
          <Text style={styles.chapterSceneMetaText}>
            {scene.chapter ? `第 ${scene.chapter.chapterIndex} 章` : '旅行片段'}
          </Text>
        </View>
        <Text style={styles.chapterSceneTitle}>{scene.title || eventTitle}</Text>
        {scene.body ? <Text style={styles.chapterSceneBody}>{scene.body}</Text> : null}
      </LinearGradient>
    </View>
  );
}

export function SlideshowPlayer({ photos, event, onClose }: SlideshowProps) {
  const insets = useSafeAreaInsets();
  const { width: viewportWidth, height: viewportHeight } = useWindowDimensions();
  const scenes = useMemo(() => buildScenes(photos, event.chapters), [event.chapters, photos]);

  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [previousSceneIndex, setPreviousSceneIndex] = useState<number | null>(null);
  const [playbackState, setPlaybackState] = useState<PlaybackState>(PlaybackState.Playing);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [progressVisible, setProgressVisible] = useState(true);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [slideDurationMs, setSlideDurationMs] = useState(DEFAULT_SLIDE_DURATION_MS);
  const [musicStatus, setMusicStatus] = useState<MusicSourceStatus>('loading');
  const [footerHeight, setFooterHeight] = useState(144);
  const [failedCandidateIndices, setFailedCandidateIndices] = useState<Record<string, number>>({});
  const [photoAspectRatios, setPhotoAspectRatios] = useState<Record<string, number>>({});
  const [audioPlan, setAudioPlan] = useState<SlideshowAudioPlan | null>(null);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreviewMs, setSeekPreviewMs] = useState<number | null>(null);
  const [progressTrackWidth, setProgressTrackWidth] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subtitleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const playbackStateRef = useRef(playbackState);
  const prefetchedSoundRef = useRef<Audio.Sound | null>(null);
  const loadedAudioSegmentRef = useRef<SlideshowAudioSegment | null>(null);
  const prefetchedAudioSegmentRef = useRef<SlideshowAudioSegment | null>(null);
  const audioSyncInFlightRef = useRef(false);
  const seekShouldResumeRef = useRef(false);
  const pendingSeekMsRef = useRef<number | null>(null);
  const currentTimelinePositionRef = useRef(0);

  const incomingOpacity = useRef(new RNAnimated.Value(1)).current;
  const incomingTranslateX = useRef(new RNAnimated.Value(0)).current;
  const incomingTranslateY = useRef(new RNAnimated.Value(0)).current;
  const incomingScale = useRef(new RNAnimated.Value(1)).current;
  const outgoingOpacity = useRef(new RNAnimated.Value(0)).current;
  const outgoingTranslateX = useRef(new RNAnimated.Value(0)).current;
  const outgoingTranslateY = useRef(new RNAnimated.Value(0)).current;
  const outgoingScale = useRef(new RNAnimated.Value(1)).current;
  const subtitleOpacity = useRef(new RNAnimated.Value(0)).current;
  const subtitleTranslateY = useRef(new RNAnimated.Value(10)).current;

  const motionScale = useSharedValue(1);
  const motionTranslateX = useSharedValue(0);
  const motionTranslateY = useSharedValue(0);

  const currentScene = scenes[currentSceneIndex] ?? null;
  const previousScene = previousSceneIndex !== null ? (scenes[previousSceneIndex] ?? null) : null;

  const currentScenePhoto = useMemo(
    () => getSceneDisplayPhoto(currentScene, photos),
    [currentScene, photos],
  );
  const previousScenePhoto = useMemo(
    () => getSceneDisplayPhoto(previousScene, photos),
    [previousScene, photos],
  );

  const currentScenePhotoUri = useMemo(
    () => getPhotoUri(currentScenePhoto, failedCandidateIndices[currentScenePhoto?.id ?? ''] ?? 0),
    [currentScenePhoto, failedCandidateIndices],
  );
  const previousScenePhotoUri = useMemo(
    () =>
      getPhotoUri(previousScenePhoto, failedCandidateIndices[previousScenePhoto?.id ?? ''] ?? 0),
    [previousScenePhoto, failedCandidateIndices],
  );

  const activeSlideDurationMs = useMemo(() => {
    if (!currentScene) {
      return slideDurationMs;
    }
    if (currentScene.type === 'photo') {
      return Math.max(slideDurationMs, currentScene.minimumDurationMs);
    }
    return currentScene.minimumDurationMs;
  }, [currentScene, slideDurationMs]);
  const timeline = useMemo(
    () => buildSceneTimeline(scenes, slideDurationMs),
    [scenes, slideDurationMs],
  );
  const totalTimelineMs = useMemo(() => getTimelineTotalDurationMs(timeline), [timeline]);
  const currentTimelinePositionMs = useMemo(() => {
    const sceneStartMs = timeline[currentSceneIndex]?.startMs ?? 0;
    return Math.max(0, Math.min(sceneStartMs + elapsedMs, totalTimelineMs));
  }, [currentSceneIndex, elapsedMs, timeline, totalTimelineMs]);
  const displayedTimelinePositionMs =
    isSeeking && seekPreviewMs !== null ? seekPreviewMs : currentTimelinePositionMs;
  const currentAudioSegment = useMemo(
    () => getAudioSegmentAtPosition(audioPlan, currentTimelinePositionMs),
    [audioPlan, currentTimelinePositionMs],
  );
  const previewSceneLabel = useMemo(() => {
    const previewPositionMs = displayedTimelinePositionMs;
    const target = findTimelineSceneAtPosition(timeline, previewPositionMs);
    if (!target.scene) {
      return null;
    }
    if (target.scene.type === 'photo') {
      return `${target.scene.photoIndex + 1} / ${photos.length}`;
    }
    return getChapterTitle(target.scene.chapter);
  }, [displayedTimelinePositionMs, photos.length, timeline]);

  const sceneHeaderLabel = useMemo(
    () => getSceneHeaderLabel(currentScene, photos.length),
    [currentScene, photos.length],
  );
  const currentSubtitle = currentScene?.type === 'photo' ? currentScene.body : null;

  const formattedShotTime = useMemo(() => {
    if (currentScene?.type !== 'photo' || !currentScenePhoto?.shootTime) {
      return null;
    }
    try {
      return formatDateTime(currentScenePhoto.shootTime);
    } catch {
      return currentScenePhoto.shootTime;
    }
  }, [currentScene?.type, currentScenePhoto?.shootTime]);

  const compositionProfile = useMemo(
    () => buildSlideshowCompositionProfile(photos, photoAspectRatios),
    [photoAspectRatios, photos],
  );
  const photoSceneLayout = useMemo(
    () => getSlideshowPhotoSceneLayout(compositionProfile.orientation),
    [compositionProfile.orientation],
  );
  const subtitleTop = viewportHeight * photoSceneLayout.subtitleTopRatio;

  const motionStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: motionTranslateX.value },
      { translateY: motionTranslateY.value },
      { scale: motionScale.value },
    ],
  }));

  const incomingLayerStyle = useMemo(
    () => ({
      opacity: incomingOpacity,
      transform: [
        { translateX: incomingTranslateX },
        { translateY: incomingTranslateY },
        { scale: incomingScale },
      ],
    }),
    [incomingOpacity, incomingScale, incomingTranslateX, incomingTranslateY],
  );
  const outgoingLayerStyle = useMemo(
    () => ({
      opacity: outgoingOpacity,
      transform: [
        { translateX: outgoingTranslateX },
        { translateY: outgoingTranslateY },
        { scale: outgoingScale },
      ],
    }),
    [outgoingOpacity, outgoingScale, outgoingTranslateX, outgoingTranslateY],
  );
  const subtitleAnimatedStyle = useMemo(
    () => ({
      opacity: subtitleOpacity,
      transform: [{ translateY: subtitleTranslateY }],
    }),
    [subtitleOpacity, subtitleTranslateY],
  );

  useEffect(() => {
    playbackStateRef.current = playbackState;
  }, [playbackState]);

  useEffect(() => {
    currentTimelinePositionRef.current = currentTimelinePositionMs;
  }, [currentTimelinePositionMs]);

  useEffect(() => {
    if (scenes.length === 0) {
      if (currentSceneIndex !== 0) {
        setCurrentSceneIndex(0);
      }
      if (previousSceneIndex !== null) {
        setPreviousSceneIndex(null);
      }
      return;
    }

    if (currentSceneIndex > scenes.length - 1) {
      setCurrentSceneIndex(0);
    }
  }, [currentSceneIndex, previousSceneIndex, scenes.length]);

  useEffect(() => {
    if (scenes.length === 0) {
      return;
    }

    const currentPhoto = getSceneDisplayPhoto(currentScene, photos);
    const nextScene = scenes[(currentSceneIndex + 1) % scenes.length];
    const prevScene = scenes[(currentSceneIndex - 1 + scenes.length) % scenes.length];
    const nextPhoto = getSceneDisplayPhoto(nextScene, photos);
    const prevPhoto = getSceneDisplayPhoto(prevScene, photos);

    [
      getPhotoUri(currentPhoto, failedCandidateIndices[currentPhoto?.id ?? ''] ?? 0),
      getPhotoUri(nextPhoto, failedCandidateIndices[nextPhoto?.id ?? ''] ?? 0),
      getPhotoUri(prevPhoto, failedCandidateIndices[prevPhoto?.id ?? ''] ?? 0),
    ]
      .filter((uri): uri is string => Boolean(uri))
      .forEach((uri) => {
        void Image.prefetch(uri);
      });
  }, [currentScene, currentSceneIndex, failedCandidateIndices, photos, scenes]);

  const resetControlAutoHide = useCallback(() => {
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
    }
    setControlsVisible(true);
    setProgressVisible(true);
    controlsTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
      setProgressVisible(false);
    }, CONTROL_AUTO_HIDE_MS);
  }, []);

  const animateSceneTransition = useCallback(
    (nextIndex: number, nextElapsedMs = 0) => {
      const nextScene = scenes[nextIndex];
      const config = getTransitionConfig(nextScene?.transitionPreset ?? 'dissolve');

      setPreviousSceneIndex(currentSceneIndex);
      setCurrentSceneIndex(nextIndex);
      setElapsedMs(nextElapsedMs);

      incomingOpacity.setValue(config.incoming.opacity);
      incomingTranslateX.setValue(config.incoming.translateX);
      incomingTranslateY.setValue(config.incoming.translateY);
      incomingScale.setValue(config.incoming.scale);

      outgoingOpacity.setValue(1);
      outgoingTranslateX.setValue(0);
      outgoingTranslateY.setValue(0);
      outgoingScale.setValue(1);

      RNAnimated.parallel([
        RNAnimated.timing(incomingOpacity, {
          toValue: 1,
          duration: config.durationMs,
          useNativeDriver: true,
        }),
        RNAnimated.timing(incomingTranslateX, {
          toValue: 0,
          duration: config.durationMs,
          useNativeDriver: true,
        }),
        RNAnimated.timing(incomingTranslateY, {
          toValue: 0,
          duration: config.durationMs,
          useNativeDriver: true,
        }),
        RNAnimated.timing(incomingScale, {
          toValue: 1,
          duration: config.durationMs,
          useNativeDriver: true,
        }),
        RNAnimated.timing(outgoingOpacity, {
          toValue: config.outgoing.opacity,
          duration: config.durationMs,
          useNativeDriver: true,
        }),
        RNAnimated.timing(outgoingTranslateX, {
          toValue: config.outgoing.translateX,
          duration: config.durationMs,
          useNativeDriver: true,
        }),
        RNAnimated.timing(outgoingTranslateY, {
          toValue: config.outgoing.translateY,
          duration: config.durationMs,
          useNativeDriver: true,
        }),
        RNAnimated.timing(outgoingScale, {
          toValue: config.outgoing.scale,
          duration: config.durationMs,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setPreviousSceneIndex(null);
        outgoingOpacity.setValue(0);
        outgoingTranslateX.setValue(0);
        outgoingTranslateY.setValue(0);
        outgoingScale.setValue(1);
      });
    },
    [
      currentSceneIndex,
      incomingOpacity,
      incomingScale,
      incomingTranslateX,
      incomingTranslateY,
      outgoingOpacity,
      outgoingScale,
      outgoingTranslateX,
      outgoingTranslateY,
      scenes,
    ],
  );

  const jumpToScene = useCallback(
    (nextIndex: number, options?: { showControls?: boolean }) => {
      if (scenes.length === 0) {
        return;
      }
      const normalized = (nextIndex + scenes.length) % scenes.length;
      animateSceneTransition(normalized);
      if (options?.showControls) {
        resetControlAutoHide();
      }
    },
    [animateSceneTransition, resetControlAutoHide, scenes.length],
  );

  const onNextAuto = useCallback(() => {
    jumpToScene(currentSceneIndex + 1);
  }, [currentSceneIndex, jumpToScene]);

  const onNextByUser = useCallback(() => {
    jumpToScene(currentSceneIndex + 1, { showControls: true });
  }, [currentSceneIndex, jumpToScene]);

  const onPreviousByUser = useCallback(() => {
    jumpToScene(currentSceneIndex - 1, { showControls: true });
  }, [currentSceneIndex, jumpToScene]);

  const applyTimelineSeek = useCallback(
    (targetPositionMs: number, options?: { showControls?: boolean }) => {
      const target = findTimelineSceneAtPosition(timeline, targetPositionMs);
      if (!target.scene) {
        return;
      }
      if (target.sceneIndex === currentSceneIndex) {
        setElapsedMs(target.sceneElapsedMs);
      } else {
        animateSceneTransition(target.sceneIndex, target.sceneElapsedMs);
      }
      if (options?.showControls) {
        resetControlAutoHide();
      }
    },
    [animateSceneTransition, currentSceneIndex, resetControlAutoHide, timeline],
  );

  const updateSeekPreviewFromLocation = useCallback(
    (locationX: number) => {
      if (progressTrackWidth <= 0 || totalTimelineMs <= 0) {
        return;
      }
      const ratio = Math.max(0, Math.min(locationX / progressTrackWidth, 1));
      const targetPositionMs = Math.round(ratio * totalTimelineMs);
      pendingSeekMsRef.current = targetPositionMs;
      setSeekPreviewMs(targetPositionMs);
    },
    [progressTrackWidth, totalTimelineMs],
  );

  const beginSeek = useCallback(
    (locationX: number) => {
      seekShouldResumeRef.current = playbackStateRef.current === PlaybackState.Playing;
      if (seekShouldResumeRef.current) {
        setPlaybackState(PlaybackState.Paused);
      }
      setShowResumePrompt(false);
      setIsSeeking(true);
      updateSeekPreviewFromLocation(locationX);
      resetControlAutoHide();
    },
    [resetControlAutoHide, updateSeekPreviewFromLocation],
  );

  const commitSeek = useCallback(() => {
    const targetPositionMs = pendingSeekMsRef.current;
    pendingSeekMsRef.current = null;
    setIsSeeking(false);
    setSeekPreviewMs(null);
    if (typeof targetPositionMs === 'number') {
      applyTimelineSeek(targetPositionMs, { showControls: true });
    }
    if (seekShouldResumeRef.current) {
      setPlaybackState(PlaybackState.Playing);
    }
    seekShouldResumeRef.current = false;
  }, [applyTimelineSeek]);

  const runExport = useCallback(
    async (includeSubtitles: boolean) => {
      if (isExporting) {
        return;
      }

      setShowResumePrompt(false);
      setIsExporting(true);
      resetControlAutoHide();

      try {
        const result = await exportSlideshowVideo({
          event,
          photos,
          scenes,
          slideDurationMs,
          includeSubtitles,
        });
        Alert.alert(
          '导出完成',
          result.assetId
            ? '视频已保存到系统相册，并已打开分享面板。'
            : `视频已生成：${result.fileUri}`,
        );
      } catch (error) {
        Alert.alert('导出失败', error instanceof Error ? error.message : '请稍后再试');
      } finally {
        setIsExporting(false);
      }
    },
    [event, isExporting, photos, resetControlAutoHide, scenes, slideDurationMs],
  );

  const openExportOptions = useCallback(() => {
    if (isExporting) {
      return;
    }

    Alert.alert('导出视频', '选择导出版本', [
      { text: '取消', style: 'cancel' },
      {
        text: '无字幕',
        onPress: () => {
          void runExport(false);
        },
      },
      {
        text: '含字幕',
        onPress: () => {
          void runExport(true);
        },
      },
    ]);
  }, [isExporting, runExport]);

  const togglePlayPause = useCallback(() => {
    setPlaybackState((prev) =>
      prev === PlaybackState.Playing ? PlaybackState.Paused : PlaybackState.Playing,
    );
    resetControlAutoHide();
  }, [resetControlAutoHide]);

  useEffect(() => {
    StatusBar.setHidden(true, 'fade');
    resetControlAutoHide();

    return () => {
      StatusBar.setHidden(false, 'fade');
      if (controlsTimerRef.current) {
        clearTimeout(controlsTimerRef.current);
      }
      if (subtitleTimerRef.current) {
        clearTimeout(subtitleTimerRef.current);
      }
    };
  }, [resetControlAutoHide]);

  useEffect(() => {
    if (currentScene?.type !== 'photo') {
      motionScale.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) });
      motionTranslateX.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
      motionTranslateY.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
      return;
    }

    const direction = currentScene.photoIndex % 4;
    const startScale = direction % 2 === 0 ? 1.04 : 1.08;
    const endScale = direction % 2 === 0 ? 1.12 : 1.15;
    const startX = direction === 0 ? -10 : direction === 1 ? 10 : direction === 2 ? -6 : 6;
    const endX = direction === 0 ? 8 : direction === 1 ? -8 : direction === 2 ? 6 : -6;
    const startY = direction < 2 ? -8 : 8;
    const endY = direction < 2 ? 8 : -8;

    motionScale.value = startScale;
    motionTranslateX.value = startX;
    motionTranslateY.value = startY;

    motionScale.value = withTiming(endScale, {
      duration: activeSlideDurationMs + 240,
      easing: Easing.out(Easing.cubic),
    });
    motionTranslateX.value = withTiming(endX, {
      duration: activeSlideDurationMs + 240,
      easing: Easing.linear,
    });
    motionTranslateY.value = withTiming(endY, {
      duration: activeSlideDurationMs + 240,
      easing: Easing.linear,
    });
  }, [
    activeSlideDurationMs,
    currentScene?.photoIndex,
    currentScene?.type,
    motionScale,
    motionTranslateX,
    motionTranslateY,
  ]);

  useEffect(() => {
    if (subtitleTimerRef.current) {
      clearTimeout(subtitleTimerRef.current);
    }

    RNAnimated.parallel([
      RNAnimated.timing(subtitleOpacity, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
      RNAnimated.timing(subtitleTranslateY, {
        toValue: 10,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start();

    if (currentScene?.type !== 'photo' || !currentSubtitle) {
      return;
    }

    const delayMs =
      currentScene.subtitleDelayMs ||
      getTransitionConfig(currentScene.transitionPreset).subtitleDelayMs;
    subtitleTimerRef.current = setTimeout(() => {
      subtitleOpacity.setValue(0);
      subtitleTranslateY.setValue(10);
      RNAnimated.parallel([
        RNAnimated.timing(subtitleOpacity, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }),
        RNAnimated.timing(subtitleTranslateY, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
      ]).start();
    }, delayMs);

    return () => {
      if (subtitleTimerRef.current) {
        clearTimeout(subtitleTimerRef.current);
      }
    };
  }, [
    currentScene?.id,
    currentScene?.subtitleDelayMs,
    currentScene?.transitionPreset,
    currentScene?.type,
    currentSubtitle,
    subtitleOpacity,
    subtitleTranslateY,
  ]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && playbackState === PlaybackState.Playing) {
        setPlaybackState(PlaybackState.Paused);
        setShowResumePrompt(true);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [playbackState]);

  useEffect(() => {
    if (playbackState !== PlaybackState.Playing || scenes.length === 0 || isSeeking) {
      return;
    }

    const interval = setInterval(() => {
      setElapsedMs((previous) => {
        const next = previous + 100;
        if (next >= activeSlideDurationMs) {
          onNextAuto();
          return 0;
        }
        return next;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [activeSlideDurationMs, isSeeking, onNextAuto, playbackState, scenes.length]);

  useEffect(() => {
    let cancelled = false;

    const loadAudioPlan = async () => {
      if (timeline.length === 0) {
        setAudioPlan(null);
        setMusicStatus('none');
        return;
      }

      setMusicStatus('loading');
      const nextPlan = await buildSlideshowAudioPlan({ event, photos, timeline });
      if (cancelled) {
        return;
      }

      setAudioPlan(nextPlan);
      if (nextPlan.segments.length > 0) {
        setMusicStatus(nextPlan.strategy === 'legacy-event' ? 'remote' : 'remote');
        return;
      }

      setMusicStatus(nextPlan.strategy === 'fallback' ? 'fallback' : 'none');
    };

    void loadAudioPlan();

    return () => {
      cancelled = true;
    };
  }, [event, photos, timeline]);

  const cleanupSound = useCallback(async (sound: Audio.Sound | null) => {
    if (!sound) {
      return;
    }
    try {
      await sound.stopAsync();
    } catch {}
    try {
      await sound.unloadAsync();
    } catch {}
  }, []);

  const preloadAudioSegment = useCallback(
    async (segment: SlideshowAudioSegment | null) => {
      if (!segment) {
        return;
      }
      if (
        prefetchedAudioSegmentRef.current?.id === segment.id ||
        loadedAudioSegmentRef.current?.id === segment.id
      ) {
        return;
      }

      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: segment.sourceUrl },
          {
            shouldPlay: false,
            isLooping: false,
            volume: 0,
          },
        );
        const previousPrefetchedSound = prefetchedSoundRef.current;
        prefetchedSoundRef.current = sound;
        prefetchedAudioSegmentRef.current = segment;
        await cleanupSound(previousPrefetchedSound);
      } catch (error) {
        console.warn('Failed to preload slideshow audio segment:', segment.id, error);
      }
    },
    [cleanupSound],
  );

  const syncAudioToTimeline = useCallback(
    async (positionMs: number, options?: { force?: boolean }) => {
      if (audioSyncInFlightRef.current) {
        return;
      }

      audioSyncInFlightRef.current = true;
      try {
        if (!audioPlan && musicStatus === 'loading') {
          return;
        }
        const activeSegment = getAudioSegmentAtPosition(audioPlan, positionMs);
        if (!activeSegment) {
          const sources: { kind: MusicSourceStatus; source: AVPlaybackSource }[] = [];
          sources.push({ kind: 'fallback', source: DEFAULT_LOCAL_BGM });

          if (!soundRef.current || loadedAudioSegmentRef.current?.id !== 'fallback-loop') {
            await cleanupSound(soundRef.current);
            const { sound } = await Audio.Sound.createAsync(sources[0].source, {
              shouldPlay: false,
              isLooping: true,
              volume: 1,
            });
            soundRef.current = sound;
            loadedAudioSegmentRef.current = {
              id: 'fallback-loop',
              trackId: 'fallback-loop',
              title: 'Fallback Track',
              selectionBucket: 'fallback',
              sourceUrl: 'fallback',
              sourceStartMs: 0,
              sourceEndMs: totalTimelineMs,
              timelineStartMs: 0,
              timelineEndMs: totalTimelineMs,
              fadeInMs: 1000,
              fadeOutMs: 1400,
            };
            setMusicStatus('fallback');
          }

          if (playbackStateRef.current === PlaybackState.Playing) {
            await soundRef.current?.playAsync();
          } else {
            await soundRef.current?.pauseAsync();
          }
          return;
        }

        const targetPositionMs =
          activeSegment.sourceStartMs + (positionMs - activeSegment.timelineStartMs);
        let sound = soundRef.current;

        if (!sound || loadedAudioSegmentRef.current?.id !== activeSegment.id) {
          const prefetchedSegment = prefetchedAudioSegmentRef.current;
          const prefetchedSound = prefetchedSoundRef.current;
          if (prefetchedSegment?.id === activeSegment.id && prefetchedSound) {
            await cleanupSound(soundRef.current);
            soundRef.current = prefetchedSound;
            loadedAudioSegmentRef.current = prefetchedSegment;
            prefetchedSoundRef.current = null;
            prefetchedAudioSegmentRef.current = null;
            sound = prefetchedSound;
          } else {
            await cleanupSound(soundRef.current);
            const { sound: nextSound } = await Audio.Sound.createAsync(
              { uri: activeSegment.sourceUrl },
              {
                shouldPlay: false,
                isLooping: false,
                volume: 1,
              },
            );
            soundRef.current = nextSound;
            loadedAudioSegmentRef.current = activeSegment;
            sound = nextSound;
          }
          setMusicStatus('remote');
        }

        if (!sound) {
          return;
        }

        const status = await sound.getStatusAsync();
        if (!status.isLoaded) {
          return;
        }

        if (options?.force || Math.abs((status.positionMillis || 0) - targetPositionMs) > 500) {
          await sound.setPositionAsync(targetPositionMs);
        }

        const volume = getAudioVolumeAtPosition(activeSegment, positionMs);
        if (Math.abs((status.volume ?? 1) - volume) > 0.05) {
          await sound.setVolumeAsync(volume);
        }

        if (playbackStateRef.current === PlaybackState.Playing) {
          if (!status.isPlaying) {
            await sound.playAsync();
          }
        } else if (status.isPlaying) {
          await sound.pauseAsync();
        }

        const nextSegmentIndex =
          audioPlan?.segments.findIndex((segment) => segment.id === activeSegment.id) ?? -1;
        const nextSegment =
          nextSegmentIndex >= 0 ? (audioPlan?.segments[nextSegmentIndex + 1] ?? null) : null;
        if (nextSegment && activeSegment.timelineEndMs - positionMs <= 2500) {
          void preloadAudioSegment(nextSegment);
        }
      } catch (error) {
        console.warn('Failed to sync slideshow audio timeline:', error);
        setMusicStatus('error');
      } finally {
        audioSyncInFlightRef.current = false;
      }
    },
    [audioPlan, cleanupSound, musicStatus, preloadAudioSegment, totalTimelineMs],
  );

  useEffect(() => {
    void Audio.setAudioModeAsync({
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
    }).catch((error) => {
      console.warn('Failed to set audio mode:', error);
    });
  }, []);

  useEffect(() => {
    if (isSeeking) {
      return;
    }
    void syncAudioToTimeline(currentTimelinePositionRef.current, { force: true });
  }, [audioPlan?.strategy, currentAudioSegment?.id, isSeeking, playbackState, syncAudioToTimeline]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isSeeking || scenes.length === 0) {
        return;
      }
      void syncAudioToTimeline(currentTimelinePositionRef.current);
    }, 250);

    return () => clearInterval(interval);
  }, [isSeeking, scenes.length, syncAudioToTimeline]);

  useEffect(() => {
    return () => {
      void cleanupSound(soundRef.current);
      void cleanupSound(prefetchedSoundRef.current);
      soundRef.current = null;
      prefetchedSoundRef.current = null;
      loadedAudioSegmentRef.current = null;
      prefetchedAudioSegmentRef.current = null;
    };
  }, [cleanupSound]);

  const progress = useMemo(() => {
    if (totalTimelineMs <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(displayedTimelinePositionMs / totalTimelineMs, 1));
  }, [displayedTimelinePositionMs, totalTimelineMs]);

  const headerTop = insets.top + 12;
  const footerBottom = insets.bottom + 20;

  const onFooterLayout = useCallback(
    (layoutEvent: LayoutChangeEvent) => {
      const height = layoutEvent.nativeEvent.layout.height;
      if (height > 0 && Math.abs(height - footerHeight) > 2) {
        setFooterHeight(height);
      }
    },
    [footerHeight],
  );

  if (photos.length === 0 || scenes.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialCommunityIcons name="image-off-outline" size={36} color="#B89C7B" />
        <Text style={styles.emptyText}>该事件暂无可播放照片</Text>
        <Pressable style={styles.closeButton} onPress={onClose}>
          <Text style={styles.closeButtonText}>返回</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      style={styles.container}
      onPress={() => {
        if (controlsVisible || progressVisible) {
          if (controlsTimerRef.current) {
            clearTimeout(controlsTimerRef.current);
          }
          setControlsVisible(false);
          setProgressVisible(false);
          return;
        }
        resetControlAutoHide();
      }}
    >
      <View style={styles.imageWrap}>
        {currentScenePhotoUri ? (
          <Image
            source={{ uri: currentScenePhotoUri }}
            style={styles.photoBackdrop}
            resizeMode="cover"
            blurRadius={24}
          />
        ) : null}
        <View style={styles.photoBackdropTint} />

        {previousScene ? (
          <RNAnimated.View style={[styles.sceneLayer, outgoingLayerStyle]}>
            <SceneLayer
              scene={previousScene}
              eventTitle={event.title}
              photoUri={previousScenePhotoUri}
              photoSceneLayout={photoSceneLayout}
              viewportWidth={viewportWidth}
              viewportHeight={viewportHeight}
            />
          </RNAnimated.View>
        ) : null}

        {currentScene ? (
          <RNAnimated.View style={[styles.sceneLayer, incomingLayerStyle]}>
            <SceneLayer
              scene={currentScene}
              eventTitle={event.title}
              photoUri={currentScenePhotoUri}
              photoSceneLayout={photoSceneLayout}
              viewportWidth={viewportWidth}
              viewportHeight={viewportHeight}
              motionStyle={currentScene.type === 'photo' ? motionStyle : undefined}
              onPhotoLoad={(imageEvent) => {
                if (!currentScenePhoto?.id) {
                  return;
                }
                const { width, height } = imageEvent.nativeEvent.source;
                if (width > 0 && height > 0) {
                  setPhotoAspectRatios((previous) => ({
                    ...previous,
                    [currentScenePhoto.id]: width / height,
                  }));
                }
              }}
              onPhotoError={() => {
                if (!currentScenePhoto?.id) {
                  return;
                }
                setFailedCandidateIndices((previous) => ({
                  ...previous,
                  [currentScenePhoto.id]: (previous[currentScenePhoto.id] ?? 0) + 1,
                }));
              }}
            />
          </RNAnimated.View>
        ) : null}

        <View style={styles.photoShade} />
      </View>

      {currentScene?.type === 'photo' && currentSubtitle ? (
        <RNAnimated.View
          pointerEvents="none"
          style={[styles.subtitleWrap, { top: subtitleTop }, subtitleAnimatedStyle]}
        >
          <LinearGradient
            colors={['rgba(20,13,9,0)', 'rgba(20,13,9,0.28)', 'rgba(20,13,9,0)']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={styles.subtitleBand}
          >
            <Text numberOfLines={2} style={styles.subtitleText}>
              {currentSubtitle}
            </Text>
          </LinearGradient>
        </RNAnimated.View>
      ) : null}

      {controlsVisible ? (
        <>
          <View style={styles.header}>
            <View style={[styles.headerInner, { top: headerTop }]}>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons name="close" size={20} color="#FFF8F0" />
              </Pressable>
              <Text style={styles.counterText}>{sceneHeaderLabel}</Text>
              <Pressable
                onPress={openExportOptions}
                disabled={isExporting}
                style={({ pressed }) => [
                  styles.iconBtn,
                  isExporting && styles.iconBtnDisabled,
                  pressed && styles.pressed,
                ]}
              >
                {isExporting ? (
                  <ActivityIndicator size="small" color="#FFF8F0" />
                ) : (
                  <MaterialCommunityIcons name="download-outline" size={20} color="#FFF8F0" />
                )}
              </Pressable>
            </View>
          </View>

          <View style={[styles.footer, { bottom: footerBottom }]} onLayout={onFooterLayout}>
            {formattedShotTime ? <Text style={styles.metaText}>{formattedShotTime}</Text> : null}
            {currentScene?.chapter ? (
              <Text style={styles.metaText}>{getChapterTitle(currentScene.chapter)}</Text>
            ) : null}
            <Text style={styles.metaText}>{getMusicStatusText(musicStatus)}</Text>
            {currentAudioSegment?.title ? (
              <Text numberOfLines={1} style={styles.metaText}>
                配乐片段：{currentAudioSegment.title}
              </Text>
            ) : null}
            {progressVisible ? (
              <View style={styles.progressWrap}>
                <View
                  style={styles.progressTouchArea}
                  onLayout={(layoutEvent) => {
                    setProgressTrackWidth(layoutEvent.nativeEvent.layout.width);
                  }}
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onResponderGrant={(gestureEvent) => {
                    beginSeek(gestureEvent.nativeEvent.locationX);
                  }}
                  onResponderMove={(gestureEvent) => {
                    updateSeekPreviewFromLocation(gestureEvent.nativeEvent.locationX);
                  }}
                  onResponderRelease={commitSeek}
                  onResponderTerminate={commitSeek}
                >
                  <View style={styles.progressTrack} />
                  <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
                  <View
                    style={[
                      styles.progressThumb,
                      {
                        left: Math.max(
                          0,
                          Math.min(
                            progressTrackWidth * progress - 8,
                            Math.max(progressTrackWidth - 16, 0),
                          ),
                        ),
                      },
                    ]}
                  />
                </View>
                <View style={styles.progressTimeRow}>
                  <Text style={styles.progressTimeText}>
                    {formatDurationLabel(displayedTimelinePositionMs)}
                  </Text>
                  <Text style={styles.progressTimeText}>
                    {formatDurationLabel(totalTimelineMs)}
                  </Text>
                </View>
                {isSeeking && previewSceneLabel ? (
                  <Text style={styles.progressPreviewText}>预览 · {previewSceneLabel}</Text>
                ) : null}
              </View>
            ) : null}

            <View style={styles.speedRow}>
              {SPEED_OPTIONS_MS.map((value) => (
                <Pressable
                  key={value}
                  onPress={() => {
                    setSlideDurationMs(value);
                    setElapsedMs(0);
                    resetControlAutoHide();
                  }}
                  style={({ pressed }) => [
                    styles.speedPill,
                    slideDurationMs === value && styles.speedPillActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.speedPillText,
                      slideDurationMs === value && styles.speedPillTextActive,
                    ]}
                  >
                    {Number(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}s
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.controlsRow}>
              <Pressable
                onPress={onPreviousByUser}
                style={({ pressed }) => [styles.controlBtn, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons name="skip-previous" size={24} color="#FFF8F0" />
              </Pressable>
              <Pressable
                onPress={togglePlayPause}
                style={({ pressed }) => [styles.controlBtn, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons
                  name={playbackState === PlaybackState.Playing ? 'pause' : 'play'}
                  size={24}
                  color="#FFF8F0"
                />
              </Pressable>
              <Pressable
                onPress={onNextByUser}
                style={({ pressed }) => [styles.controlBtn, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons name="skip-next" size={24} color="#FFF8F0" />
              </Pressable>
            </View>
          </View>
        </>
      ) : null}

      {showResumePrompt ? (
        <View style={styles.resumePrompt}>
          <Text style={styles.resumeText}>应用从后台返回，是否继续播放？</Text>
          <Pressable
            style={({ pressed }) => [styles.resumeBtn, pressed && styles.pressed]}
            onPress={() => {
              setShowResumePrompt(false);
              setPlaybackState(PlaybackState.Playing);
              resetControlAutoHide();
            }}
          >
            <Text style={styles.resumeBtnText}>继续播放</Text>
          </Pressable>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#140F0D',
  },
  imageWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  sceneLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  photoBackdrop: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.54,
    transform: [{ scale: 1.08 }],
  },
  photoBackdropTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(20,13,9,0.42)',
  },
  photoFrame: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 22,
  },
  photoStage: {
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,244,230,0.14)',
    backgroundColor: 'rgba(10,8,7,0.64)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 18 },
  },
  photoStageImage: {
    width: '100%',
    height: '100%',
  },
  photoStageShade: {
    ...StyleSheet.absoluteFillObject,
  },
  photoShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(12,8,6,0.18)',
  },
  photoMissingState: {
    width: '88%',
    aspectRatio: 0.88,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,248,240,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,240,222,0.18)',
  },
  photoMissingText: {
    color: '#F4E6D8',
    fontSize: 14,
    fontWeight: '700',
  },
  chapterSceneWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 26,
  },
  chapterSceneCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingVertical: 28,
    borderWidth: 1,
    borderColor: 'rgba(240,216,191,0.22)',
    alignItems: 'center',
    backgroundColor: 'rgba(35,24,18,0.38)',
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 16 },
    overflow: 'hidden',
  },
  chapterSceneImageFrame: {
    width: '100%',
    height: 172,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,242,224,0.16)',
    backgroundColor: 'rgba(255,248,240,0.06)',
  },
  chapterSceneImage: {
    width: '100%',
    height: '100%',
  },
  chapterSceneMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  chapterSceneEyebrow: {
    color: '#E7C5A0',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  chapterSceneDivider: {
    width: 22,
    height: 1,
    backgroundColor: 'rgba(240,216,191,0.28)',
  },
  chapterSceneMetaText: {
    color: '#E8D4BE',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  chapterSceneTitle: {
    marginTop: 10,
    color: '#FFF7EE',
    fontSize: 30,
    fontWeight: '800',
    textAlign: 'center',
  },
  chapterSceneBody: {
    marginTop: 14,
    color: '#F4E7D8',
    fontSize: 17,
    lineHeight: 28,
    textAlign: 'center',
  },
  collageSceneWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  collageSceneCard: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(242,223,198,0.18)',
    backgroundColor: 'rgba(27,18,14,0.78)',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 18 },
  },
  collageSceneBody: {
    marginTop: 10,
    marginBottom: 18,
    color: '#F2E2D1',
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
  },
  collageWrap: {
    width: '100%',
    flexDirection: 'row',
    gap: 10,
    minHeight: 244,
  },
  collageTile: {
    borderRadius: 20,
    backgroundColor: 'rgba(255,248,240,0.08)',
    overflow: 'hidden',
  },
  collageFallbackTile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(242,223,198,0.12)',
  },
  collageSingle: {
    flex: 1,
    minHeight: 260,
  },
  collageHalf: {
    flex: 1,
    minHeight: 244,
  },
  collageLead: {
    flex: 1.18,
    minHeight: 244,
  },
  collageStack: {
    flex: 0.92,
    gap: 10,
  },
  collageStackItem: {
    flex: 1,
    minHeight: 117,
  },
  header: {
    position: 'absolute',
    left: 18,
    right: 18,
  },
  headerInner: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  counterText: {
    color: '#FFF7EE',
    fontSize: 14,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(31,23,18,0.66)',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(31,23,18,0.66)',
  },
  iconBtnDisabled: {
    opacity: 0.74,
  },
  subtitleWrap: {
    position: 'absolute',
    left: 24,
    right: 24,
  },
  subtitleBand: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitleText: {
    color: '#FFF8F0',
    fontSize: 20,
    lineHeight: 29,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.75)',
    textShadowRadius: 10,
  },
  footer: {
    position: 'absolute',
    left: 18,
    right: 18,
    gap: 8,
  },
  metaText: {
    color: '#EAD8C5',
    fontSize: 12,
  },
  progressWrap: {
    gap: 6,
  },
  progressTouchArea: {
    height: 26,
    justifyContent: 'center',
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 10,
    bottom: 10,
    borderRadius: 999,
    backgroundColor: '#F3D0B0',
  },
  progressThumb: {
    position: 'absolute',
    top: 5,
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: '#FFF8F0',
    borderWidth: 2,
    borderColor: '#B67054',
  },
  progressTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressTimeText: {
    color: '#F0E2D4',
    fontSize: 11,
    fontWeight: '700',
  },
  progressPreviewText: {
    color: '#E7C5A0',
    fontSize: 11,
    fontWeight: '700',
  },
  speedRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  speedPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(31,23,18,0.66)',
  },
  speedPillActive: {
    backgroundColor: '#B67054',
  },
  speedPillText: {
    color: '#F1E4D6',
    fontSize: 11,
    fontWeight: '700',
  },
  speedPillTextActive: {
    color: '#FFF8F0',
  },
  controlsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
  },
  controlBtn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: 'rgba(31,23,18,0.66)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
  resumePrompt: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: '40%',
    borderRadius: 16,
    backgroundColor: 'rgba(31,23,18,0.82)',
    paddingHorizontal: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },
  resumeText: {
    color: '#FFF8F0',
    textAlign: 'center',
    fontSize: 13,
  },
  resumeBtn: {
    marginTop: 10,
    borderRadius: 999,
    backgroundColor: '#B67054',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  resumeBtnText: {
    color: '#FFF8F0',
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#140F0D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    marginTop: 8,
    color: '#D8C3AF',
  },
  closeButton: {
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#B67054',
  },
  closeButtonText: {
    color: '#FFF8F0',
    fontWeight: '700',
  },
});
