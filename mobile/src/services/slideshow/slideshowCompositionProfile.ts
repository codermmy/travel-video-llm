import type {
  SlideshowCompositionProfile,
  SlideshowPhoto,
  CompositionOrientation,
} from '@/types/slideshow';

function getAspectRatio(photo: SlideshowPhoto, runtimeAspectRatio?: number): number | null {
  if (
    typeof runtimeAspectRatio === 'number' &&
    Number.isFinite(runtimeAspectRatio) &&
    runtimeAspectRatio > 0
  ) {
    return runtimeAspectRatio;
  }

  if (
    typeof photo.width === 'number' &&
    typeof photo.height === 'number' &&
    Number.isFinite(photo.width) &&
    Number.isFinite(photo.height) &&
    photo.width > 0 &&
    photo.height > 0
  ) {
    return photo.width / photo.height;
  }

  return null;
}

function resolvePhotoOrientation(
  aspectRatio: number | null,
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

function resolveCompositionOrientation(params: {
  landscapeCount: number;
  portraitCount: number;
  total: number;
}): CompositionOrientation {
  if (params.total <= 0) {
    return 'portrait-dominant';
  }

  if (params.landscapeCount > params.portraitCount) {
    return 'landscape-dominant';
  }

  if (params.portraitCount > params.landscapeCount) {
    return 'portrait-dominant';
  }

  return 'portrait-dominant';
}

export function buildSlideshowCompositionProfile(
  photos: SlideshowPhoto[],
  runtimeAspectRatios?: Record<string, number>,
): SlideshowCompositionProfile {
  let landscapeCount = 0;
  let portraitCount = 0;
  let squareCount = 0;

  for (const photo of photos) {
    const aspectRatio = getAspectRatio(photo, runtimeAspectRatios?.[photo.id]);
    const orientation = resolvePhotoOrientation(aspectRatio);
    if (orientation === 'landscape') {
      landscapeCount += 1;
    } else if (orientation === 'portrait') {
      portraitCount += 1;
    } else if (orientation === 'square') {
      squareCount += 1;
    }
  }

  return {
    orientation: resolveCompositionOrientation({
      landscapeCount,
      portraitCount,
      total: landscapeCount + portraitCount + squareCount,
    }),
    landscapeCount,
    portraitCount,
    squareCount,
  };
}

export function isLandscapeDominantComposition(profile: SlideshowCompositionProfile): boolean {
  return profile.orientation === 'landscape-dominant';
}
