import type { EventPhotoItem, EventRecord } from '@/types/event';

export type SlideshowPhoto = EventPhotoItem;

export type SlideshowEventContext = Pick<EventRecord, 'id' | 'title' | 'musicUrl' | 'storyText'>;

export enum PlaybackState {
  Playing = 'playing',
  Paused = 'paused',
}

export type SlideshowProps = {
  photos: SlideshowPhoto[];
  event: SlideshowEventContext;
  onClose: () => void;
};
