import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated as RNAnimated,
  AppState,
  type AppStateStatus,
  Image,
  type LayoutChangeEvent,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Audio, ResizeMode, Video, type AVPlaybackSource, type AVPlaybackStatus } from 'expo-av';
import * as ScreenOrientation from 'expo-screen-orientation';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Easing,
  createAnimatedComponent,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import {
  PlaybackState,
  type SlideshowScene,
  type SlideshowAudioPlan,
  type SlideshowAudioSegment,
  type SlideshowVideoLayoutContract,
  type SlideshowProps,
  type VideoAspectMode,
} from '@/types/slideshow';
import { formatDateTime } from '@/utils/dateUtils';
import { getPhotoOriginalCandidates } from '@/utils/mediaRefs';
import {
  buildSlideshowAudioPlan,
  getAudioSegmentAtPosition,
  getAudioVolumeAtPosition,
} from '@/services/slideshow/slideshowAudioService';
import {
  buildSlideshowRenderTimeline,
  exportSlideshowVideo,
  generateSlideshowPreviewVideo,
  type SlideshowExportProgress,
} from '@/services/slideshow/slideshowExportService';
import { buildSlideshowCompositionProfile } from '@/services/slideshow/slideshowCompositionProfile';
import {
  buildScenes,
  findTimelineSceneAtPosition,
  getChapterTitle,
  getSceneDisplayPhoto,
  getSceneHeaderLabel,
  getTimelineTotalDurationMs,
} from '@/services/slideshow/slideshowSceneBuilder';
import {
  buildSlideshowVideoLayoutContract,
  getCanvasSizeForAspectRatio,
  fitAspectRatioWithinBounds,
  resolveVideoAspectRatio,
} from '@/services/slideshow/slideshowVideoContract';

const MotionImage = createAnimatedComponent(Image);

const DEFAULT_SLIDE_DURATION_MS = 3200;
const CONTROL_AUTO_HIDE_MS = 3000;
const DEFAULT_LOCAL_BGM = require('../../../assets/audio/default-bgm.wav');

type MusicSourceStatus = 'loading' | 'remote' | 'fallback' | 'none' | 'error';

function getPhotoUri(
  photo: SlideshowProps['photos'][number] | null | undefined,
  failedCandidateIndex = 0,
): string | null {
  return getPhotoOriginalCandidates(photo)[failedCandidateIndex] ?? null;
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

function scaleValue(value: number, scale: number): number {
  return Math.round(value * scale);
}

function scaleRect(
  rect: SlideshowVideoLayoutContract['stageRect'],
  scaleX: number,
  scaleY: number,
): SlideshowVideoLayoutContract['stageRect'] {
  return {
    x: scaleValue(rect.x, scaleX),
    y: scaleValue(rect.y, scaleY),
    width: scaleValue(rect.width, scaleX),
    height: scaleValue(rect.height, scaleY),
  };
}

function scaleLayoutContract(
  contract: SlideshowVideoLayoutContract,
  canvasWidth: number,
  canvasHeight: number,
): SlideshowVideoLayoutContract {
  const scaleX = canvasWidth / contract.canvas.width;
  const scaleY = canvasHeight / contract.canvas.height;
  const typographyScale = Math.min(scaleX, scaleY);

  return {
    ...contract,
    canvas: {
      width: canvasWidth,
      height: canvasHeight,
    },
    titleSafeArea: scaleRect(contract.titleSafeArea, scaleX, scaleY),
    stageRect: scaleRect(contract.stageRect, scaleX, scaleY),
    subtitleSafeArea: scaleRect(contract.subtitleSafeArea, scaleX, scaleY),
    subtitleOverlayRect: scaleRect(contract.subtitleOverlayRect, scaleX, scaleY),
    subtitleOverlayHeight: scaleValue(contract.subtitleOverlayHeight, scaleY),
    stageGap: scaleValue(contract.stageGap, scaleX),
    stageRadius: scaleValue(contract.stageRadius, scaleX),
    tileRadius: scaleValue(contract.tileRadius, scaleX),
    montageRects: {
      single: contract.montageRects.single.map((rect) => scaleRect(rect, scaleX, scaleY)),
      pair: contract.montageRects.pair.map((rect) => scaleRect(rect, scaleX, scaleY)),
      trio: contract.montageRects.trio.map((rect) => scaleRect(rect, scaleX, scaleY)),
    },
    typography: {
      eyebrowSize: scaleValue(contract.typography.eyebrowSize, typographyScale),
      titleSize: scaleValue(contract.typography.titleSize, typographyScale),
      titleLineHeight: scaleValue(contract.typography.titleLineHeight, typographyScale),
      subtitleSize: scaleValue(contract.typography.subtitleSize, typographyScale),
      subtitleLineHeight: scaleValue(contract.typography.subtitleLineHeight, typographyScale),
      metaSize: scaleValue(contract.typography.metaSize, typographyScale),
    },
  };
}

function formatDurationLabel(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function CollageTile({
  photo,
  style,
  tileRadius,
}: {
  photo?: SlideshowProps['photos'][number];
  style?: object;
  tileRadius: number;
}) {
  const uri = getPhotoUri(photo);

  if (!uri) {
    return (
      <View
        style={[
          styles.collageTile,
          { borderRadius: tileRadius },
          styles.collageFallbackTile,
          style,
        ]}
      >
        <MaterialCommunityIcons name="image-outline" size={18} color="#D6B897" />
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[styles.collageTile, { borderRadius: tileRadius }, style]}
      resizeMode="cover"
    />
  );
}

function CollageSceneLayout({
  photos,
  tileRadius,
  slots,
}: {
  photos: SlideshowProps['photos'];
  tileRadius: number;
  slots: SlideshowVideoLayoutContract['montageRects']['single'];
}) {
  return (
    <View style={styles.collageStage}>
      {slots.map((slot, index) => (
        <CollageTile
          key={`${photos[index]?.id || 'empty'}-${index}`}
          photo={photos[index]}
          tileRadius={tileRadius}
          style={[
            styles.collageSlot,
            {
              left: slot.x,
              top: slot.y,
              width: slot.width,
              height: slot.height,
            },
          ]}
        />
      ))}
    </View>
  );
}

function SceneLayer({
  scene,
  eventTitle,
  photoUri,
  layoutContract,
  motionStyle,
  onPhotoLoad,
  onPhotoError,
}: {
  scene: SlideshowScene;
  eventTitle: string;
  photoUri: string | null;
  layoutContract: SlideshowVideoLayoutContract;
  motionStyle?: object;
  onPhotoLoad?: (event: any) => void;
  onPhotoError?: () => void;
}) {
  const stageStyle = {
    position: 'absolute' as const,
    left: layoutContract.stageRect.x,
    top: layoutContract.stageRect.y,
    width: layoutContract.stageRect.width,
    height: layoutContract.stageRect.height,
  };
  const titleSafeStyle = {
    position: 'absolute' as const,
    left: layoutContract.titleSafeArea.x,
    top: layoutContract.titleSafeArea.y,
    width: layoutContract.titleSafeArea.width,
    height: layoutContract.titleSafeArea.height,
  };

  if (scene.type === 'photo-frame') {
    return (
      <View style={styles.canvasScene}>
        {photoUri ? (
          motionStyle ? (
            <MotionImage
              source={{ uri: photoUri }}
              style={[styles.photoCanvasImage, motionStyle]}
              resizeMode="contain"
              onLoad={onPhotoLoad}
              onError={onPhotoError}
            />
          ) : (
            <Image
              source={{ uri: photoUri }}
              style={styles.photoCanvasImage}
              resizeMode="contain"
              onLoad={onPhotoLoad}
              onError={onPhotoError}
            />
          )
        ) : (
          <View style={styles.photoMissingCanvas}>
            <View style={styles.photoMissingState}>
              <MaterialCommunityIcons name="image-broken-variant" size={34} color="#E7D2BB" />
              <Text style={styles.photoMissingText}>当前照片暂时不可用</Text>
            </View>
          </View>
        )}
      </View>
    );
  }

  if (scene.type === 'montage-frame') {
    return (
      <View style={styles.canvasScene}>
        <View
          style={[styles.montageStage, stageStyle, { borderRadius: layoutContract.stageRadius }]}
        >
          <CollageSceneLayout
            photos={scene.photos.slice(0, 3)}
            tileRadius={layoutContract.tileRadius}
            slots={
              scene.photos.length <= 1
                ? layoutContract.montageRects.single
                : scene.photos.length === 2
                  ? layoutContract.montageRects.pair
                  : layoutContract.montageRects.trio
            }
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.canvasScene}>
      <View style={titleSafeStyle}>
        {scene.eyebrow ? <Text style={styles.sceneEyebrow}>{scene.eyebrow}</Text> : null}
        <Text
          style={[
            styles.sceneTitle,
            styles.serifTitle,
            {
              fontSize: layoutContract.typography.titleSize,
              lineHeight: layoutContract.typography.titleLineHeight,
            },
          ]}
        >
          {scene.title || eventTitle}
        </Text>
      </View>
      {photoUri ? (
        <View style={styles.titlePlateImageHint}>
          <Image source={{ uri: photoUri }} style={styles.titlePlateImage} resizeMode="cover" />
          <View style={styles.titlePlateImageShade} />
        </View>
      ) : null}
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
  const [isLandscapePlayback, setIsLandscapePlayback] = useState(false);
  const [musicStatus, setMusicStatus] = useState<MusicSourceStatus>('loading');
  const [footerHeight, setFooterHeight] = useState(212);
  const [failedCandidateIndices, setFailedCandidateIndices] = useState<Record<string, number>>({});
  const [photoAspectRatios, setPhotoAspectRatios] = useState<Record<string, number>>({});
  const [audioPlan, setAudioPlan] = useState<SlideshowAudioPlan | null>(null);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPreviewMs, setSeekPreviewMs] = useState<number | null>(null);
  const [progressTrackWidth, setProgressTrackWidth] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<SlideshowExportProgress>({
    label: '正在准备导出环境...',
    progress: 0,
  });
  const [previewVideoStatus, setPreviewVideoStatus] = useState<
    'idle' | 'generating' | 'ready' | 'failed'
  >('idle');
  const [previewVideoUri, setPreviewVideoUri] = useState<string | null>(null);
  const [previewVideoDurationMs, setPreviewVideoDurationMs] = useState(0);
  const [previewVideoProgress, setPreviewVideoProgress] = useState<SlideshowExportProgress>({
    label: '正在准备视频预览...',
    progress: 0,
  });
  const [previewPositionMs, setPreviewPositionMs] = useState(0);
  const [orientationLockCaptured, setOrientationLockCaptured] = useState(false);

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
  const closingRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const previewVideoRef = useRef<Video | null>(null);
  const previewGenerationRunRef = useRef(0);
  const pendingPreviewStartPositionRef = useRef<number | null>(null);
  const previewReadyKeyRef = useRef<string | null>(null);
  const previewInFlightKeyRef = useRef<string | null>(null);
  const previousOrientationLockRef = useRef<ScreenOrientation.OrientationLock | null>(null);
  const orientationLockCapturedRef = useRef(false);

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
  const slideDurationMs = DEFAULT_SLIDE_DURATION_MS;
  const aspectMode: VideoAspectMode = 'auto';

  const timeline = useMemo(
    () => buildSlideshowRenderTimeline(scenes, slideDurationMs),
    [scenes, slideDurationMs],
  );
  const previewRequestKey = useMemo(
    () =>
      JSON.stringify({
        eventId: event.id,
        title: event.title,
        aspectMode,
        slideDurationMs,
        storyText: event.storyText ?? null,
        fullStory: event.fullStory ?? null,
        photoIds: photos.map((photo) => photo.id),
        photoUris: photos.map((photo) => photo.localUri ?? photo.photoUrl ?? null),
        scenes: scenes.map((scene) => ({
          id: scene.id,
          type: scene.type,
          title: scene.title,
          body: scene.body,
          photoIndex: scene.photoIndex,
          photoIds: scene.photos.map((photo) => photo.id),
        })),
      }),
    [
      aspectMode,
      event.fullStory,
      event.id,
      event.storyText,
      event.title,
      photos,
      scenes,
      slideDurationMs,
    ],
  );
  const previewVideoEligible = photos.length > 0 && timeline.length > 0;
  const previewVideoActive =
    previewVideoStatus === 'ready' &&
    Boolean(previewVideoUri) &&
    previewReadyKeyRef.current === previewRequestKey;
  const realtimePlaybackEnabled = previewVideoStatus === 'failed';
  const playbackInteractive = previewVideoActive || realtimePlaybackEnabled;
  const waitingForPreview = previewVideoEligible && !playbackInteractive;

  const currentScene = timeline[currentSceneIndex] ?? null;
  const previousScene = previousSceneIndex !== null ? (timeline[previousSceneIndex] ?? null) : null;

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

  const activeSlideDurationMs = currentScene?.durationMs ?? slideDurationMs;
  const totalTimelineMs = useMemo(() => getTimelineTotalDurationMs(timeline), [timeline]);
  const realtimeTimelinePositionMs = useMemo(() => {
    const sceneStartMs = timeline[currentSceneIndex]?.startMs ?? 0;
    return Math.max(0, Math.min(sceneStartMs + elapsedMs, totalTimelineMs));
  }, [currentSceneIndex, elapsedMs, timeline, totalTimelineMs]);
  const currentTimelinePositionMs = previewVideoActive
    ? Math.max(0, Math.min(previewPositionMs, previewVideoDurationMs || totalTimelineMs))
    : realtimeTimelinePositionMs;
  const displayedTimelinePositionMs =
    isSeeking && seekPreviewMs !== null ? seekPreviewMs : currentTimelinePositionMs;
  const activeSceneTarget = useMemo(
    () => findTimelineSceneAtPosition(timeline, currentTimelinePositionMs),
    [currentTimelinePositionMs, timeline],
  );
  const activeScene = activeSceneTarget.scene ?? currentScene;
  const activeScenePhoto = useMemo(
    () => getSceneDisplayPhoto(activeScene, photos),
    [activeScene, photos],
  );
  const currentAudioSegment = useMemo(
    () =>
      realtimePlaybackEnabled
        ? getAudioSegmentAtPosition(audioPlan, currentTimelinePositionMs)
        : null,
    [audioPlan, currentTimelinePositionMs, realtimePlaybackEnabled],
  );
  const previewSceneLabel = useMemo(() => {
    const previewPositionMs = displayedTimelinePositionMs;
    const target = findTimelineSceneAtPosition(timeline, previewPositionMs);
    if (!target.scene) {
      return null;
    }
    if (target.scene.type === 'photo-frame') {
      return `${target.scene.photoIndex + 1} / ${photos.length}`;
    }
    return getChapterTitle(target.scene.chapter);
  }, [displayedTimelinePositionMs, photos.length, timeline]);

  const sceneHeaderLabel = useMemo(
    () => getSceneHeaderLabel(activeScene, photos.length),
    [activeScene, photos.length],
  );
  const currentSubtitle = realtimePlaybackEnabled ? (activeScene?.body ?? null) : null;
  const exportBlocked = event.slideshowFreshness === 'stale' || event.hasPendingStructureChanges;

  const formattedShotTime = useMemo(() => {
    if (activeScene?.type !== 'photo-frame' || !activeScenePhoto?.shootTime) {
      return null;
    }
    try {
      return formatDateTime(activeScenePhoto.shootTime);
    } catch {
      return activeScenePhoto.shootTime;
    }
  }, [activeScene?.type, activeScenePhoto?.shootTime]);

  const compositionProfile = useMemo(
    () => buildSlideshowCompositionProfile(photos, photoAspectRatios),
    [photoAspectRatios, photos],
  );
  const isCompactPlayback = isLandscapePlayback || viewportWidth > viewportHeight;
  const headerTop = insets.top + 12;
  const footerBottom = insets.bottom + 20;
  const immersiveLandscapePlayback = isLandscapePlayback;
  const previewBounds = useMemo(() => {
    if (immersiveLandscapePlayback) {
      return {
        top: 0,
        bottom: viewportHeight,
        maxWidth: Math.max(220, viewportWidth),
        maxHeight: Math.max(220, viewportHeight),
      };
    }
    const top = headerTop + (isCompactPlayback ? 56 : 72);
    const bottom = viewportHeight - footerBottom - footerHeight - (isCompactPlayback ? 12 : 24);
    const maxWidth = Math.max(220, viewportWidth - (isCompactPlayback ? 12 : 24));
    const maxHeight = Math.max(220, bottom - top);
    return {
      top,
      bottom,
      maxWidth,
      maxHeight,
    };
  }, [
    footerBottom,
    footerHeight,
    headerTop,
    immersiveLandscapePlayback,
    isCompactPlayback,
    viewportHeight,
    viewportWidth,
  ]);
  const resolvedAspectRatio = useMemo(
    () => resolveVideoAspectRatio(aspectMode, compositionProfile),
    [aspectMode, compositionProfile],
  );
  const previewCanvasSize = useMemo(
    () =>
      fitAspectRatioWithinBounds({
        maxWidth: previewBounds.maxWidth,
        maxHeight: previewBounds.maxHeight,
        resolvedAspectRatio,
      }),
    [previewBounds.maxHeight, previewBounds.maxWidth, resolvedAspectRatio],
  );
  const exportCanvasSize = useMemo(
    () => getCanvasSizeForAspectRatio(resolvedAspectRatio),
    [resolvedAspectRatio],
  );
  const layoutContract = useMemo(() => {
    const baseContract = buildSlideshowVideoLayoutContract({
      aspectMode,
      compositionProfile,
      canvasWidth: exportCanvasSize.width,
      canvasHeight: exportCanvasSize.height,
    });
    return scaleLayoutContract(baseContract, previewCanvasSize.width, previewCanvasSize.height);
  }, [
    aspectMode,
    compositionProfile,
    exportCanvasSize.height,
    exportCanvasSize.width,
    previewCanvasSize.height,
    previewCanvasSize.width,
  ]);
  const previewCanvasFrame = useMemo(() => {
    const left = (viewportWidth - previewCanvasSize.width) / 2;
    const verticalSpace = Math.max(
      0,
      previewBounds.bottom - previewBounds.top - previewCanvasSize.height,
    );
    const top = previewBounds.top + verticalSpace / 2;
    return {
      left,
      top,
      width: previewCanvasSize.width,
      height: previewCanvasSize.height,
    };
  }, [
    previewBounds.bottom,
    previewBounds.top,
    previewCanvasSize.height,
    previewCanvasSize.width,
    viewportWidth,
  ]);

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
    let cancelled = false;

    if (!previewVideoEligible) {
      return;
    }
    if (previewReadyKeyRef.current === previewRequestKey && previewVideoUri) {
      return;
    }
    if (previewInFlightKeyRef.current === previewRequestKey) {
      return;
    }

    const runId = previewGenerationRunRef.current + 1;
    previewGenerationRunRef.current = runId;
    previewInFlightKeyRef.current = previewRequestKey;

    const fallbackTarget = findTimelineSceneAtPosition(
      timeline,
      currentTimelinePositionRef.current,
    );
    if (fallbackTarget.scene) {
      setPreviousSceneIndex(null);
      setCurrentSceneIndex(fallbackTarget.sceneIndex);
      setElapsedMs(fallbackTarget.sceneElapsedMs);
    }
    setPreviewPositionMs(0);
    setPreviewVideoStatus('generating');
    setPreviewVideoUri(null);
    setPreviewVideoDurationMs(0);
    setPreviewVideoProgress({ label: '正在准备视频预览...', progress: 0.08 });

    void generateSlideshowPreviewVideo({
      event,
      photos,
      scenes,
      slideDurationMs,
      aspectMode,
      onProgress: (nextProgress) => {
        if (!cancelled && previewGenerationRunRef.current === runId) {
          setPreviewVideoProgress(nextProgress);
        }
      },
    })
      .then((result) => {
        if (cancelled || closingRef.current || previewGenerationRunRef.current !== runId) {
          return;
        }
        previewInFlightKeyRef.current = null;
        previewReadyKeyRef.current = previewRequestKey;
        pendingPreviewStartPositionRef.current = currentTimelinePositionRef.current;
        setPreviewVideoUri(result.fileUri);
        setPreviewVideoDurationMs(result.durationMs);
        setPreviewVideoStatus('ready');
        setPreviewVideoProgress({ label: '预览视频已就绪', progress: 1 });
      })
      .catch((error) => {
        if (cancelled || closingRef.current || previewGenerationRunRef.current !== runId) {
          return;
        }
        previewInFlightKeyRef.current = null;
        setPreviewVideoStatus('failed');
        setPreviewVideoDurationMs(0);
      });

    return () => {
      cancelled = true;
    };
  }, [
    aspectMode,
    event,
    photos,
    previewRequestKey,
    previewVideoEligible,
    previewVideoUri,
    scenes,
    slideDurationMs,
    timeline,
  ]);

  useEffect(() => {
    if (timeline.length === 0) {
      if (currentSceneIndex !== 0) {
        setCurrentSceneIndex(0);
      }
      if (previousSceneIndex !== null) {
        setPreviousSceneIndex(null);
      }
      return;
    }

    if (currentSceneIndex > timeline.length - 1) {
      setCurrentSceneIndex(0);
    }
  }, [currentSceneIndex, previousSceneIndex, timeline.length]);

  useEffect(() => {
    if (timeline.length === 0) {
      return;
    }

    const currentPhoto = getSceneDisplayPhoto(currentScene, photos);
    const nextScene = timeline[(currentSceneIndex + 1) % timeline.length];
    const prevScene = timeline[(currentSceneIndex - 1 + timeline.length) % timeline.length];
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
  }, [currentScene, currentSceneIndex, failedCandidateIndices, photos, timeline]);

  const resetControlAutoHide = useCallback(() => {
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
    }
    setControlsVisible(true);
    setProgressVisible(playbackInteractive);
    if (!playbackInteractive) {
      return;
    }
    controlsTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
      setProgressVisible(false);
    }, CONTROL_AUTO_HIDE_MS);
  }, [playbackInteractive]);

  const animateSceneTransition = useCallback(
    (nextIndex: number, nextElapsedMs = 0) => {
      setPreviousSceneIndex(null);
      setCurrentSceneIndex(nextIndex);
      setElapsedMs(nextElapsedMs);
      incomingOpacity.setValue(1);
      incomingTranslateX.setValue(0);
      incomingTranslateY.setValue(0);
      incomingScale.setValue(1);
      outgoingOpacity.setValue(0);
      outgoingTranslateX.setValue(0);
      outgoingTranslateY.setValue(0);
      outgoingScale.setValue(1);
    },
    [
      incomingOpacity,
      incomingScale,
      incomingTranslateX,
      incomingTranslateY,
      outgoingOpacity,
      outgoingScale,
      outgoingTranslateX,
      outgoingTranslateY,
    ],
  );

  const jumpToScene = useCallback(
    (nextIndex: number, options?: { showControls?: boolean }) => {
      if (timeline.length === 0) {
        return;
      }
      const normalized = (nextIndex + timeline.length) % timeline.length;
      if (previewVideoActive) {
        const targetPositionMs = timeline[normalized]?.startMs ?? 0;
        setPreviewPositionMs(targetPositionMs);
        const seekAction = previewVideoRef.current?.setPositionAsync(targetPositionMs);
        void seekAction?.catch((error) => {
          console.warn('Failed to seek preview video scene:', error);
        });
      } else {
        animateSceneTransition(normalized);
      }
      if (options?.showControls) {
        resetControlAutoHide();
      }
    },
    [animateSceneTransition, previewVideoActive, resetControlAutoHide, timeline],
  );

  const onNextAuto = useCallback(() => {
    jumpToScene(currentSceneIndex + 1);
  }, [currentSceneIndex, jumpToScene]);
  const activeSceneIndex =
    activeSceneTarget.sceneIndex >= 0 ? activeSceneTarget.sceneIndex : currentSceneIndex;

  const onNextByUser = useCallback(() => {
    jumpToScene(activeSceneIndex + 1, { showControls: true });
  }, [activeSceneIndex, jumpToScene]);

  const onPreviousByUser = useCallback(() => {
    jumpToScene(activeSceneIndex - 1, { showControls: true });
  }, [activeSceneIndex, jumpToScene]);

  const syncPreviewVideoPosition = useCallback(
    async (targetPositionMs: number, options?: { shouldPlay?: boolean }) => {
      const targetPosition = Math.max(
        0,
        Math.min(targetPositionMs, previewVideoDurationMs || totalTimelineMs),
      );
      setPreviewPositionMs(targetPosition);
      try {
        await previewVideoRef.current?.setPositionAsync(targetPosition);
        if (options?.shouldPlay === true) {
          await previewVideoRef.current?.playAsync();
        } else if (options?.shouldPlay === false) {
          await previewVideoRef.current?.pauseAsync();
        }
      } catch (error) {
        console.warn('Failed to sync preview video position:', error);
      }
    },
    [previewVideoDurationMs, totalTimelineMs],
  );

  const handlePreviewVideoLoad = useCallback(
    (status: AVPlaybackStatus) => {
      if (!status.isLoaded) {
        return;
      }
      const durationMs = status.durationMillis ?? previewVideoDurationMs ?? totalTimelineMs;
      if (durationMs > 0) {
        setPreviewVideoDurationMs(durationMs);
      }
      const pendingStartMs = pendingPreviewStartPositionRef.current;
      pendingPreviewStartPositionRef.current = null;
      if (typeof pendingStartMs === 'number') {
        void syncPreviewVideoPosition(pendingStartMs, {
          shouldPlay: playbackStateRef.current === PlaybackState.Playing,
        });
      } else if (playbackStateRef.current === PlaybackState.Playing) {
        void previewVideoRef.current?.playAsync().catch(() => undefined);
      }
    },
    [previewVideoDurationMs, syncPreviewVideoPosition, totalTimelineMs],
  );

  const handlePreviewPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) {
      return;
    }
    setPreviewPositionMs(status.positionMillis ?? 0);
    const durationMillis = typeof status.durationMillis === 'number' ? status.durationMillis : null;
    if (durationMillis && durationMillis > 0) {
      setPreviewVideoDurationMs((previous) =>
        previous === durationMillis ? previous : durationMillis,
      );
    }
  }, []);

  const applyTimelineSeek = useCallback(
    (targetPositionMs: number, options?: { showControls?: boolean }) => {
      if (previewVideoActive) {
        void syncPreviewVideoPosition(targetPositionMs, {
          shouldPlay: seekShouldResumeRef.current,
        });
        if (options?.showControls) {
          resetControlAutoHide();
        }
        return;
      }
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
    [
      animateSceneTransition,
      currentSceneIndex,
      previewVideoActive,
      resetControlAutoHide,
      syncPreviewVideoPosition,
      timeline,
    ],
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
        if (previewVideoActive) {
          void previewVideoRef.current?.pauseAsync().catch(() => undefined);
        }
      }
      setShowResumePrompt(false);
      setIsSeeking(true);
      updateSeekPreviewFromLocation(locationX);
      resetControlAutoHide();
    },
    [previewVideoActive, resetControlAutoHide, updateSeekPreviewFromLocation],
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
      setExportProgress({ label: '正在准备导出环境...', progress: 0.08 });
      resetControlAutoHide();

      try {
        const result = await exportSlideshowVideo({
          event,
          photos,
          scenes,
          slideDurationMs,
          includeSubtitles,
          aspectMode,
          onProgress: (nextProgress) => {
            setExportProgress(nextProgress);
          },
        });
        if (closingRef.current) {
          return;
        }
        Alert.alert(
          '导出完成',
          result.assetId
            ? '视频已保存到系统相册，并已打开分享面板。'
            : `视频已生成：${result.fileUri}`,
        );
      } catch (error) {
        if (closingRef.current) {
          return;
        }
        Alert.alert('导出失败', error instanceof Error ? error.message : '请稍后再试');
      } finally {
        if (!closingRef.current) {
          setIsExporting(false);
        }
      }
    },
    [aspectMode, event, isExporting, photos, resetControlAutoHide, scenes, slideDurationMs],
  );

  const openExportOptions = useCallback(() => {
    if (isExporting) {
      return;
    }

    if (waitingForPreview) {
      Alert.alert('预览生成中', '请等待当前预览准备完成后再导出视频。');
      return;
    }

    if (exportBlocked) {
      Alert.alert('内容待更新', '当前内容已发生变化，请等待最新预览生成完成后再导出视频。');
      return;
    }

    Alert.alert('导出视频', `当前比例：${layoutContract.resolvedAspectRatio}`, [
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
  }, [
    exportBlocked,
    isExporting,
    layoutContract.resolvedAspectRatio,
    runExport,
    waitingForPreview,
  ]);

  const togglePlayPause = useCallback(() => {
    const nextState =
      playbackState === PlaybackState.Playing ? PlaybackState.Paused : PlaybackState.Playing;
    setPlaybackState(nextState);
    if (previewVideoActive) {
      const playbackAction =
        nextState === PlaybackState.Playing
          ? previewVideoRef.current?.playAsync()
          : previewVideoRef.current?.pauseAsync();
      void playbackAction?.catch((error) => {
        console.warn('Failed to toggle preview video playback:', error);
      });
    }
    resetControlAutoHide();
  }, [playbackState, previewVideoActive, resetControlAutoHide]);

  const toggleLandscapePlayback = useCallback(() => {
    setIsLandscapePlayback((previous) => !previous);
    resetControlAutoHide();
  }, [resetControlAutoHide]);

  useEffect(() => {
    StatusBar.setHidden(true, 'fade');
    resetControlAutoHide();
    const subtitleTimer = subtitleTimerRef.current;

    return () => {
      StatusBar.setHidden(false, 'fade');
      if (controlsTimerRef.current) {
        clearTimeout(controlsTimerRef.current);
      }
      if (subtitleTimer) {
        clearTimeout(subtitleTimer);
      }
    };
  }, [resetControlAutoHide]);

  useEffect(() => {
    if (!playbackInteractive) {
      return;
    }
    resetControlAutoHide();
  }, [playbackInteractive, resetControlAutoHide]);

  useEffect(() => {
    let cancelled = false;

    const rememberOrientationLock = async () => {
      try {
        previousOrientationLockRef.current = await ScreenOrientation.getOrientationLockAsync();
      } catch (error) {
        previousOrientationLockRef.current = null;
        if (!cancelled) {
          console.warn('Failed to read previous slideshow orientation lock:', error);
        }
      } finally {
        orientationLockCapturedRef.current = true;
        if (!cancelled) {
          setOrientationLockCaptured(true);
        }
      }
    };

    void rememberOrientationLock();

    return () => {
      cancelled = true;
      if (!orientationLockCapturedRef.current) {
        return;
      }
      const restoreOrientationLock = async () => {
        const previousOrientationLock = previousOrientationLockRef.current;
        if (previousOrientationLock !== null) {
          await ScreenOrientation.lockAsync(previousOrientationLock);
          return;
        }
        await ScreenOrientation.unlockAsync();
      };
      void restoreOrientationLock().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!orientationLockCaptured) {
      return;
    }

    const applyOrientationLock = async () => {
      try {
        await ScreenOrientation.lockAsync(
          isLandscapePlayback
            ? ScreenOrientation.OrientationLock.LANDSCAPE
            : ScreenOrientation.OrientationLock.PORTRAIT_UP,
        );
      } catch (error) {
        if (!cancelled) {
          console.warn('Failed to update slideshow orientation lock:', error);
        }
      }
    };

    void applyOrientationLock();

    return () => {
      cancelled = true;
    };
  }, [isLandscapePlayback, orientationLockCaptured]);

  useEffect(() => {
    if (!previewVideoActive || isSeeking) {
      return;
    }
    const playbackAction =
      playbackState === PlaybackState.Playing
        ? previewVideoRef.current?.playAsync()
        : previewVideoRef.current?.pauseAsync();
    void playbackAction?.catch((error) => {
      console.warn('Failed to sync preview video playback state:', error);
    });
  }, [isSeeking, playbackState, previewVideoActive, previewVideoUri]);

  useEffect(() => {
    motionScale.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) });
    motionTranslateX.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
    motionTranslateY.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.cubic) });
  }, [currentScene?.id, motionScale, motionTranslateX, motionTranslateY]);

  useEffect(() => {
    if (subtitleTimerRef.current) {
      clearTimeout(subtitleTimerRef.current);
    }

    if (!currentScene || !currentSubtitle) {
      subtitleOpacity.setValue(0);
      subtitleTranslateY.setValue(0);
      return;
    }

    subtitleOpacity.setValue(1);
    subtitleTranslateY.setValue(0);
  }, [currentScene, currentScene?.id, currentSubtitle, subtitleOpacity, subtitleTranslateY]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      appStateRef.current = state;
      if (state !== 'active' && playbackInteractive && playbackState === PlaybackState.Playing) {
        setPlaybackState(PlaybackState.Paused);
        setShowResumePrompt(true);
        if (previewVideoActive) {
          void previewVideoRef.current?.pauseAsync().catch(() => undefined);
        }
        if (realtimePlaybackEnabled) {
          void soundRef.current?.pauseAsync().catch(() => undefined);
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [playbackInteractive, playbackState, previewVideoActive, realtimePlaybackEnabled]);

  useEffect(() => {
    if (
      !realtimePlaybackEnabled ||
      playbackState !== PlaybackState.Playing ||
      timeline.length === 0 ||
      isSeeking
    ) {
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
  }, [
    activeSlideDurationMs,
    isSeeking,
    onNextAuto,
    playbackState,
    realtimePlaybackEnabled,
    timeline.length,
  ]);

  useEffect(() => {
    let cancelled = false;

    const loadAudioPlan = async () => {
      if (closingRef.current) {
        return;
      }
      if (!realtimePlaybackEnabled) {
        setAudioPlan(null);
        setMusicStatus('none');
        return;
      }
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
  }, [event, photos, realtimePlaybackEnabled, timeline]);

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

  useEffect(() => {
    const activeSound = soundRef.current;
    const prefetchedSound = prefetchedSoundRef.current;
    soundRef.current = null;
    prefetchedSoundRef.current = null;
    loadedAudioSegmentRef.current = null;
    prefetchedAudioSegmentRef.current = null;
    void Promise.all([cleanupSound(activeSound), cleanupSound(prefetchedSound)]);
  }, [cleanupSound, realtimePlaybackEnabled]);

  const handleClose = useCallback(() => {
    closingRef.current = true;
    playbackStateRef.current = PlaybackState.Paused;
    setPlaybackState(PlaybackState.Paused);
    setShowResumePrompt(false);
    if (controlsTimerRef.current) {
      clearTimeout(controlsTimerRef.current);
    }
    if (subtitleTimerRef.current) {
      clearTimeout(subtitleTimerRef.current);
    }

    const activeSound = soundRef.current;
    const prefetchedSound = prefetchedSoundRef.current;
    const activePreviewVideo = previewVideoRef.current;
    soundRef.current = null;
    prefetchedSoundRef.current = null;
    loadedAudioSegmentRef.current = null;
    prefetchedAudioSegmentRef.current = null;

    void Promise.all([
      cleanupSound(activeSound),
      cleanupSound(prefetchedSound),
      activePreviewVideo?.pauseAsync().catch(() => undefined),
    ]).finally(() => {
      onClose();
    });
  }, [cleanupSound, onClose]);

  const preloadAudioSegment = useCallback(
    async (segment: SlideshowAudioSegment | null) => {
      if (closingRef.current) {
        return;
      }
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
        if (closingRef.current) {
          await cleanupSound(sound);
          return;
        }
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
      if (closingRef.current) {
        return;
      }
      if (appStateRef.current !== 'active') {
        return;
      }
      if (!realtimePlaybackEnabled) {
        return;
      }
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
            if (closingRef.current) {
              return;
            }
            const { sound } = await Audio.Sound.createAsync(sources[0].source, {
              shouldPlay: false,
              isLooping: true,
              volume: 1,
            });
            if (closingRef.current) {
              await cleanupSound(sound);
              return;
            }
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
            if (closingRef.current) {
              return;
            }
            const { sound: nextSound } = await Audio.Sound.createAsync(
              { uri: activeSegment.sourceUrl },
              {
                shouldPlay: false,
                isLooping: false,
                volume: 1,
              },
            );
            if (closingRef.current) {
              await cleanupSound(nextSound);
              return;
            }
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
        if (closingRef.current) {
          await sound.pauseAsync().catch(() => undefined);
          return;
        }
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
    [
      audioPlan,
      cleanupSound,
      musicStatus,
      preloadAudioSegment,
      realtimePlaybackEnabled,
      totalTimelineMs,
    ],
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
    if (!realtimePlaybackEnabled || isSeeking) {
      return;
    }
    void syncAudioToTimeline(currentTimelinePositionRef.current, { force: true });
  }, [
    audioPlan?.strategy,
    currentAudioSegment?.id,
    isSeeking,
    playbackState,
    realtimePlaybackEnabled,
    syncAudioToTimeline,
  ]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!realtimePlaybackEnabled || isSeeking || timeline.length === 0) {
        return;
      }
      void syncAudioToTimeline(currentTimelinePositionRef.current);
    }, 250);

    return () => clearInterval(interval);
  }, [isSeeking, realtimePlaybackEnabled, syncAudioToTimeline, timeline.length]);

  useEffect(() => {
    const previewVideo = previewVideoRef.current;
    return () => {
      closingRef.current = true;
      void cleanupSound(soundRef.current);
      void cleanupSound(prefetchedSoundRef.current);
      void previewVideo?.pauseAsync().catch(() => undefined);
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

  const onFooterLayout = useCallback(
    (layoutEvent: LayoutChangeEvent) => {
      const height = layoutEvent.nativeEvent.layout.height;
      if (height > 0 && Math.abs(height - footerHeight) > 2) {
        setFooterHeight(height);
      }
    },
    [footerHeight],
  );

  if (photos.length === 0 || timeline.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialCommunityIcons name="image-off-outline" size={36} color="#B89C7B" />
        <Text style={styles.emptyText}>该事件暂无可播放照片</Text>
        <Pressable style={styles.closeButton} onPress={handleClose}>
          <Text style={styles.closeButtonText}>返回</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Pressable
      style={styles.container}
      onPress={() => {
        if (waitingForPreview) {
          return;
        }
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
      <View
        style={[
          styles.previewCanvas,
          {
            left: previewCanvasFrame.left,
            top: previewCanvasFrame.top,
            width: previewCanvasFrame.width,
            height: previewCanvasFrame.height,
          },
        ]}
      >
        <View style={styles.canvasSurface}>
          {previewVideoActive && previewVideoUri ? (
            <Video
              ref={previewVideoRef}
              source={{ uri: previewVideoUri }}
              style={styles.previewVideo}
              resizeMode={ResizeMode.CONTAIN}
              shouldPlay={false}
              isLooping
              onLoad={handlePreviewVideoLoad}
              onPlaybackStatusUpdate={handlePreviewPlaybackStatusUpdate}
            />
          ) : realtimePlaybackEnabled ? (
            <>
              {previousScene ? (
                <RNAnimated.View style={[styles.sceneLayer, outgoingLayerStyle]}>
                  <SceneLayer
                    scene={previousScene}
                    eventTitle={event.title}
                    photoUri={previousScenePhotoUri}
                    layoutContract={layoutContract}
                  />
                </RNAnimated.View>
              ) : null}

              {currentScene ? (
                <RNAnimated.View style={[styles.sceneLayer, incomingLayerStyle]}>
                  <SceneLayer
                    scene={currentScene}
                    eventTitle={event.title}
                    photoUri={currentScenePhotoUri}
                    layoutContract={layoutContract}
                    motionStyle={currentScene.type === 'photo-frame' ? motionStyle : undefined}
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

              {currentSubtitle ? (
                <RNAnimated.View
                  pointerEvents="none"
                  style={[
                    styles.subtitleWrap,
                    {
                      left: layoutContract.subtitleSafeArea.x,
                      top: layoutContract.subtitleSafeArea.y,
                      width: layoutContract.subtitleSafeArea.width,
                    },
                    subtitleAnimatedStyle,
                  ]}
                >
                  <View style={styles.subtitleTextWrap}>
                    <Text
                      numberOfLines={2}
                      style={[
                        styles.subtitleText,
                        {
                          fontSize: layoutContract.typography.subtitleSize,
                          lineHeight: layoutContract.typography.subtitleLineHeight,
                        },
                      ]}
                    >
                      {currentSubtitle}
                    </Text>
                  </View>
                </RNAnimated.View>
              ) : null}
            </>
          ) : (
            <View style={styles.previewWaitingSurface} />
          )}

          {waitingForPreview ? (
            <View pointerEvents="none" style={styles.previewStatusCard}>
              <ActivityIndicator size="small" color="#F8F8F2" />
              <Text style={styles.previewStatusTitle}>正在生成预览视频</Text>
              <Text style={styles.previewStatusText}>{previewVideoProgress.label}</Text>
              <View style={styles.previewStatusTrack}>
                <View
                  style={[
                    styles.previewStatusFill,
                    { width: `${Math.max(8, Math.round(previewVideoProgress.progress * 100))}%` },
                  ]}
                />
              </View>
            </View>
          ) : null}
        </View>
      </View>

      {controlsVisible ? (
        <>
          <View style={styles.header}>
            <View style={[styles.headerInner, { top: headerTop }]}>
              <Pressable
                onPress={handleClose}
                style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons name="close" size={20} color="#FFF8F0" />
              </Pressable>
              <Text style={styles.counterText}>
                {playbackInteractive ? sceneHeaderLabel : '正在生成预览'}
              </Text>
              <Pressable
                onPress={openExportOptions}
                disabled={isExporting || exportBlocked || waitingForPreview}
                style={({ pressed }) => [
                  styles.iconBtn,
                  (isExporting || exportBlocked || waitingForPreview) && styles.iconBtnDisabled,
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

          {playbackInteractive && exportBlocked ? (
            <View style={[styles.staleBanner, { top: headerTop + 54 }]}>
              <MaterialCommunityIcons name="update" size={14} color="#F5D28F" />
              <Text style={styles.staleBannerText}>内容已更新，请先等待最新预览重新生成</Text>
            </View>
          ) : null}

          {realtimePlaybackEnabled ? (
            <View
              style={[
                styles.staleBanner,
                styles.fallbackPlaybackBanner,
                { top: headerTop + (exportBlocked ? 94 : 54) },
              ]}
            >
              <MaterialCommunityIcons name="movie-open-play-outline" size={14} color="#D8ECFF" />
              <Text style={styles.staleBannerText}>预览生成失败，已切换为实时播放兜底</Text>
            </View>
          ) : null}

          <View style={[styles.footer, { bottom: footerBottom }]} onLayout={onFooterLayout}>
            {!isCompactPlayback ? (
              <>
                <Text style={styles.previewLabel}>
                  {previewVideoActive
                    ? '预览视频'
                    : realtimePlaybackEnabled
                      ? '实时预览'
                      : '正在准备预览'}
                  {' · '}
                  {layoutContract.resolvedAspectRatio}
                  {' · '}
                  {realtimePlaybackEnabled ? '失败兜底' : '自动'}
                </Text>
                {playbackInteractive && formattedShotTime ? (
                  <Text style={styles.metaText}>{formattedShotTime}</Text>
                ) : null}
                {playbackInteractive && activeScene?.chapter ? (
                  <Text style={styles.metaText}>{getChapterTitle(activeScene.chapter)}</Text>
                ) : null}
                {realtimePlaybackEnabled ? (
                  <Text style={styles.metaText}>{getMusicStatusText(musicStatus)}</Text>
                ) : waitingForPreview ? (
                  <Text style={styles.metaText}>生成完成后将自动开始播放</Text>
                ) : null}
                {realtimePlaybackEnabled && currentAudioSegment?.title ? (
                  <Text numberOfLines={1} style={styles.metaText}>
                    配乐片段：{currentAudioSegment.title}
                  </Text>
                ) : null}
              </>
            ) : null}
            {playbackInteractive && progressVisible ? (
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

            {playbackInteractive ? (
              <View style={styles.controlsRow}>
                <Pressable
                  onPress={toggleLandscapePlayback}
                  style={({ pressed }) => [styles.controlBtn, pressed && styles.pressed]}
                >
                  <MaterialCommunityIcons
                    name={isLandscapePlayback ? 'crop-portrait' : 'crop-landscape'}
                    size={22}
                    color="#FFF8F0"
                  />
                </Pressable>
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
            ) : null}
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

      {isExporting ? (
        <View pointerEvents="none" style={styles.exportOverlay}>
          <View style={styles.exportCard}>
            <ActivityIndicator size="small" color="#F8F8F2" />
            <Text style={styles.exportTitle}>正在导出视频</Text>
            <Text style={styles.exportText}>{exportProgress.label}</Text>
            <View style={styles.exportProgressTrack}>
              <View
                style={[
                  styles.exportProgressFill,
                  { width: `${Math.max(8, Math.round(exportProgress.progress * 100))}%` },
                ]}
              />
            </View>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  previewCanvas: {
    position: 'absolute',
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  canvasSurface: {
    flex: 1,
    backgroundColor: '#000000',
  },
  previewWaitingSurface: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
  },
  previewVideo: {
    ...StyleSheet.absoluteFillObject,
  },
  sceneLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  canvasScene: {
    ...StyleSheet.absoluteFillObject,
  },
  photoStage: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  photoCanvasImage: {
    ...StyleSheet.absoluteFillObject,
  },
  photoStageImage: {
    width: '100%',
    height: '100%',
  },
  photoMissingCanvas: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoMissingState: {
    width: '88%',
    aspectRatio: 0.88,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'rgba(248,248,242,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(248,248,242,0.08)',
  },
  photoMissingText: {
    color: '#D4D4D0',
    fontSize: 14,
    fontWeight: '700',
  },
  sceneEyebrow: {
    color: '#CA8A04',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  sceneTitle: {
    marginTop: 14,
    color: '#F8F8F2',
    fontWeight: '700',
    textAlign: 'center',
  },
  serifTitle: {
    fontFamily: 'serif',
  },
  titlePlateImageHint: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.28,
    overflow: 'hidden',
  },
  titlePlateImage: {
    width: '100%',
    height: '100%',
  },
  titlePlateImageShade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.66)',
  },
  montageStage: {
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  collageStage: {
    ...StyleSheet.absoluteFillObject,
  },
  collageTile: {
    backgroundColor: 'rgba(248,248,242,0.06)',
    overflow: 'hidden',
  },
  collageSlot: {
    position: 'absolute',
  },
  collageFallbackTile: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(248,248,242,0.08)',
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
  headerActions: {
    flexDirection: 'row',
    gap: 10,
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
  staleBanner: {
    position: 'absolute',
    left: 22,
    right: 22,
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(31,23,18,0.72)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  staleBannerText: {
    color: '#F8E5BF',
    fontSize: 12,
    fontWeight: '700',
  },
  fallbackPlaybackBanner: {
    backgroundColor: 'rgba(25, 66, 108, 0.84)',
  },
  subtitleWrap: {
    position: 'absolute',
    zIndex: 3,
  },
  subtitleTextWrap: {
    paddingVertical: 2,
    paddingHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitleText: {
    color: '#F6F1E8',
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  previewStatusCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 18,
    borderRadius: 16,
    backgroundColor: 'rgba(12,12,12,0.82)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
  },
  previewStatusTitle: {
    color: '#F8F8F2',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  previewStatusText: {
    color: 'rgba(248,248,242,0.72)',
    fontSize: 12,
    textAlign: 'center',
  },
  previewStatusTrack: {
    width: '100%',
    height: 6,
    marginTop: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(248,248,242,0.12)',
    overflow: 'hidden',
  },
  previewStatusFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#CA8A04',
  },
  footer: {
    position: 'absolute',
    left: 18,
    right: 18,
    gap: 8,
  },
  previewLabel: {
    color: '#F8F8F2',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  metaText: {
    color: 'rgba(248,248,242,0.68)',
    fontSize: 12,
    textAlign: 'center',
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
    color: '#F8F8F2',
    fontSize: 11,
    fontWeight: '700',
  },
  progressPreviewText: {
    color: '#CA8A04',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  aspectModeRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  aspectPill: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(248,248,242,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(248,248,242,0.08)',
  },
  aspectPillActive: {
    backgroundColor: 'rgba(202,138,4,0.16)',
    borderColor: 'rgba(202,138,4,0.44)',
  },
  aspectPillText: {
    color: 'rgba(248,248,242,0.72)',
    fontSize: 12,
    fontWeight: '700',
  },
  aspectPillTextActive: {
    color: '#F8F8F2',
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
  exportOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportCard: {
    width: 250,
    borderRadius: 18,
    backgroundColor: 'rgba(12,12,12,0.9)',
    paddingHorizontal: 18,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 8,
  },
  exportTitle: {
    color: '#F8F8F2',
    fontSize: 16,
    fontWeight: '800',
  },
  exportText: {
    color: 'rgba(248,248,242,0.72)',
    fontSize: 13,
    textAlign: 'center',
  },
  exportProgressTrack: {
    width: '100%',
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(248,248,242,0.12)',
    overflow: 'hidden',
    marginTop: 2,
  },
  exportProgressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#CA8A04',
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
