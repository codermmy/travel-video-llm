import { Alert, Image, Platform, Share } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';
import * as Crypto from 'expo-crypto';
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
const EXPORT_VIDEO_DIR = `${EXPORT_CACHE_DIR}/export`;
const EXPORT_AUDIO_DIR = `${EXPORT_CACHE_DIR}/audio-export`;
const EXPORT_STAGING_DIR = `${EXPORT_CACHE_DIR}/staging-export`;
const PREVIEW_VIDEO_DIR = `${EXPORT_CACHE_DIR}/preview`;
const PREVIEW_AUDIO_DIR = `${EXPORT_CACHE_DIR}/audio-preview`;
const PREVIEW_STAGING_DIR = `${EXPORT_CACHE_DIR}/staging-preview`;
const EXPORT_RENDER_FRAME_RATE = 12;
const PREVIEW_RENDER_FRAME_RATE = 6;
const PREVIEW_LANDSCAPE_OUTPUT = { width: 960, height: 540 } as const;
const PREVIEW_PORTRAIT_OUTPUT = { width: 540, height: 960 } as const;
const EXPORT_VIDEO_BITRATE = 5_000_000;
const EXPORT_AUDIO_BITRATE = 96_000;
const EXPORT_SCENE_IMAGE_QUALITY = 92;
const EXPORT_ASSET_IMAGE_COMPRESS = 0.88;
const EXPORT_I_FRAME_INTERVAL_SECONDS = 3;
const PREVIEW_VIDEO_BITRATE = 1_800_000;
const PREVIEW_AUDIO_BITRATE = 64_000;
const PREVIEW_SCENE_IMAGE_QUALITY = 86;
const PREVIEW_ASSET_IMAGE_COMPRESS = 0.86;
const PREVIEW_I_FRAME_INTERVAL_SECONDS = 8;
const PREVIEW_STAGING_MAX_LONG_EDGE = 1440;
const PREVIEW_VIDEO_CACHE_MAX_BYTES = 180 * 1024 * 1024;
const PREVIEW_AUDIO_CACHE_MAX_BYTES = 96 * 1024 * 1024;
const STAGING_CACHE_TTL_SECONDS = 4 * 60 * 60;

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
  frameRate: number;
  videoBitrate: number;
  audioBitrate: number;
  videoIFrameIntervalSeconds: number;
  sceneImageQuality: number;
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

type SlideshowRenderProfile = 'export' | 'preview';

export type SlideshowPreviewVideoResult = NativeExportResult & {
  cacheKey: string;
};

type NativeTravelSlideshowExportModule = {
  isAvailable(): boolean;
  exportAsync(configJson: string): Promise<NativeExportResult>;
};

const nativeTravelSlideshowExportModule =
  requireOptionalNativeModule<NativeTravelSlideshowExportModule>('TravelSlideshowExport');
const previewGenerationTasks = new Map<string, Promise<SlideshowPreviewVideoResult>>();
const SLIDESHOW_EXPORT_DEBUG_ENABLED =
  typeof process !== 'undefined' &&
  typeof process.env === 'object' &&
  process.env?.EXPO_PUBLIC_SLIDESHOW_DEBUG === '1';

function logExportDebug(label: string, payload: Record<string, unknown>): void {
  if (SLIDESHOW_EXPORT_DEBUG_ENABLED) {
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

export function buildSlideshowRenderTimeline(
  scenes: SlideshowScene[],
  baseSlideDurationMs: number,
  maxTotalDurationMs = EXPORT_MAX_DURATION_MS,
): SlideshowTimelineScene[] {
  return compressExportTimeline(scenes, baseSlideDurationMs, maxTotalDurationMs);
}

async function ensureExportCacheDir(): Promise<void> {
  await FileSystem.makeDirectoryAsync(EXPORT_CACHE_DIR, { intermediates: true });
  await FileSystem.makeDirectoryAsync(EXPORT_VIDEO_DIR, { intermediates: true });
  await FileSystem.makeDirectoryAsync(EXPORT_AUDIO_DIR, { intermediates: true });
  await FileSystem.makeDirectoryAsync(EXPORT_STAGING_DIR, { intermediates: true });
  await FileSystem.makeDirectoryAsync(PREVIEW_VIDEO_DIR, { intermediates: true });
  await FileSystem.makeDirectoryAsync(PREVIEW_AUDIO_DIR, { intermediates: true });
  await FileSystem.makeDirectoryAsync(PREVIEW_STAGING_DIR, { intermediates: true });
}

function getProfileVideoBitrate(profile: SlideshowRenderProfile): number {
  return profile === 'preview' ? PREVIEW_VIDEO_BITRATE : EXPORT_VIDEO_BITRATE;
}

function getProfileAudioBitrate(profile: SlideshowRenderProfile): number {
  return profile === 'preview' ? PREVIEW_AUDIO_BITRATE : EXPORT_AUDIO_BITRATE;
}

function getProfileSceneImageQuality(profile: SlideshowRenderProfile): number {
  return profile === 'preview' ? PREVIEW_SCENE_IMAGE_QUALITY : EXPORT_SCENE_IMAGE_QUALITY;
}

function getProfileAssetImageCompress(profile: SlideshowRenderProfile): number {
  return profile === 'preview' ? PREVIEW_ASSET_IMAGE_COMPRESS : EXPORT_ASSET_IMAGE_COMPRESS;
}

function getProfileIFrameIntervalSeconds(profile: SlideshowRenderProfile): number {
  return profile === 'preview' ? PREVIEW_I_FRAME_INTERVAL_SECONDS : EXPORT_I_FRAME_INTERVAL_SECONDS;
}

function getAudioCacheDirForProfile(profile: SlideshowRenderProfile): string {
  return profile === 'preview' ? PREVIEW_AUDIO_DIR : EXPORT_AUDIO_DIR;
}

function getStagingCacheDirForProfile(profile: SlideshowRenderProfile): string {
  return profile === 'preview' ? PREVIEW_STAGING_DIR : EXPORT_STAGING_DIR;
}

function getProfileAssetSaveFormat(profile: SlideshowRenderProfile): ImageManipulator.SaveFormat {
  return profile === 'preview'
    ? ImageManipulator.SaveFormat.WEBP
    : ImageManipulator.SaveFormat.JPEG;
}

function getProfileAssetFileExtension(profile: SlideshowRenderProfile): string {
  return profile === 'preview' ? 'webp' : 'jpg';
}

function sanitizePathSegment(value: string): string {
  const normalized = value.trim().replace(/[^\w\u4e00-\u9fa5-]+/g, '-');
  return normalized.slice(0, 48) || 'slideshow';
}

async function getImageDimensions(sourceUri: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    Image.getSize(
      sourceUri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error),
    );
  });
}

async function trimDirectoryToSize(directoryUri: string, maxBytes: number): Promise<void> {
  const names = await FileSystem.readDirectoryAsync(directoryUri).catch(() => []);
  const entries = await Promise.all(
    names.map(async (name) => {
      const uri = `${directoryUri}/${name}`;
      try {
        const info = await FileSystem.getInfoAsync(uri);
        if (!info.exists || info.isDirectory) {
          return null;
        }
        return {
          uri,
          size: typeof info.size === 'number' ? info.size : 0,
          modificationTime: typeof info.modificationTime === 'number' ? info.modificationTime : 0,
        };
      } catch {
        await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
        return null;
      }
    }),
  );

  const files = entries
    .filter((entry): entry is { uri: string; size: number; modificationTime: number } =>
      Boolean(entry),
    )
    .sort((left, right) => left.modificationTime - right.modificationTime);

  let totalSize = files.reduce((sum, entry) => sum + entry.size, 0);
  for (const file of files) {
    if (totalSize <= maxBytes) {
      break;
    }
    await FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => undefined);
    totalSize -= file.size;
  }
}

async function cleanupPreviewVideosForEvent(eventId: string, keepUri: string): Promise<void> {
  const eventPrefix = `${sanitizePathSegment(eventId)}-`;
  const keepName = keepUri.split('/').pop();
  const names = await FileSystem.readDirectoryAsync(PREVIEW_VIDEO_DIR).catch(() => []);
  await Promise.all(
    names
      .filter((name) => name.startsWith(eventPrefix) && name !== keepName)
      .map((name) =>
        FileSystem.deleteAsync(`${PREVIEW_VIDEO_DIR}/${name}`, { idempotent: true }).catch(
          () => undefined,
        ),
      ),
  );
}

async function getReadableFileInfo(fileUri: string): Promise<FileSystem.FileInfo> {
  try {
    return await FileSystem.getInfoAsync(fileUri);
  } catch (error) {
    await FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => undefined);
    throw error;
  }
}

async function cleanupStaleStagingDirectories(directoryUri: string): Promise<void> {
  const names = await FileSystem.readDirectoryAsync(directoryUri).catch(() => []);
  const cutoffTimestampSeconds = Date.now() / 1000 - STAGING_CACHE_TTL_SECONDS;

  await Promise.all(
    names.map(async (name) => {
      const uri = `${directoryUri}/${name}`;
      try {
        const info = await FileSystem.getInfoAsync(uri);
        if (!info.exists || !info.isDirectory) {
          return;
        }
        const modifiedAt = typeof info.modificationTime === 'number' ? info.modificationTime : 0;
        if (modifiedAt > 0 && modifiedAt < cutoffTimestampSeconds) {
          await FileSystem.deleteAsync(uri, { idempotent: true });
        }
      } catch {
        await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
      }
    }),
  );
}

async function createStagingDirectory(
  profile: SlideshowRenderProfile,
  eventId: string,
): Promise<string> {
  const stagingRoot = getStagingCacheDirForProfile(profile);
  await cleanupStaleStagingDirectories(stagingRoot);
  const nextDirectory = `${stagingRoot}/${sanitizePathSegment(eventId)}-${Date.now()}-${Math.round(
    Math.random() * 1_000_000,
  )}`;
  await FileSystem.makeDirectoryAsync(nextDirectory, { intermediates: true });
  return nextDirectory;
}

function getOutputSizeForProfile(
  profile: SlideshowRenderProfile,
  resolvedAspectRatio: '16:9' | '9:16',
): { width: number; height: number } {
  if (profile === 'preview') {
    return resolvedAspectRatio === '16:9'
      ? { ...PREVIEW_LANDSCAPE_OUTPUT }
      : { ...PREVIEW_PORTRAIT_OUTPUT };
  }
  return getCanvasSizeForAspectRatio(resolvedAspectRatio);
}

function getFrameRateForProfile(profile: SlideshowRenderProfile): number {
  return profile === 'preview' ? PREVIEW_RENDER_FRAME_RATE : EXPORT_RENDER_FRAME_RATE;
}

async function resizeForExport(
  sourceUri: string,
  profile: SlideshowRenderProfile,
  outputSize: { width: number; height: number },
  compressQuality: number,
  stagingDir: string,
  targetName: string,
): Promise<string> {
  const meta = await getImageDimensions(sourceUri);
  const targetLongEdge = profile === 'preview' ? PREVIEW_STAGING_MAX_LONG_EDGE : null;

  const actions =
    profile === 'preview'
      ? meta.width >= meta.height
        ? meta.width > PREVIEW_STAGING_MAX_LONG_EDGE
          ? [{ resize: { width: PREVIEW_STAGING_MAX_LONG_EDGE } }]
          : []
        : meta.height > PREVIEW_STAGING_MAX_LONG_EDGE
          ? [{ resize: { height: PREVIEW_STAGING_MAX_LONG_EDGE } }]
          : []
      : meta.width >= meta.height
        ? meta.width > outputSize.width
          ? [{ resize: { width: outputSize.width } }]
          : []
        : meta.height > outputSize.height
          ? [{ resize: { height: outputSize.height } }]
          : [];

  if (profile !== 'preview' && actions.length === 0) {
    return sourceUri;
  }

  const result = await ImageManipulator.manipulateAsync(sourceUri, actions, {
    compress: compressQuality,
    format: getProfileAssetSaveFormat(profile),
  });
  const targetUri = `${stagingDir}/${targetName}.${getProfileAssetFileExtension(profile)}`;
  await FileSystem.deleteAsync(targetUri, { idempotent: true }).catch(() => undefined);
  await FileSystem.moveAsync({ from: result.uri, to: targetUri });
  logExportDebug('asset_staging_ready', {
    profile,
    sourceUri,
    targetUri,
    sourceWidth: meta.width,
    sourceHeight: meta.height,
    targetLongEdge,
  });
  return targetUri;
}

async function preparePhotoAssetMap(
  timeline: SlideshowTimelineScene[],
  photos: SlideshowPhoto[],
  profile: SlideshowRenderProfile,
  outputSize: { width: number; height: number },
  compressQuality: number,
  stagingDir: string,
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
      const resizedUri = await resizeForExport(
        sourceUri,
        profile,
        outputSize,
        compressQuality,
        stagingDir,
        `asset-${String(index).padStart(4, '0')}`,
      );
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

function getAudioCachePath(
  segment: SlideshowAudioSegment,
  profile: SlideshowRenderProfile,
): string {
  const safeId = `${segment.trackId || segment.id}`.replace(/[^\w-]+/g, '-');
  return `${getAudioCacheDirForProfile(profile)}/${safeId}.mp3`;
}

async function cacheAudioSegmentsLocally(
  segments: SlideshowAudioSegment[],
  profile: SlideshowRenderProfile,
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
      const cachePath = getAudioCachePath(segment, profile);
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
  const safeTitle = sanitizePathSegment(eventTitle) || 'travel-story';
  return `${EXPORT_VIDEO_DIR}/${safeTitle}-${Date.now()}.mp4`;
}

async function buildPreviewCacheKey(params: {
  event: SlideshowEventContext;
  photos: SlideshowPhoto[];
  timeline: SlideshowTimelineScene[];
  aspectMode: VideoAspectMode;
  slideDurationMs: number;
}): Promise<string> {
  const payload = JSON.stringify({
    eventId: params.event.id,
    title: params.event.title,
    storyText: params.event.storyText ?? null,
    fullStory: params.event.fullStory ?? null,
    aspectMode: params.aspectMode,
    slideDurationMs: params.slideDurationMs,
    timeline: params.timeline.map((scene) => ({
      id: scene.id,
      type: scene.type,
      role: scene.narrativeRole,
      title: scene.title,
      body: scene.body,
      photoIndex: scene.photoIndex,
      durationMs: scene.durationMs,
      startMs: scene.startMs,
      endMs: scene.endMs,
      photoIds: scene.photos.map((photo) => photo.id),
    })),
    photos: params.photos.map((photo) => ({
      id: photo.id,
      fileHash: photo.fileHash ?? null,
      assetId: photo.assetId ?? null,
      width: photo.width ?? null,
      height: photo.height ?? null,
      localUri: photo.localUri ?? null,
      photoUrl: photo.photoUrl ?? null,
      caption: photo.caption ?? null,
      microStory: photo.microStory ?? null,
    })),
    chapters: (params.event.chapters ?? []).map((chapter) => ({
      id: chapter.id,
      title: chapter.chapterTitle,
      intro: chapter.chapterIntro,
      summary: chapter.chapterSummary,
      caption: chapter.slideshowCaption,
      photoStartIndex: chapter.photoStartIndex,
      photoEndIndex: chapter.photoEndIndex,
    })),
  });

  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, payload, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
}

function buildPreviewOutputPath(
  eventId: string,
  cacheKey: string,
  resolvedAspectRatio: '16:9' | '9:16',
): string {
  const safeAspectRatio = resolvedAspectRatio.replace(':', 'x');
  return `${PREVIEW_VIDEO_DIR}/${sanitizePathSegment(eventId)}-${cacheKey}-${safeAspectRatio}.mp4`;
}

async function saveAndShareExport(fileUri: string): Promise<string | null> {
  const permission = await MediaLibrary.requestPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('导出完成', `视频已生成，但没有相册权限：${fileUri}`);
    return null;
  }

  const asset = await MediaLibrary.createAssetAsync(fileUri);
  void Share.share({
    url: fileUri,
    message: '旅行幻灯片已导出',
  }).catch((error) => {
    console.warn('Failed to share exported video:', error);
  });
  return asset.id ?? null;
}

async function renderSlideshowVideo(params: {
  profile: SlideshowRenderProfile;
  event: SlideshowEventContext;
  photos: SlideshowPhoto[];
  scenes: SlideshowScene[];
  slideDurationMs: number;
  includeSubtitles: boolean;
  aspectMode: VideoAspectMode;
  outputPath: string;
  onProgress?: (progress: SlideshowExportProgress) => void;
}): Promise<NativeExportResult> {
  const nativeModule = ensureNativeExportAvailable();
  emitProgress(params.onProgress, {
    label: params.profile === 'preview' ? '正在准备视频预览...' : '正在准备导出环境...',
    progress: 0.08,
  });
  await ensureExportCacheDir();
  const stagingDir = await createStagingDirectory(params.profile, params.event.id);

  try {
    const exportTimeline = buildSlideshowRenderTimeline(
      params.scenes,
      params.slideDurationMs,
      EXPORT_MAX_DURATION_MS,
    );
    emitProgress(params.onProgress, {
      label: params.profile === 'preview' ? '正在分析预览比例...' : '正在分析视频比例...',
      progress: 0.16,
    });
    const compositionProfile = buildSlideshowCompositionProfile(params.photos);
    const resolvedAspectRatio = resolveVideoAspectRatio(params.aspectMode, compositionProfile);
    const outputSize = getOutputSizeForProfile(params.profile, resolvedAspectRatio);
    const layoutContract = buildSlideshowVideoLayoutContract({
      aspectMode: params.aspectMode,
      compositionProfile,
      canvasWidth: outputSize.width,
      canvasHeight: outputSize.height,
    });
    emitProgress(params.onProgress, {
      label: params.profile === 'preview' ? '正在压缩预览素材...' : '正在整理照片素材...',
      progress: 0.24,
    });
    const assetMap = await preparePhotoAssetMap(
      exportTimeline,
      params.photos,
      params.profile,
      outputSize,
      getProfileAssetImageCompress(params.profile),
      stagingDir,
      (value) => {
        emitProgress(params.onProgress, {
          label: params.profile === 'preview' ? '正在压缩预览素材...' : '正在整理照片素材...',
          progress: 0.24 + value * 0.26,
        });
      },
    );
    emitProgress(params.onProgress, {
      label: params.profile === 'preview' ? '正在匹配预览配乐...' : '正在匹配配乐片段...',
      progress: 0.54,
    });
    const audioPlan = await buildSlideshowAudioPlan({
      event: params.event,
      photos: params.photos,
      timeline: exportTimeline,
    });
    const cachedAudioSegments = await cacheAudioSegmentsLocally(
      audioPlan.segments,
      params.profile,
      (value) => {
        emitProgress(params.onProgress, {
          label: params.profile === 'preview' ? '正在缓存预览配乐...' : '正在缓存配乐资源...',
          progress: 0.54 + value * 0.12,
        });
      },
    );

    const config: NativeExportConfig = {
      eventTitle: params.event.title,
      aspectMode: params.aspectMode,
      resolvedAspectRatio,
      layoutContract,
      frameRate: getFrameRateForProfile(params.profile),
      videoBitrate: getProfileVideoBitrate(params.profile),
      audioBitrate: getProfileAudioBitrate(params.profile),
      videoIFrameIntervalSeconds: getProfileIFrameIntervalSeconds(params.profile),
      sceneImageQuality: getProfileSceneImageQuality(params.profile),
      outputWidth: outputSize.width,
      outputHeight: outputSize.height,
      outputPath: params.outputPath,
      includeSubtitles: params.includeSubtitles,
      totalDurationMs: getTimelineTotalDurationMs(exportTimeline),
      scenes: buildNativeScenes(exportTimeline, params.photos, assetMap),
      subtitles: params.includeSubtitles ? buildSubtitleCues(exportTimeline) : [],
      audioSegments: cachedAudioSegments,
    };

    emitProgress(params.onProgress, {
      label:
        params.profile === 'preview'
          ? `正在生成 ${resolvedAspectRatio} 预览视频...`
          : `正在生成 ${resolvedAspectRatio} 成片...`,
      progress: 0.72,
    });
    logExportDebug(`${params.profile}_start`, {
      eventId: params.event.id,
      aspectMode: params.aspectMode,
      resolvedAspectRatio,
      includeSubtitles: params.includeSubtitles,
      sceneCount: config.scenes.length,
      subtitleCount: config.subtitles.length,
      audioSegmentCount: config.audioSegments.length,
      totalDurationMs: config.totalDurationMs,
      frameRate: config.frameRate,
      outputWidth: config.outputWidth,
      outputHeight: config.outputHeight,
      stagingDir,
    });
    return await nativeModule.exportAsync(JSON.stringify(config));
  } finally {
    await FileSystem.deleteAsync(stagingDir, { idempotent: true }).catch(() => undefined);
  }
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
  const result = await renderSlideshowVideo({
    ...params,
    profile: 'export',
    outputPath: buildOutputPath(params.event.title),
  });
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

export async function generateSlideshowPreviewVideo(params: {
  event: SlideshowEventContext;
  photos: SlideshowPhoto[];
  scenes: SlideshowScene[];
  slideDurationMs: number;
  aspectMode: VideoAspectMode;
  onProgress?: (progress: SlideshowExportProgress) => void;
}): Promise<SlideshowPreviewVideoResult> {
  await ensureExportCacheDir();
  const previewTimeline = buildSlideshowRenderTimeline(
    params.scenes,
    params.slideDurationMs,
    EXPORT_MAX_DURATION_MS,
  );
  const cacheKey = await buildPreviewCacheKey({
    event: params.event,
    photos: params.photos,
    timeline: previewTimeline,
    aspectMode: params.aspectMode,
    slideDurationMs: params.slideDurationMs,
  });
  const compositionProfile = buildSlideshowCompositionProfile(params.photos);
  const resolvedAspectRatio = resolveVideoAspectRatio(params.aspectMode, compositionProfile);
  const outputPath = buildPreviewOutputPath(params.event.id, cacheKey, resolvedAspectRatio);
  let fileInfo: FileSystem.FileInfo = { exists: false, isDirectory: false, uri: outputPath };
  try {
    fileInfo = await getReadableFileInfo(outputPath);
  } catch (error) {
    console.warn('[SlideshowExport] failed to inspect preview cache file, regenerating', {
      outputPath,
      error,
    });
  }
  if (fileInfo.exists) {
    await cleanupPreviewVideosForEvent(params.event.id, outputPath);
    await trimDirectoryToSize(PREVIEW_VIDEO_DIR, PREVIEW_VIDEO_CACHE_MAX_BYTES);
    await trimDirectoryToSize(PREVIEW_AUDIO_DIR, PREVIEW_AUDIO_CACHE_MAX_BYTES);
    return {
      fileUri: outputPath,
      durationMs: getTimelineTotalDurationMs(previewTimeline),
      cacheKey,
    };
  }

  const taskKey = `${cacheKey}-${resolvedAspectRatio}`;
  const existingTask = previewGenerationTasks.get(taskKey);
  if (existingTask) {
    return existingTask;
  }

  const task = (async () => {
    try {
      const result = await renderSlideshowVideo({
        ...params,
        includeSubtitles: true,
        profile: 'preview',
        outputPath,
      });
      await cleanupPreviewVideosForEvent(params.event.id, outputPath);
      await trimDirectoryToSize(PREVIEW_VIDEO_DIR, PREVIEW_VIDEO_CACHE_MAX_BYTES);
      await trimDirectoryToSize(PREVIEW_AUDIO_DIR, PREVIEW_AUDIO_CACHE_MAX_BYTES);
      return {
        ...result,
        cacheKey,
      };
    } catch (error) {
      await FileSystem.deleteAsync(outputPath, { idempotent: true }).catch(() => undefined);
      throw error;
    }
  })();

  previewGenerationTasks.set(taskKey, task);
  try {
    return await task;
  } finally {
    previewGenerationTasks.delete(taskKey);
  }
}
