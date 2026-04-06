import type { EventChapter } from '@/types/chapter';
import type { PhotoGroup } from '@/types/photoGroup';
import type { OnDeviceVisionResult } from '@/types/vision';

export type EventStatus =
  | 'clustered'
  | 'waiting_for_vision'
  | 'ai_pending'
  | 'ai_processing'
  | 'generated'
  | 'ai_failed';
export type EventEnhancementStatus = 'none' | 'retained' | 'expired';
export type StoryFreshness = 'fresh' | 'stale';
export type EventVisionStatus =
  | 'pending'
  | 'processing'
  | 'partial'
  | 'completed'
  | 'failed'
  | 'unsupported';

export interface EventVisionSummary {
  status: EventVisionStatus;
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  unsupported: number;
}

export interface EventEnhancementSummary {
  status: EventEnhancementStatus;
  assetCount: number;
  totalBytes: number;
  canRetry: boolean;
  lastUploadedAt?: string | null;
  retainedUntil?: string | null;
}

export interface EnhancementStorageSummary {
  eventCount: number;
  assetCount: number;
  totalBytes: number;
  nextExpiresAt?: string | null;
}

export interface EventRecord {
  id: string;
  title: string;
  locationName?: string | null;
  gpsLat?: number | null;
  gpsLon?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  photoCount: number;
  coverPhotoId?: string | null;
  coverAssetId?: string | null;
  coverShootTime?: string | null;
  coverGpsLat?: number | null;
  coverGpsLon?: number | null;
  localCoverUri?: string | null;
  selectedCoverPhotoId?: string | null;
  coverPhotoUrl?: string | null;
  storyText?: string | null;
  fullStory?: string | null;
  heroTitle?: string | null;
  heroSummary?: string | null;
  detailedLocation?: string | null;
  locationTags?: string | null;
  emotionTag?: string | null;
  musicUrl?: string | null;
  status: EventStatus;
  eventVersion: number;
  storyGeneratedFromVersion?: number | null;
  storyFreshness: StoryFreshness;
  slideshowGeneratedFromVersion?: number | null;
  slideshowFreshness: StoryFreshness;
  hasPendingStructureChanges: boolean;
  titleManuallySet: boolean;
  storyReady: boolean;
  visionSummary: EventVisionSummary;
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
  fileHash?: string | null;
  assetId?: string | null;
  width?: number | null;
  height?: number | null;
  localUri?: string | null;
  localThumbnailUri?: string | null;
  localCoverUri?: string | null;
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
  visionStatus?: 'pending' | 'processing' | 'completed' | 'failed' | 'unsupported' | null;
  visionError?: string | null;
  visionUpdatedAt?: string | null;
  vision?: OnDeviceVisionResult | null;
}

export interface EventDetail extends EventRecord {
  photos: EventPhotoItem[];
  chapters: EventChapter[];
  photoGroups: PhotoGroup[];
  enhancement?: EventEnhancementSummary | null;
}

export interface RegenerateStoryResult {
  taskId?: string | null;
  status: 'queued' | 'processed_inline';
}

export interface EnhanceStoryResult {
  taskId?: string | null;
  status: 'queued' | 'processed_inline';
  enhancement: EventEnhancementSummary;
}
