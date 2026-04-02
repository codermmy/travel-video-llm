import type { EventChapter } from '@/types/chapter';
import type { EventPhotoItem, EventRecord } from '@/types/event';
import type { PhotoGroup } from '@/types/photoGroup';

export type SlideshowPhoto = EventPhotoItem;

export type SlideshowEventContext = Pick<
  EventRecord,
  'id' | 'title' | 'emotionTag' | 'musicUrl' | 'storyText' | 'fullStory'
> & {
  chapters?: EventChapter[];
  photoGroups?: PhotoGroup[];
};

export type SlideshowSceneType = 'chapter-intro' | 'photo' | 'chapter-summary' | 'collage';

export type TransitionPreset =
  | 'chapter-fade'
  | 'dissolve'
  | 'drift-left'
  | 'drift-right'
  | 'zoom-in'
  | 'montage-rise';

export type SlideshowScene = {
  id: string;
  type: SlideshowSceneType;
  chapter: EventChapter | null;
  photo: SlideshowPhoto | null;
  photos: SlideshowPhoto[];
  photoIndex: number;
  title: string;
  body: string | null;
  minimumDurationMs: number;
  transitionPreset: TransitionPreset;
  subtitleDelayMs: number;
};

export type SlideshowTimelineScene = SlideshowScene & {
  startMs: number;
  endMs: number;
  durationMs: number;
};

export type CompositionOrientation = 'portrait-dominant' | 'landscape-dominant';

export type SlideshowCompositionProfile = {
  orientation: CompositionOrientation;
  landscapeCount: number;
  portraitCount: number;
  squareCount: number;
};

export type SlideshowPhotoSceneLayout = {
  stageLeftRatio: number;
  stageTopRatio: number;
  stageWidthRatio: number;
  stageHeightRatio: number;
  subtitleTopRatio: number;
  subtitleHorizontalPaddingRatio: number;
};

export type SlideshowAudioManifestTrack = {
  provider: string;
  selectionBucket: string;
  title: string;
  artistSlug: string;
  sourceTrackId: string;
  sourceSlug: string;
  sourceUrl: string;
  localFilename: string;
  relativeUrl: string;
  moodTags: string[];
  energy: number;
  sceneFit: string[];
  recommendedStartSec: number;
  recommendedEndSec: number;
  durationSec: number;
  fadeInMs: number;
  fadeOutMs: number;
  status: string;
};

export type SlideshowAudioSegment = {
  id: string;
  trackId: string;
  title: string;
  selectionBucket: string;
  sourceUrl: string;
  sourceStartMs: number;
  sourceEndMs: number;
  timelineStartMs: number;
  timelineEndMs: number;
  fadeInMs: number;
  fadeOutMs: number;
};

export type SlideshowAudioPlan = {
  strategy: 'manifest-primary' | 'manifest-multi' | 'manifest-loop' | 'legacy-event' | 'fallback';
  totalDurationMs: number;
  segments: SlideshowAudioSegment[];
  tracks: SlideshowAudioManifestTrack[];
  reason: string | null;
};

export enum PlaybackState {
  Playing = 'playing',
  Paused = 'paused',
}

export type SlideshowProps = {
  photos: SlideshowPhoto[];
  event: SlideshowEventContext;
  onClose: () => void;
};
