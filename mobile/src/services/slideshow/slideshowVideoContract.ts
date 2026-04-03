import type {
  ResolvedVideoAspectRatio,
  SlideshowCompositionProfile,
  SlideshowRect,
  SlideshowVideoLayoutContract,
  VideoAspectMode,
} from '@/types/slideshow';

export const LANDSCAPE_VIDEO_CANVAS = {
  width: 1920,
  height: 1080,
} as const;

export const PORTRAIT_VIDEO_CANVAS = {
  width: 1080,
  height: 1920,
} as const;

export function resolveVideoAspectRatio(
  aspectMode: VideoAspectMode,
  compositionProfile: SlideshowCompositionProfile,
): ResolvedVideoAspectRatio {
  if (aspectMode === 'landscape') {
    return '16:9';
  }
  if (aspectMode === 'portrait') {
    return '9:16';
  }
  return compositionProfile.orientation === 'landscape-dominant' ? '16:9' : '9:16';
}

export function getCanvasSizeForAspectRatio(resolvedAspectRatio: ResolvedVideoAspectRatio): {
  width: number;
  height: number;
} {
  return resolvedAspectRatio === '16:9'
    ? { ...LANDSCAPE_VIDEO_CANVAS }
    : { ...PORTRAIT_VIDEO_CANVAS };
}

function createRect(
  x: number,
  y: number,
  width: number,
  height: number,
  canvasWidth: number,
  canvasHeight: number,
): SlideshowRect {
  return {
    x: Math.max(0, Math.round(x)),
    y: Math.max(0, Math.round(y)),
    width: Math.max(0, Math.min(canvasWidth, Math.round(width))),
    height: Math.max(0, Math.min(canvasHeight, Math.round(height))),
  };
}

function createRectFromStage(
  stageRect: SlideshowRect,
  x: number,
  y: number,
  width: number,
  height: number,
  canvasWidth: number,
  canvasHeight: number,
): SlideshowRect {
  return createRect(stageRect.x + x, stageRect.y + y, width, height, canvasWidth, canvasHeight);
}

export function fitAspectRatioWithinBounds(params: {
  maxWidth: number;
  maxHeight: number;
  resolvedAspectRatio: ResolvedVideoAspectRatio;
}): { width: number; height: number } {
  const aspectRatio = params.resolvedAspectRatio === '16:9' ? 16 / 9 : 9 / 16;
  const safeMaxWidth = Math.max(1, params.maxWidth);
  const safeMaxHeight = Math.max(1, params.maxHeight);
  const boxRatio = safeMaxWidth / safeMaxHeight;

  if (boxRatio > aspectRatio) {
    const height = safeMaxHeight;
    return {
      width: Math.round(height * aspectRatio),
      height: Math.round(height),
    };
  }

  const width = safeMaxWidth;
  return {
    width: Math.round(width),
    height: Math.round(width / aspectRatio),
  };
}

export function buildSlideshowVideoLayoutContract(params: {
  aspectMode: VideoAspectMode;
  compositionProfile: SlideshowCompositionProfile;
  canvasWidth: number;
  canvasHeight: number;
}): SlideshowVideoLayoutContract {
  const resolvedAspectRatio = resolveVideoAspectRatio(params.aspectMode, params.compositionProfile);
  const isLandscape = resolvedAspectRatio === '16:9';
  const canvasWidth = Math.round(params.canvasWidth);
  const canvasHeight = Math.round(params.canvasHeight);

  const horizontalPadding = canvasWidth * 0.09;
  const contentWidth = canvasWidth - horizontalPadding * 2;

  const titleTop = canvasHeight * (isLandscape ? 0.096 : 0.078);
  const titleHeight = canvasHeight * (isLandscape ? 0.14 : 0.156);

  const stageTop = canvasHeight * (isLandscape ? 0.196 : 0.184);
  const stageHeight = canvasHeight * (isLandscape ? 0.62 : 0.586);

  const subtitleSize = Math.max(
    isLandscape ? 20 : 16,
    Math.round((isLandscape ? canvasHeight : canvasWidth) * (isLandscape ? 0.043 : 0.038)),
  );
  const subtitleLineHeight = Math.max(isLandscape ? 30 : 24, Math.round(subtitleSize * 1.5));
  const subtitleHeight = subtitleLineHeight * 2 + Math.round(canvasHeight * 0.01);
  const subtitleOverlayHeight = Math.max(
    subtitleHeight + Math.round(canvasHeight * 0.04),
    Math.round(stageHeight * (isLandscape ? 0.24 : 0.21)),
  );

  const titleSize = Math.max(30, Math.round(canvasWidth * (isLandscape ? 0.046 : 0.058)));
  const titleLineHeight = Math.max(36, Math.round(titleSize * (isLandscape ? 1.14 : 1.1)));
  const stageRect = createRect(
    horizontalPadding,
    stageTop,
    contentWidth,
    stageHeight,
    canvasWidth,
    canvasHeight,
  );
  const subtitleOverlayTop = stageRect.y + stageRect.height - subtitleOverlayHeight;
  const subtitleHorizontalInset = Math.round(stageRect.width * (isLandscape ? 0.085 : 0.082));
  const subtitleSafeTop =
    subtitleOverlayTop + Math.round(subtitleOverlayHeight * (isLandscape ? 0.3 : 0.26));
  const subtitleOverlayRect = createRect(
    stageRect.x,
    subtitleOverlayTop,
    stageRect.width,
    subtitleOverlayHeight,
    canvasWidth,
    canvasHeight,
  );
  const stageGap = Math.max(8, Math.round(canvasWidth * 0.009));
  const stageRadius = Math.max(14, Math.round(canvasWidth * (isLandscape ? 0.02 : 0.026)));
  const leadWidth = Math.round(stageRect.width * 0.58 - stageGap / 2);
  const stackWidth = Math.max(0, stageRect.width - leadWidth - stageGap);
  const stackHeight = Math.round(stageRect.height * 0.5 - stageGap / 2);
  const pairWidth = Math.round((stageRect.width - stageGap) / 2);
  const trioRects = [
    createRectFromStage(stageRect, 0, 0, leadWidth, stageRect.height, canvasWidth, canvasHeight),
    createRectFromStage(
      stageRect,
      leadWidth + stageGap,
      0,
      stackWidth,
      stackHeight,
      canvasWidth,
      canvasHeight,
    ),
    createRectFromStage(
      stageRect,
      leadWidth + stageGap,
      stackHeight + stageGap,
      stackWidth,
      stageRect.height - stackHeight - stageGap,
      canvasWidth,
      canvasHeight,
    ),
  ];
  const pairRects = [
    createRectFromStage(stageRect, 0, 0, pairWidth, stageRect.height, canvasWidth, canvasHeight),
    createRectFromStage(
      stageRect,
      pairWidth + stageGap,
      0,
      stageRect.width - pairWidth - stageGap,
      stageRect.height,
      canvasWidth,
      canvasHeight,
    ),
  ];
  const singleRect = [stageRect];

  return {
    aspectMode: params.aspectMode,
    resolvedAspectRatio,
    canvas: {
      width: canvasWidth,
      height: canvasHeight,
    },
    titleSafeArea: createRect(
      horizontalPadding,
      titleTop,
      contentWidth,
      titleHeight,
      canvasWidth,
      canvasHeight,
    ),
    stageRect,
    subtitleSafeArea: createRect(
      stageRect.x + subtitleHorizontalInset,
      subtitleSafeTop,
      stageRect.width - subtitleHorizontalInset * 2,
      subtitleHeight,
      canvasWidth,
      canvasHeight,
    ),
    subtitleOverlayRect,
    subtitleOverlayHeight,
    stageGap,
    stageRadius,
    tileRadius: Math.max(4, Math.round(canvasWidth * 0.006)),
    montageRects: {
      single: singleRect,
      pair: pairRects,
      trio: trioRects,
    },
    typography: {
      eyebrowSize: Math.max(14, Math.round(canvasWidth * (isLandscape ? 0.017 : 0.022))),
      titleSize,
      titleLineHeight,
      subtitleSize,
      subtitleLineHeight,
      metaSize: Math.max(12, Math.round(canvasWidth * 0.014)),
    },
  };
}
