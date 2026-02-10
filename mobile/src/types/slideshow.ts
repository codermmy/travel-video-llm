import type { EventChapter } from '@/types/chapter';
import type { EventPhotoItem, EventRecord } from '@/types/event';
import type { PhotoGroup } from '@/types/photoGroup';

export type SlideshowPhoto = EventPhotoItem;

export type SlideshowEventContext = Pick<
  EventRecord,
  'id' | 'title' | 'musicUrl' | 'storyText' | 'fullStory'
> & {
  chapters?: EventChapter[];
  photoGroups?: PhotoGroup[];
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
