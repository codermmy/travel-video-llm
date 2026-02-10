import type { EventChapter } from '@/types/chapter';
import type { PhotoGroup } from '@/types/photoGroup';

export type EventStatus =
  | 'clustered'
  | 'ai_pending'
  | 'ai_processing'
  | 'generated'
  | 'ai_failed';

export interface EventRecord {
  id: string;
  title: string;
  locationName?: string | null;
  gpsLat?: number | null;
  gpsLon?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  photoCount: number;
  coverPhotoUrl?: string | null;
  storyText?: string | null;
  fullStory?: string | null;
  detailedLocation?: string | null;
  locationTags?: string | null;
  emotionTag?: string | null;
  musicUrl?: string | null;
  status: EventStatus;
  aiError?: string | null;
  updatedAt?: string | null;
}

export interface EventListResult {
  items: EventRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface EventPhotoItem {
  id: string;
  photoUrl?: string | null;
  thumbnailUrl?: string | null;
  shootTime?: string | null;
  gpsLat?: number | null;
  gpsLon?: number | null;
  storyText?: string | null;
  caption?: string | null;
  photoIndex?: number | null;
  visualDesc?: string | null;
  microStory?: string | null;
  emotionTag?: string | null;
}

export interface EventDetail extends EventRecord {
  photos: EventPhotoItem[];
  chapters: EventChapter[];
  photoGroups: PhotoGroup[];
}

export interface RegenerateStoryResult {
  taskId?: string | null;
  status: 'queued' | 'processed_inline';
}
