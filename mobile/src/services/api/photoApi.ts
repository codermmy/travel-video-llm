import { apiClient } from './client';

import {
  PhotoListResult,
  PhotoMetadata,
  PhotoRecord,
  PhotoStats,
  PhotoUploadResult,
} from '@/types/photo';
import { toSafeIsoDateTime } from '@/utils/dateTimeUtils';

type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
  timestamp: string;
};

type CheckDuplicatesData = {
  newHashes: string[];
  existingHashes: string[];
  totalCount: number;
};

type UploadFileResult = {
  path: string;
  size: number;
};

type PhotoUploadItem = {
  hash: string;
  thumbnailPath: string;
  gpsLat?: number;
  gpsLon?: number;
  shootTime?: string;
  width?: number;
  height?: number;
  fileSize?: number;
};

const UPLOAD_METADATA_BATCH_SIZE = 200;

async function uploadPhotoFile(fileHash: string, uri: string): Promise<UploadFileResult> {
  const formData = new FormData();
  const fileField = { uri, name: `${fileHash}.jpg`, type: 'image/jpeg' };
  formData.append('file', fileField as unknown as Blob);

  const response = await apiClient.post<ApiResponse<UploadFileResult>>(
    '/api/v1/photos/upload/file',
    formData,
    {
      params: { file_hash: fileHash },
      headers: { 'Content-Type': 'multipart/form-data' },
    },
  );

  return response.data.data;
}

async function uploadMetadata(
  items: PhotoUploadItem[],
  options?: { triggerClustering?: boolean },
): Promise<PhotoUploadResult> {
  const response = await apiClient.post<ApiResponse<PhotoUploadResult>>(
    '/api/v1/photos/upload/metadata',
    {
      photos: items,
      triggerClustering: options?.triggerClustering ?? true,
    },
  );
  return response.data.data;
}

export const photoApi = {
  checkDuplicates: async (hashes: string[]): Promise<CheckDuplicatesData> => {
    const response = await apiClient.post<ApiResponse<CheckDuplicatesData>>(
      '/api/v1/photos/check-duplicates',
      { hashes },
    );
    return response.data.data;
  },

  uploadPhotos: async (
    photos: { uri: string; hash: string; metadata: PhotoMetadata; thumbnailPath: string }[],
    onProgress?: (current: number, total: number) => void,
  ): Promise<PhotoUploadResult> => {
    for (let i = 0; i < photos.length; i += 1) {
      await uploadPhotoFile(photos[i].hash, photos[i].thumbnailPath);
      onProgress?.(i + 1, photos.length);
    }

    const items: PhotoUploadItem[] = photos.map((photo) => ({
      hash: photo.hash,
      thumbnailPath: photo.thumbnailPath,
      gpsLat: photo.metadata.exif.gpsLat,
      gpsLon: photo.metadata.exif.gpsLon,
      shootTime: toSafeIsoDateTime(photo.metadata.exif.shootTime),
      width: photo.metadata.width,
      height: photo.metadata.height,
      fileSize: photo.metadata.fileSize,
    }));

    let uploadedTotal = 0;
    let failedTotal = 0;
    let taskId: string | null | undefined = null;
    for (let start = 0; start < items.length; start += UPLOAD_METADATA_BATCH_SIZE) {
      const chunk = items.slice(start, start + UPLOAD_METADATA_BATCH_SIZE);
      const isLastChunk = start + UPLOAD_METADATA_BATCH_SIZE >= items.length;
      const result = await uploadMetadata(chunk, { triggerClustering: isLastChunk });
      uploadedTotal += result.uploaded;
      failedTotal += result.failed;
      taskId = result.taskId ?? taskId;
    }

    return { uploaded: uploadedTotal, failed: failedTotal, taskId };
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
