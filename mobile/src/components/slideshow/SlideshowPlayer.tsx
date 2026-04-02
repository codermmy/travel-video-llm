import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated as RNAnimated,
  AppState,
  Image,
  type LayoutChangeEvent,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from 'react-native';
import { Audio, type AVPlaybackSource } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ProgressBar } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Easing,
  createAnimatedComponent,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import type { EventChapter } from '@/types/chapter';
import { PlaybackState, type SlideshowProps } from '@/types/slideshow';
import { formatDateTime } from '@/utils/dateUtils';
import { getPhotoOriginalCandidates } from '@/utils/mediaRefs';

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

function notifyMusicError(message: string) {
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
    return;
  }
  Alert.alert('提示', message);
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

function getPhotoOrientation(
  aspectRatio?: number,
): 'landscape' | 'portrait' | 'square' | 'unknown' {
  if (!aspectRatio) {
    return 'unknown';
  }
  if (aspectRatio > 1.02) {
    return 'landscape';
  }
  if (aspectRatio < 0.98) {
    return 'portrait';
  }
  return 'square';
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
  photoOrientation,
  motionStyle,
  onPhotoLoad,
  onPhotoError,
}: {
  scene: SlideshowScene;
  eventTitle: string;
  photoUri: string | null;
  photoOrientation: 'landscape' | 'portrait' | 'square' | 'unknown';
  motionStyle?: object;
  onPhotoLoad?: (event: any) => void;
  onPhotoError?: () => void;
}) {
  if (scene.type === 'photo') {
    return (
      <View style={styles.photoFrame}>
        {photoUri ? (
          motionStyle ? (
            <MotionImage
              source={{ uri: photoUri }}
              style={[
                styles.photo,
                motionStyle,
                photoOrientation === 'landscape' && styles.photoLandscape,
                photoOrientation === 'portrait' && styles.photoPortrait,
                photoOrientation === 'square' && styles.photoSquare,
              ]}
              resizeMode="contain"
              onLoad={onPhotoLoad}
              onError={onPhotoError}
            />
          ) : (
            <Image
              source={{ uri: photoUri }}
              style={[
                styles.photo,
                photoOrientation === 'landscape' && styles.photoLandscape,
                photoOrientation === 'portrait' && styles.photoPortrait,
                photoOrientation === 'square' && styles.photoSquare,
              ]}
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

  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subtitleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const playbackStateRef = useRef(playbackState);

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

  const currentPhotoAspectRatio = currentScenePhoto?.id
    ? photoAspectRatios[currentScenePhoto.id]
    : undefined;
  const previousPhotoAspectRatio = previousScenePhoto?.id
    ? photoAspectRatios[previousScenePhoto.id]
    : undefined;
  const photoOrientation = getPhotoOrientation(currentPhotoAspectRatio);
  const previousPhotoOrientation = getPhotoOrientation(previousPhotoAspectRatio);

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
    (nextIndex: number) => {
      const nextScene = scenes[nextIndex];
      const config = getTransitionConfig(nextScene?.transitionPreset ?? 'dissolve');

      setPreviousSceneIndex(currentSceneIndex);
      setCurrentSceneIndex(nextIndex);
      setElapsedMs(0);

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
    if (playbackState !== PlaybackState.Playing || scenes.length === 0) {
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
  }, [activeSlideDurationMs, onNextAuto, playbackState, scenes.length]);

  useEffect(() => {
    const loadMusic = async () => {
      setMusicStatus('loading');

      const sources: { kind: MusicSourceStatus; source: AVPlaybackSource }[] = [];
      if (event.musicUrl) {
        sources.push({ kind: 'remote', source: { uri: event.musicUrl } });
      }
      sources.push({ kind: 'fallback', source: DEFAULT_LOCAL_BGM });

      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          staysActiveInBackground: false,
        });
      } catch (error) {
        console.warn('Failed to set audio mode:', error);
      }

      for (const candidate of sources) {
        try {
          const { sound } = await Audio.Sound.createAsync(candidate.source, {
            shouldPlay: false,
            isLooping: true,
            volume: 1,
          });
          soundRef.current = sound;
          setMusicStatus(candidate.kind);
          if (playbackStateRef.current === PlaybackState.Playing) {
            await sound.playAsync();
          }
          return;
        } catch (error) {
          console.warn('Failed to load slideshow music source:', candidate.kind, error);
        }
      }

      setMusicStatus(event.musicUrl ? 'error' : 'none');
      if (event.musicUrl) {
        notifyMusicError('远程音乐不可用，且本地默认音乐未找到。');
      }
    };

    void loadMusic();

    return () => {
      void (async () => {
        try {
          if (soundRef.current) {
            await soundRef.current.stopAsync();
            await soundRef.current.unloadAsync();
            soundRef.current = null;
          }
        } catch (error) {
          console.warn('Failed to cleanup slideshow audio:', error);
        }
      })();
    };
  }, [event.musicUrl]);

  useEffect(() => {
    const sound = soundRef.current;
    if (!sound) {
      return;
    }

    if (playbackState === PlaybackState.Playing) {
      void sound.playAsync();
      return;
    }

    void sound.pauseAsync();
  }, [playbackState]);

  const progress = useMemo(() => {
    if (scenes.length === 0) {
      return 0;
    }
    const base = currentSceneIndex / scenes.length;
    const perScene = (elapsedMs / activeSlideDurationMs) * (1 / scenes.length);
    return Math.max(0, Math.min(1, base + perScene));
  }, [activeSlideDurationMs, currentSceneIndex, elapsedMs, scenes.length]);

  const storyBottom = controlsVisible ? insets.bottom + footerHeight + 28 : insets.bottom + 38;
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
              photoOrientation={previousPhotoOrientation}
            />
          </RNAnimated.View>
        ) : null}

        {currentScene ? (
          <RNAnimated.View style={[styles.sceneLayer, incomingLayerStyle]}>
            <SceneLayer
              scene={currentScene}
              eventTitle={event.title}
              photoUri={currentScenePhotoUri}
              photoOrientation={photoOrientation}
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
          style={[styles.subtitleWrap, { bottom: storyBottom }, subtitleAnimatedStyle]}
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
            </View>
          </View>

          <View style={[styles.footer, { bottom: footerBottom }]} onLayout={onFooterLayout}>
            {formattedShotTime ? <Text style={styles.metaText}>{formattedShotTime}</Text> : null}
            {currentScene?.chapter ? (
              <Text style={styles.metaText}>{getChapterTitle(currentScene.chapter)}</Text>
            ) : null}
            <Text style={styles.metaText}>{getMusicStatusText(musicStatus)}</Text>
            {progressVisible ? (
              <ProgressBar progress={progress} style={styles.progressBar} />
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
    paddingHorizontal: 12,
    paddingVertical: 18,
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoLandscape: {
    width: '100%',
    height: '78%',
  },
  photoPortrait: {
    width: '94%',
    height: '100%',
  },
  photoSquare: {
    width: '94%',
    height: '94%',
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
  progressBar: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
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
