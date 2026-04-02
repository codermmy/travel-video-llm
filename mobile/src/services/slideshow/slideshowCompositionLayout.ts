import type { CompositionOrientation, SlideshowPhotoSceneLayout } from '@/types/slideshow';

const LAYOUTS: Record<CompositionOrientation, SlideshowPhotoSceneLayout> = {
  'landscape-dominant': {
    stageLeftRatio: 48 / 1080,
    stageTopRatio: 220 / 1920,
    stageWidthRatio: (1080 - 96) / 1080,
    stageHeightRatio: (1920 * 0.58 - 220) / 1920,
    subtitleTopRatio: (1920 * 0.58 + 24) / 1920,
    subtitleHorizontalPaddingRatio: 70 / 1080,
  },
  'portrait-dominant': {
    stageLeftRatio: 96 / 1080,
    stageTopRatio: 120 / 1920,
    stageWidthRatio: (1080 - 192) / 1080,
    stageHeightRatio: (1920 - 360 - 120) / 1920,
    subtitleTopRatio: (1920 - 360 + 24) / 1920,
    subtitleHorizontalPaddingRatio: 70 / 1080,
  },
};

export function getSlideshowPhotoSceneLayout(
  orientation: CompositionOrientation,
): SlideshowPhotoSceneLayout {
  return LAYOUTS[orientation];
}
