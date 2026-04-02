import type { LocalMediaReference, OnDeviceVisionResult } from './vision';

export interface PhotoExif {
  gpsLat?: number;
  gpsLon?: number;
  hasGps: boolean;
  shootTime: string;
  cameraMake?: string;
  cameraModel?: string;
}

export interface PhotoMetadata extends Partial<LocalMediaReference> {
  uri: string;
  width: number;
  height: number;
  fileSize?: number;
  vision?: OnDeviceVisionResult;
  exif: PhotoExif;
}

export interface PhotoRecord {
  id: string;
  assetId?: string | null;
  fileHash?: string | null;
  localUri?: string | null;
  localThumbnailUri?: string | null;
  localCoverUri?: string | null;
  photoUrl?: string | null;
  thumbnailUrl?: string | null;
  gpsLat?: number | null;
  gpsLon?: number | null;
  shootTime?: string | null;
  eventId?: string | null;
  status?: string | null;
  visionStatus?: 'pending' | 'processing' | 'completed' | 'failed' | 'unsupported' | null;
  visionError?: string | null;
  visionUpdatedAt?: string | null;
  vision?: OnDeviceVisionResult | null;
}

export interface PhotoUploadResult {
  uploaded: number;
  failed: number;
  taskId?: string | null;
  items?: {
    id: string;
    clientRef?: string | null;
    assetId?: string | null;
    gpsLat?: number | null;
    gpsLon?: number | null;
    shootTime?: string | null;
  }[];
}

export interface PhotoListResult {
  items: PhotoRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PhotoStats {
  total: number;
  withGps: number;
  withoutGps: number;
  clustered: number;
  unclustered: number;
}

export interface PhotoBatchEventUpdateResult {
  updated: number;
  impactedEventIds: string[];
  deletedEventIds: string[];
}

export interface PhotoBatchDeleteResult {
  deleted: number;
  impactedEventIds: string[];
  deletedEventIds: string[];
}

export interface PhotoDeleteResult {
  message: string;
  impactedEventIds: string[];
  deletedEventIds: string[];
}
