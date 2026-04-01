import { apiClient } from './client';

import type {
  PhotoListResult,
  PhotoMetadata,
  PhotoRecord,
  PhotoStats,
  PhotoUploadResult,
} from '@/types/photo';
import type { OnDeviceVisionResult } from '@/types/vision';
import { toSafeIsoDateTime } from '@/utils/dateTimeUtils';

type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;
};

type PhotoMetadataItem = {
  gpsLat?: number;
  gpsLon?: number;
  shootTime?: string;
  filename?: string;
};

type CheckDuplicatesByMetadataData = {
  newItems: PhotoMetadataItem[];
  existingItems: PhotoMetadataItem[];
  newIndices: number[];
  existingIndices: number[];
  totalCount: number;
};

type PhotoUploadItem = {
  clientRef?: string;
  assetId?: string;
  gpsLat?: number;
  gpsLon?: number;
  shootTime?: string;
  width?: number;
  height?: number;
  fileSize?: number;
  vision?: OnDeviceVisionResult | null;
};

const UPLOAD_METADATA_BATCH_SIZE = 200;
const PEOPLE_COUNT_BUCKETS = new Set<OnDeviceVisionResult['people_count_bucket']>([
  '0',
  '1',
  '2-3',
  '4+',
]);

function toOptionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toOptionalPositiveInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return Math.round(value);
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function toConfidenceMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const numeric = toOptionalFiniteNumber(raw);
    if (numeric !== undefined) {
      result[key] = numeric;
    }
  }
  return result;
}

function sanitizeVisionResult(vision?: OnDeviceVisionResult | null): OnDeviceVisionResult | null {
  if (!vision) {
    return null;
  }

  const sourcePlatform =
    vision.source_platform === 'android-mlkit' ||
    vision.source_platform === 'android-mlkit-fallback' ||
    vision.source_platform === 'unsupported'
      ? vision.source_platform
      : 'unsupported';

  return {
    schema_version: 'single-device-vision/v1',
    source_platform: sourcePlatform,
    generated_at: toSafeIsoDateTime(vision.generated_at) ?? new Date().toISOString(),
    scene_category: typeof vision.scene_category === 'string' ? vision.scene_category : null,
    object_tags: toStringArray(vision.object_tags),
    activity_hint: typeof vision.activity_hint === 'string' ? vision.activity_hint : null,
    people_present: Boolean(vision.people_present),
    people_count_bucket: PEOPLE_COUNT_BUCKETS.has(vision.people_count_bucket)
      ? vision.people_count_bucket
      : '0',
    emotion_hint: typeof vision.emotion_hint === 'string' ? vision.emotion_hint : null,
    ocr_text: typeof vision.ocr_text === 'string' ? vision.ocr_text : '',
    landmark_hint: typeof vision.landmark_hint === 'string' ? vision.landmark_hint : null,
    image_quality_flags: toStringArray(vision.image_quality_flags),
    cover_score: toOptionalFiniteNumber(vision.cover_score) ?? 0,
    confidence_map: toConfidenceMap(vision.confidence_map),
  };
}

async function uploadMetadata(
  items: PhotoUploadItem[],
  options?: { triggerClustering?: boolean },
): Promise<PhotoUploadResult> {
  try {
    const response = await apiClient.post<ApiResponse<PhotoUploadResult>>(
      '/api/v1/photos/upload/metadata',
      {
        photos: items,
        triggerClustering: options?.triggerClustering ?? true,
      },
    );
    return response.data.data;
  } catch (error) {
    const detail =
      error &&
      typeof error === 'object' &&
      'response' in error &&
      (error as { response?: { data?: unknown } }).response?.data;
    console.warn('[photoApi.uploadMetadata] request failed', detail ?? error);
    throw error;
  }
}

export const photoApi = {
  checkDuplicatesByMetadata: async (
    photos: PhotoMetadataItem[],
  ): Promise<CheckDuplicatesByMetadataData> => {
    const response = await apiClient.post<ApiResponse<CheckDuplicatesByMetadataData>>(
      '/api/v1/photos/check-duplicates-by-metadata',
      { photos },
    );
    return response.data.data;
  },

  uploadPhotos: async (
    photos: { metadata: PhotoMetadata; vision?: OnDeviceVisionResult | null }[],
    onProgress?: (current: number, total: number) => void,
  ): Promise<PhotoUploadResult> => {
    const items: PhotoUploadItem[] = photos.map((photo, index) => ({
      clientRef: String(index),
      assetId: photo.metadata.assetId,
      gpsLat: toOptionalFiniteNumber(photo.metadata.exif.gpsLat),
      gpsLon: toOptionalFiniteNumber(photo.metadata.exif.gpsLon),
      shootTime: toSafeIsoDateTime(photo.metadata.exif.shootTime),
      width: toOptionalPositiveInt(photo.metadata.width),
      height: toOptionalPositiveInt(photo.metadata.height),
      fileSize: toOptionalPositiveInt(photo.metadata.fileSize),
      vision: sanitizeVisionResult(photo.vision),
    }));

    let uploadedTotal = 0;
    let failedTotal = 0;
    let taskId: string | null | undefined = null;
    let processedTotal = 0;
    const uploadedItems: NonNullable<PhotoUploadResult['items']> = [];

    for (let start = 0; start < items.length; start += UPLOAD_METADATA_BATCH_SIZE) {
      const chunk = items.slice(start, start + UPLOAD_METADATA_BATCH_SIZE);
      const isLastChunk = start + UPLOAD_METADATA_BATCH_SIZE >= items.length;
      const result = await uploadMetadata(chunk, { triggerClustering: isLastChunk });
      uploadedTotal += result.uploaded;
      failedTotal += result.failed;
      taskId = result.taskId ?? taskId;
      uploadedItems.push(...(result.items ?? []));
      processedTotal += chunk.length;
      onProgress?.(processedTotal, items.length);
    }

    return { uploaded: uploadedTotal, failed: failedTotal, taskId, items: uploadedItems };
  },

  getPhotos: async (params?: {
    page?: number;
    pageSize?: number;
    eventId?: string;
    hasGps?: boolean;
    status?: string;
  }): Promise<PhotoListResult> => {
    const response = await apiClient.get<ApiResponse<PhotoListResult>>('/api/v1/photos', {
      params,
    });
    return response.data.data;
  },

  getPhoto: async (id: string): Promise<PhotoRecord> => {
    const response = await apiClient.get<ApiResponse<PhotoRecord>>(`/api/v1/photos/${id}`);
    return response.data.data;
  },

  updatePhoto: async (
    id: string,
    data: { eventId?: string | null; status?: string | null },
  ): Promise<PhotoRecord> => {
    const response = await apiClient.patch<ApiResponse<PhotoRecord>>(`/api/v1/photos/${id}`, data);
    return response.data.data;
  },

  deletePhoto: async (id: string): Promise<void> => {
    await apiClient.delete(`/api/v1/photos/${id}`);
  },

  getPhotosByEvent: async (
    eventId: string,
    params?: { page?: number; pageSize?: number },
  ): Promise<PhotoListResult> => {
    const response = await apiClient.get<ApiResponse<PhotoListResult>>(
      `/api/v1/photos/event/${eventId}`,
      {
        params,
      },
    );
    return response.data.data;
  },

  getPhotoStats: async (): Promise<PhotoStats> => {
    const response = await apiClient.get<ApiResponse<PhotoStats>>('/api/v1/photos/stats/summary');
    return response.data.data;
  },
};
