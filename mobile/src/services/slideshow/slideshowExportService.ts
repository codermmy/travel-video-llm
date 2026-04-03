import { Alert, Platform, Share } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';

import { buildSlideshowAudioPlan } from '@/services/slideshow/slideshowAudioService';
import { buildSlideshowCompositionProfile } from '@/services/slideshow/slideshowCompositionProfile';
import {
  buildSceneTimeline,
  getSceneDisplayPhoto,
  getTimelineTotalDurationMs,
} from '@/services/slideshow/slideshowSceneBuilder';
import {
  buildSlideshowVideoLayoutContract,
  getCanvasSizeForAspectRatio,
  resolveVideoAspectRatio,
} from '@/services/slideshow/slideshowVideoContract';
import type {
  SlideshowAudioSegment,
  SlideshowEventContext,
  SlideshowPhoto,
  SlideshowScene,
  SlideshowTimelineScene,
  SlideshowVideoLayoutContract,
  VideoAspectMode,
} from '@/types/slideshow';
import { getPhotoOriginalCandidates } from '@/utils/mediaRefs';

const EXPORT_MAX_DURATION_MS = 120_000;
const PHOTO_FLOOR_MS = 1800;
const PHOTO_SUBTITLE_FLOOR_MS = 2200;
const AUXILIARY_FLOOR_MS = 2200;
const EXPORT_CACHE_DIR = `${FileSystem.cacheDirectory || ''}slideshow-export-cache`;
const EXPORT_AUDIO_DIR = `${EXPORT_CACHE_DIR}/audio`;

type NativeExportScene = {
  id: string;
  type: string;
  eyebrow: string | null;
  title: string;
  body: string | null;
  photoUri: string | null;
  photoUris: string[];
  photoIndex: number;
  durationMs: number;
  startMs: number;
  endMs: number;
  transitionPreset: string;
  subtitleDelayMs: number;
};

type NativeSubtitleCue = {
  startMs: number;
  endMs: number;
  text: string;
};

type NativeAudioSegment = SlideshowAudioSegment;

type NativeExportConfig = {
  eventTitle: string;
  aspectMode: VideoAspectMode;
  resolvedAspectRatio: '16:9' | '9:16';
  layoutContract: SlideshowVideoLayoutContract;
  outputWidth: number;
  outputHeight: number;
  outputPath: string;
  includeSubtitles: boolean;
  totalDurationMs: number;
  scenes: NativeExportScene[];
  subtitles: NativeSubtitleCue[];
  audioSegments: NativeAudioSegment[];
};

type NativeExportResult = {
  fileUri: string;
  durationMs: number;
};

export type SlideshowExportProgress = {
  label: string;
  progress: number;
};

type NativeTravelSlideshowExportModule = {
  isAvailable(): boolean;
  exportAsync(configJson: string): Promise<NativeExportResult>;
};

const nativeTravelSlideshowExportModule =
  requireOptionalNativeModule<NativeTravelSlideshowExportModule>('TravelSlideshowExport');

function logExportDebug(label: string, payload: Record<string, unknown>): void {
  if (__DEV__) {
    console.log(`[SlideshowExport] ${label}`, payload);
  }
}

function ensureNativeExportAvailable(): NativeTravelSlideshowExportModule {
  if (Platform.OS !== 'android') {
    throw new Error('当前仅支持 Android 端侧视频导出');
  }

  if (nativeTravelSlideshowExportModule === null) {
    throw new Error(
      '当前 Android 客户端还没包含导出模块。请重新执行 `cd mobile && npx expo run:android` 重装 App；仅重启 Metro 或使用 Expo Go 都不行。',
    );
  }

  if (!nativeTravelSlideshowExportModule.isAvailable()) {
    throw new Error(
      '当前 Android 构建未启用导出模块。请重新执行 `cd mobile && npx expo run:android` 安装最新原生包。',
    );
  }
  return nativeTravelSlideshowExportModule;
}

function createTimelineFromDurations(
  scenes: SlideshowScene[],
  durationsMs: number[],
): SlideshowTimelineScene[] {
  let cursorMs = 0;
  return scenes.map((scene, index) => {
    const durationMs = durationsMs[index] ?? 0;
    const timelineScene: SlideshowTimelineScene = {
      ...scene,
      durationMs,
      startMs: cursorMs,
      endMs: cursorMs + durationMs,
    };
    cursorMs += durationMs;
    return timelineScene;
  });
}

function getMinimumExportDurationMs(scene: SlideshowScene): number {
  if (scene.type === 'photo-frame') {
    return scene.body ? PHOTO_SUBTITLE_FLOOR_MS : PHOTO_FLOOR_MS;
  }
  return AUXILIARY_FLOOR_MS;
}

function shrinkDurations(
  durationsMs: number[],
  floorsMs: number[],
  indices: number[],
  targetReductionMs: number,
): number {
  let remainingReductionMs = targetReductionMs;
  if (remainingReductionMs <= 0) {
    return 0;
  }

  const shrinkableMs = indices.reduce(
    (sum, index) => sum + Math.max(0, durationsMs[index] - floorsMs[index]),
    0,
  );
  if (shrinkableMs <= 0) {
    return 0;
  }

  const ratio = Math.min(1, remainingReductionMs / shrinkableMs);
  for (const index of indices) {
    const availableMs = Math.max(0, durationsMs[index] - floorsMs[index]);
    const nextReductionMs = Math.min(availableMs, Math.floor(availableMs * ratio));
    durationsMs[index] -= nextReductionMs;
    remainingReductionMs -= nextReductionMs;
  }

  if (remainingReductionMs > 0) {
    for (const index of indices) {
      if (remainingReductionMs <= 0) {
        break;
      }
      const availableMs = Math.max(0, durationsMs[index] - floorsMs[index]);
      if (availableMs <= 0) {
        continue;
      }
      const nextReductionMs = Math.min(availableMs, remainingReductionMs);
      durationsMs[index] -= nextReductionMs;
      remainingReductionMs -= nextReductionMs;
    }
  }

  return targetReductionMs - remainingReductionMs;
}

function prunePhotoScenes(
  scenes: SlideshowScene[],
  durationsMs: number[],
  maxTotalDurationMs: number,
): { scenes: SlideshowScene[]; durationsMs: number[] } {
  let nextScenes = [...scenes];
  let nextDurationsMs = [...durationsMs];

  while (
    nextScenes.length > 6 &&
    nextDurationsMs.reduce((sum, value) => sum + value, 0) > maxTotalDurationMs
  ) {
    const removablePhotoIndices = nextScenes
      .map((scene, index) => ({ scene, index }))
      .filter(
        ({ scene, index }) =>
          scene.type === 'photo-frame' && index > 0 && index < nextScenes.length - 1,
      )
      .map(({ index }) => index);

    if (removablePhotoIndices.length === 0) {
      break;
    }

    const removeIndex = removablePhotoIndices[Math.floor(removablePhotoIndices.length / 2)] ?? -1;
    if (removeIndex < 0) {
      break;
    }

    nextScenes = nextScenes.filter((_, index) => index !== removeIndex);
    nextDurationsMs = nextDurationsMs.filter((_, index) => index !== removeIndex);
  }

  return { scenes: nextScenes, durationsMs: nextDurationsMs };
}

function compressExportTimeline(
  scenes: SlideshowScene[],
  baseSlideDurationMs: number,
  maxTotalDurationMs = EXPORT_MAX_DURATION_MS,
): SlideshowTimelineScene[] {
  if (scenes.length === 0) {
    return [];
  }

  const initialTimeline = buildSceneTimeline(scenes, baseSlideDurationMs);
  const initialTotalDurationMs = getTimelineTotalDurationMs(initialTimeline);
  if (initialTotalDurationMs <= maxTotalDurationMs) {
    return initialTimeline;
  }

  let workingScenes = [...scenes];
  let durationsMs = initialTimeline.map((scene) => scene.durationMs);
  const floorsMs = workingScenes.map((scene) => getMinimumExportDurationMs(scene));

  let remainingReductionMs =
    durationsMs.reduce((sum, value) => sum + value, 0) - maxTotalDurationMs;

  const photoIndices = workingScenes
    .map((scene, index) => ({ scene, index }))
    .filter(({ scene }) => scene.type === 'photo-frame')
    .map(({ index }) => index);
  remainingReductionMs -= shrinkDurations(
    durationsMs,
    floorsMs,
    photoIndices,
    remainingReductionMs,
  );

  if (remainingReductionMs > 0) {
    const auxiliaryIndices = workingScenes
      .map((scene, index) => ({ scene, index }))
      .filter(({ scene }) => scene.type !== 'photo-frame')
      .map(({ index }) => index);
    remainingReductionMs -= shrinkDurations(
      durationsMs,
      floorsMs,
      auxiliaryIndices,
      remainingReductionMs,
    );
  }

  if (remainingReductionMs > 0) {
    const pruned = prunePhotoScenes(workingScenes, durationsMs, maxTotalDurationMs);
    workingScenes = pruned.scenes;
    durationsMs = pruned.durationsMs;
  }

  return createTimelineFromDurations(workingScenes, durationsMs);
}

async function ensureExportCacheDir(): Promise<void> {
  await FileSystem.makeDirectoryAsync(EXPORT_CACHE_DIR, { intermediates: true });
  await FileSystem.makeDirectoryAsync(EXPORT_AUDIO_DIR, { intermediates: true });
}

async function resizeForExport(
  sourceUri: string,
  outputSize: { width: number; height: number },
): Promise<string> {
  const meta = await ImageManipulator.manipulateAsync(sourceUri, [], {
    compress: 1,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const actions =
    meta.width >= meta.height
      ? meta.width > outputSize.width
        ? [{ resize: { width: outputSize.width } }]
        : []
      : meta.height > outputSize.height
        ? [{ resize: { height: outputSize.height } }]
        : [];

  if (actions.length === 0) {
    return sourceUri;
  }

  const result = await ImageManipulator.manipulateAsync(sourceUri, actions, {
    compress: 0.88,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return result.uri;
}

async function preparePhotoAssetMap(
  timeline: SlideshowTimelineScene[],
  photos: SlideshowPhoto[],
  outputSize: { width: number; height: number },
  onProgress?: (progress: number) => void,
): Promise<Map<string, string>> {
  const assetMap = new Map<string, string>();
  const uniqueUris = new Set<string>();

  timeline.forEach((scene) => {
    const scenePhoto = getSceneDisplayPhoto(scene, photos);
    if (scenePhoto) {
      getPhotoOriginalCandidates(scenePhoto).forEach((uri) => uniqueUris.add(uri));
    }
    scene.photos.forEach((photo) => {
      getPhotoOriginalCandidates(photo).forEach((uri) => uniqueUris.add(uri));
    });
  });

  const uriList = Array.from(uniqueUris);
  for (const [index, sourceUri] of uriList.entries()) {
    try {
      const resizedUri = await resizeForExport(sourceUri, outputSize);
      assetMap.set(sourceUri, resizedUri);
    } catch (error) {
      console.warn('Failed to prepare export photo asset:', sourceUri, error);
      assetMap.set(sourceUri, sourceUri);
    }
    if (uriList.length > 0) {
      onProgress?.((index + 1) / uriList.length);
    }
  }

  return assetMap;
}

function getAudioCachePath(segment: SlideshowAudioSegment): string {
  const safeId = `${segment.trackId || segment.id}`.replace(/[^\w-]+/g, '-');
  return `${EXPORT_AUDIO_DIR}/${safeId}.mp3`;
}

async function cacheAudioSegmentsLocally(
  segments: SlideshowAudioSegment[],
  onProgress?: (progress: number) => void,
): Promise<SlideshowAudioSegment[]> {
  const cachedBySourceUrl = new Map<string, string>();
  const nextSegments: SlideshowAudioSegment[] = [];

  for (const [index, segment] of segments.entries()) {
    if (!/^https?:\/\//i.test(segment.sourceUrl)) {
      nextSegments.push(segment);
      if (segments.length > 0) {
        onProgress?.((index + 1) / segments.length);
      }
      continue;
    }

    let localUri = cachedBySourceUrl.get(segment.sourceUrl) ?? null;
    if (!localUri) {
      const cachePath = getAudioCachePath(segment);
      const info = await FileSystem.getInfoAsync(cachePath);
      if (info.exists) {
        localUri = info.uri;
      } else {
        logExportDebug('audio_download_start', {
          trackId: segment.trackId,
          sourceUrl: segment.sourceUrl,
        });
        const download = await FileSystem.downloadAsync(segment.sourceUrl, cachePath);
        if (download.status < 200 || download.status >= 300) {
          throw new Error(`audio_download_failed:${download.status}`);
        }
        localUri = download.uri;
        logExportDebug('audio_download_done', {
          trackId: segment.trackId,
          localUri,
        });
      }
      cachedBySourceUrl.set(segment.sourceUrl, localUri);
    }

    nextSegments.push({
      ...segment,
      sourceUrl: localUri,
    });
    if (segments.length > 0) {
      onProgress?.((index + 1) / segments.length);
    }
  }

  return nextSegments;
}

function emitProgress(
  callback: ((progress: SlideshowExportProgress) => void) | undefined,
  progress: SlideshowExportProgress,
): void {
  callback?.(progress);
}

function getMappedPhotoUri(
  photo: SlideshowPhoto | null | undefined,
  assetMap: Map<string, string>,
): string | null {
  const candidates = getPhotoOriginalCandidates(photo);
  for (const candidate of candidates) {
    const mapped = assetMap.get(candidate);
    if (mapped) {
      return mapped;
    }
  }
  return candidates[0] ?? null;
}

function buildSubtitleCues(timeline: SlideshowTimelineScene[]): NativeSubtitleCue[] {
  return timeline
    .filter((scene) => Boolean(scene.body))
    .map((scene) => ({
      startMs: Math.min(scene.endMs, scene.startMs + scene.subtitleDelayMs),
      endMs: scene.endMs,
      text: scene.body || '',
    }))
    .filter((cue) => cue.text.trim().length > 0 && cue.endMs > cue.startMs);
}

function buildNativeScenes(
  timeline: SlideshowTimelineScene[],
  photos: SlideshowPhoto[],
  assetMap: Map<string, string>,
): NativeExportScene[] {
  return timeline.map((scene) => ({
    id: scene.id,
    type: scene.type,
    eyebrow: scene.eyebrow,
    title: scene.title,
    body: scene.body,
    photoUri: getMappedPhotoUri(getSceneDisplayPhoto(scene, photos), assetMap),
    photoUris: scene.photos
      .map((photo) => getMappedPhotoUri(photo, assetMap))
      .filter((uri): uri is string => Boolean(uri)),
    photoIndex: scene.photoIndex,
    durationMs: scene.durationMs,
    startMs: scene.startMs,
    endMs: scene.endMs,
    transitionPreset: scene.transitionPreset,
    subtitleDelayMs: scene.subtitleDelayMs,
  }));
}

function buildOutputPath(eventTitle: string): string {
  const safeTitle = eventTitle.replace(/[^\w\u4e00-\u9fa5-]+/g, '-').slice(0, 36) || 'travel-story';
  return `${EXPORT_CACHE_DIR}/${safeTitle}-${Date.now()}.mp4`;
}

async function saveAndShareExport(fileUri: string): Promise<string | null> {
  const permission = await MediaLibrary.requestPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('导出完成', `视频已生成，但没有相册权限：${fileUri}`);
    return null;
  }

  const asset = await MediaLibrary.createAssetAsync(fileUri);
  await Share.share({
    url: fileUri,
    message: '旅行幻灯片已导出',
  }).catch((error) => {
    console.warn('Failed to share exported video:', error);
  });
  return asset.id ?? null;
}

export async function exportSlideshowVideo(params: {
  event: SlideshowEventContext;
  photos: SlideshowPhoto[];
  scenes: SlideshowScene[];
  slideDurationMs: number;
  includeSubtitles: boolean;
  aspectMode: VideoAspectMode;
  onProgress?: (progress: SlideshowExportProgress) => void;
}): Promise<NativeExportResult & { assetId: string | null }> {
  const nativeModule = ensureNativeExportAvailable();
  emitProgress(params.onProgress, { label: '正在准备导出环境...', progress: 0.08 });
  await ensureExportCacheDir();

  const exportTimeline = compressExportTimeline(
    params.scenes,
    params.slideDurationMs,
    EXPORT_MAX_DURATION_MS,
  );
  emitProgress(params.onProgress, { label: '正在分析视频比例...', progress: 0.16 });
  const compositionProfile = buildSlideshowCompositionProfile(params.photos);
  const resolvedAspectRatio = resolveVideoAspectRatio(params.aspectMode, compositionProfile);
  const outputSize = getCanvasSizeForAspectRatio(resolvedAspectRatio);
  const layoutContract = buildSlideshowVideoLayoutContract({
    aspectMode: params.aspectMode,
    compositionProfile,
    canvasWidth: outputSize.width,
    canvasHeight: outputSize.height,
  });
  emitProgress(params.onProgress, { label: '正在整理照片素材...', progress: 0.24 });
  const assetMap = await preparePhotoAssetMap(
    exportTimeline,
    params.photos,
    outputSize,
    (value) => {
      emitProgress(params.onProgress, {
        label: '正在整理照片素材...',
        progress: 0.24 + value * 0.26,
      });
    },
  );
  emitProgress(params.onProgress, { label: '正在匹配配乐片段...', progress: 0.54 });
  const audioPlan = await buildSlideshowAudioPlan({
    event: params.event,
    photos: params.photos,
    timeline: exportTimeline,
  });
  const cachedAudioSegments = await cacheAudioSegmentsLocally(audioPlan.segments, (value) => {
    emitProgress(params.onProgress, {
      label: '正在缓存配乐资源...',
      progress: 0.54 + value * 0.12,
    });
  });

  const config: NativeExportConfig = {
    eventTitle: params.event.title,
    aspectMode: params.aspectMode,
    resolvedAspectRatio,
    layoutContract,
    outputWidth: outputSize.width,
    outputHeight: outputSize.height,
    outputPath: buildOutputPath(params.event.title),
    includeSubtitles: params.includeSubtitles,
    totalDurationMs: getTimelineTotalDurationMs(exportTimeline),
    scenes: buildNativeScenes(exportTimeline, params.photos, assetMap),
    subtitles: params.includeSubtitles ? buildSubtitleCues(exportTimeline) : [],
    audioSegments: cachedAudioSegments,
  };

  emitProgress(params.onProgress, {
    label: `正在生成 ${resolvedAspectRatio} 成片...`,
    progress: 0.72,
  });
  logExportDebug('export_start', {
    eventId: params.event.id,
    aspectMode: params.aspectMode,
    resolvedAspectRatio,
    includeSubtitles: params.includeSubtitles,
    sceneCount: config.scenes.length,
    subtitleCount: config.subtitles.length,
    audioSegmentCount: config.audioSegments.length,
    totalDurationMs: config.totalDurationMs,
  });
  const result = await nativeModule.exportAsync(JSON.stringify(config));
  emitProgress(params.onProgress, { label: '正在保存到系统相册...', progress: 0.92 });
  logExportDebug('export_done', {
    fileUri: result.fileUri,
    durationMs: result.durationMs,
  });
  const assetId = await saveAndShareExport(result.fileUri);
  emitProgress(params.onProgress, { label: '导出完成', progress: 1 });
  return {
    ...result,
    assetId,
  };
}
