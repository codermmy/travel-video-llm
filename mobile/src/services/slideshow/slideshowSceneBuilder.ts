import type { EventChapter } from '@/types/chapter';
import type {
  SlideshowPhoto,
  SlideshowScene,
  SlideshowTimelineScene,
  TransitionPreset,
} from '@/types/slideshow';

export const DEFAULT_SLIDE_DURATION_MS = 3200;

const GENERIC_CAPTION_SET = new Set([
  '旅途瞬间 · 光影流动 · 当下心情',
  '旅途瞬间·光影流动·当下心情',
]);

export function normalizeSlideshowText(text?: string | null): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

export function isGenericCaption(input?: string | null): boolean {
  if (!input) {
    return false;
  }
  const normalized = input.replace(/\s+/g, '').trim();
  return GENERIC_CAPTION_SET.has(normalized);
}

function computeReadingDuration(text: string, minMs: number, maxMs: number): number {
  const charCount = normalizeSlideshowText(text).length;
  const estimate = 1400 + charCount * 95;
  return Math.max(minMs, Math.min(maxMs, estimate));
}

export function buildPhotoSubtitle(
  photo: SlideshowPhoto | null | undefined,
  chapter: EventChapter | null,
): string | null {
  const microStory = normalizeSlideshowText(photo?.microStory);
  if (microStory) {
    return microStory;
  }

  const caption = normalizeSlideshowText(photo?.caption);
  if (caption && !isGenericCaption(caption)) {
    return caption;
  }

  const slideshowCaption = normalizeSlideshowText(chapter?.slideshowCaption);
  if (slideshowCaption) {
    return slideshowCaption;
  }

  return null;
}

export function getChapterTitle(chapter: EventChapter | null | undefined): string {
  if (!chapter) {
    return '旅行片段';
  }
  return chapter.chapterTitle?.trim() || `第 ${chapter.chapterIndex} 章`;
}

export function getPhotoOrientation(
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

export function getSceneDisplayPhoto(
  scene: SlideshowScene | null | undefined,
  photos: SlideshowPhoto[],
): SlideshowPhoto | null {
  if (!scene) {
    return null;
  }
  return scene.photos[0] ?? scene.photo ?? photos[scene.photoIndex] ?? null;
}

export function getSceneTypeLabel(scene: SlideshowScene | null): string {
  if (!scene) {
    return '';
  }
  if (scene.type === 'title-plate') {
    return scene.narrativeRole === 'chapter-summary' ? 'Title Plate · 尾声' : 'Title Plate';
  }
  if (scene.type === 'montage-frame') {
    return 'Montage Frame';
  }
  return 'Photo Frame';
}

export function getPhotoTransitionPreset(
  photoIndex: number,
  chapter: EventChapter | null,
): TransitionPreset {
  const seed = (chapter?.chapterIndex ?? 0) + photoIndex;
  const presets: TransitionPreset[] = ['dissolve', 'drift-left', 'drift-right', 'zoom-in'];
  return presets[seed % presets.length] ?? 'dissolve';
}

export function getTransitionConfig(preset: TransitionPreset): {
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

function pickCollagePhotos(chapterPhotos: SlideshowPhoto[]): SlideshowPhoto[] {
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

function buildSceneEyebrow(
  role: SlideshowScene['narrativeRole'],
  chapter: EventChapter | null,
): string | null {
  if (role === 'montage' && chapter) {
    return `第 ${chapter.chapterIndex} 章`;
  }
  if (role === 'chapter-intro' && chapter) {
    return `第 ${chapter.chapterIndex} 章`;
  }
  if (role === 'chapter-summary') {
    return '章节尾声';
  }
  return null;
}

export function buildScenes(
  photos: SlideshowPhoto[],
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
        type: 'photo-frame' as const,
        narrativeRole: 'photo' as const,
        chapter: null,
        photo,
        photos: [photo],
        photoIndex,
        eyebrow: null,
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
        normalizeSlideshowText(chapterAtStart.chapterIntro) ||
        normalizeSlideshowText(chapterAtStart.slideshowCaption);
      if (introText) {
        scenes.push({
          id: `chapter-intro-${chapterAtStart.id}`,
          type: 'title-plate',
          narrativeRole: 'chapter-intro',
          chapter: chapterAtStart,
          photo: chapterPhotos[0] ?? null,
          photos: chapterPhotos.slice(0, 1),
          photoIndex,
          eyebrow: buildSceneEyebrow('chapter-intro', chapterAtStart),
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
          type: 'montage-frame',
          narrativeRole: 'montage',
          chapter: chapterAtStart,
          photo: collagePhotos[0] ?? null,
          photos: collagePhotos,
          photoIndex,
          eyebrow: buildSceneEyebrow('montage', chapterAtStart),
          title: getChapterTitle(chapterAtStart),
          body: normalizeSlideshowText(chapterAtStart.slideshowCaption) || null,
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
      type: 'photo-frame',
      narrativeRole: 'photo',
      chapter,
      photo,
      photos: [photo],
      photoIndex,
      eyebrow: null,
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
      const summaryText = normalizeSlideshowText(chapterAtEnd.chapterSummary);
      if (summaryText) {
        scenes.push({
          id: `chapter-summary-${chapterAtEnd.id}`,
          type: 'title-plate',
          narrativeRole: 'chapter-summary',
          chapter: chapterAtEnd,
          photo: chapterPhotos[chapterPhotos.length - 1] ?? chapterPhotos[0] ?? null,
          photos: chapterPhotos.slice(-1),
          photoIndex,
          eyebrow: buildSceneEyebrow('chapter-summary', chapterAtEnd),
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

export function resolveSceneDurationMs(
  scene: SlideshowScene,
  baseSlideDurationMs = DEFAULT_SLIDE_DURATION_MS,
): number {
  if (scene.type === 'photo-frame') {
    return Math.max(baseSlideDurationMs, scene.minimumDurationMs);
  }
  return scene.minimumDurationMs;
}

export function buildSceneTimeline(
  scenes: SlideshowScene[],
  baseSlideDurationMs = DEFAULT_SLIDE_DURATION_MS,
): SlideshowTimelineScene[] {
  let cursorMs = 0;
  return scenes.map((scene) => {
    const durationMs = resolveSceneDurationMs(scene, baseSlideDurationMs);
    const timelineScene: SlideshowTimelineScene = {
      ...scene,
      startMs: cursorMs,
      endMs: cursorMs + durationMs,
      durationMs,
    };
    cursorMs += durationMs;
    return timelineScene;
  });
}

export function getTimelineTotalDurationMs(timeline: SlideshowTimelineScene[]): number {
  return timeline[timeline.length - 1]?.endMs ?? 0;
}

export function findTimelineSceneAtPosition(
  timeline: SlideshowTimelineScene[],
  positionMs: number,
): { scene: SlideshowTimelineScene | null; sceneIndex: number; sceneElapsedMs: number } {
  if (timeline.length === 0) {
    return { scene: null, sceneIndex: 0, sceneElapsedMs: 0 };
  }

  const totalDurationMs = getTimelineTotalDurationMs(timeline);
  const clampedPositionMs = Math.max(0, Math.min(positionMs, Math.max(totalDurationMs - 1, 0)));
  const sceneIndex = timeline.findIndex((scene) => clampedPositionMs < scene.endMs);
  const resolvedIndex = sceneIndex >= 0 ? sceneIndex : timeline.length - 1;
  const scene = timeline[resolvedIndex] ?? null;
  return {
    scene,
    sceneIndex: resolvedIndex,
    sceneElapsedMs: scene ? clampedPositionMs - scene.startMs : 0,
  };
}

export function getSceneHeaderLabel(scene: SlideshowScene | null, totalPhotos: number): string {
  if (!scene) {
    return totalPhotos > 0 ? `1 / ${totalPhotos}` : '旅行片段';
  }
  if (scene.type === 'photo-frame') {
    return `${scene.photoIndex + 1} / ${totalPhotos}`;
  }
  return getChapterTitle(scene.chapter);
}
