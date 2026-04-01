import * as FileSystem from 'expo-file-system/legacy';

import type { EventPhotoItem } from '@/types/event';
import { generateThumbnail } from '@/utils/imageUtils';

const ENHANCEMENT_MIN_IMAGES = 3;
const ENHANCEMENT_MAX_IMAGES = 5;

export type PreparedEnhancementUpload = {
  photoId: string;
  fileUri: string;
  fileName: string;
  mimeType: string;
};

function getLocalEnhancementSource(photo: EventPhotoItem): string | null {
  return photo.localUri || photo.localCoverUri || photo.localThumbnailUri || null;
}

function coverScoreOf(photo: EventPhotoItem): number {
  const raw = photo.vision?.cover_score;
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0;
}

function spreadPick<T>(items: T[], count: number): T[] {
  if (count >= items.length) {
    return items;
  }

  const result: T[] = [];
  const lastIndex = items.length - 1;
  for (let index = 0; index < count; index += 1) {
    const pickedIndex = Math.round((index / Math.max(1, count - 1)) * lastIndex);
    result.push(items[pickedIndex] as T);
  }
  return result;
}

export function getEnhancementEligiblePhotos(photos: EventPhotoItem[]): EventPhotoItem[] {
  return photos.filter((photo) => Boolean(getLocalEnhancementSource(photo)));
}

export function getRecommendedEnhancementPhotoIds(photos: EventPhotoItem[]): string[] {
  const candidates = getEnhancementEligiblePhotos(photos);
  if (candidates.length < ENHANCEMENT_MIN_IMAGES) {
    return [];
  }

  const targetCount = Math.min(
    ENHANCEMENT_MAX_IMAGES,
    Math.max(ENHANCEMENT_MIN_IMAGES, candidates.length >= 5 ? 5 : candidates.length),
  );
  const scored = [...candidates].sort((left, right) => coverScoreOf(right) - coverScoreOf(left));
  const recommended = scored.filter((photo) => coverScoreOf(photo) > 0).slice(0, targetCount);

  if (recommended.length >= ENHANCEMENT_MIN_IMAGES) {
    return recommended.map((photo) => photo.id);
  }

  return spreadPick(candidates, targetCount).map((photo) => photo.id);
}

export async function prepareEnhancementUploads(
  photos: EventPhotoItem[],
): Promise<PreparedEnhancementUpload[]> {
  if (photos.length < ENHANCEMENT_MIN_IMAGES || photos.length > ENHANCEMENT_MAX_IMAGES) {
    throw new Error('enhancement_photo_count_invalid');
  }

  const uploads: PreparedEnhancementUpload[] = [];
  try {
    for (const photo of photos) {
      const sourceUri = getLocalEnhancementSource(photo);
      if (!sourceUri) {
        throw new Error('enhancement_photo_local_uri_missing');
      }

      const compressed = await generateThumbnail(sourceUri, {
        width: 1600,
        quality: 0.72,
        maxSize: 450 * 1024,
      });
      uploads.push({
        photoId: photo.id,
        fileUri: compressed.uri,
        fileName: `${photo.id}.jpg`,
        mimeType: 'image/jpeg',
      });
    }

    return uploads;
  } catch (error) {
    for (const item of uploads) {
      await FileSystem.deleteAsync(item.fileUri, { idempotent: true }).catch(() => undefined);
    }
    throw error;
  }
}

export async function cleanupPreparedEnhancementUploads(
  uploads: PreparedEnhancementUpload[],
): Promise<void> {
  await Promise.all(
    uploads.map((item) =>
      FileSystem.deleteAsync(item.fileUri, { idempotent: true }).catch(() => undefined),
    ),
  );
}
