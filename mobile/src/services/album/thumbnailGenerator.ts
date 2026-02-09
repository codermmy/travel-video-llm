import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';

import { formatFileSize, generateThumbnail, ThumbnailResult } from '@/utils/imageUtils';
import { calculateFileHash, isValidHash } from '@/utils/hashUtils';

function getThumbnailDir(): string {
  const baseDir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!baseDir) {
    throw new Error('No FileSystem base directory available for thumbnails');
  }
  return `${baseDir}thumbnails/`;
}

async function ensureDirExists(): Promise<void> {
  const dir = getThumbnailDir();
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
}

export function getThumbnailPath(hash: string): string {
  return `${getThumbnailDir()}${hash}.jpg`;
}

export async function hasThumbnail(hash: string): Promise<boolean> {
  const info = await FileSystem.getInfoAsync(getThumbnailPath(hash));
  return info.exists;
}

export async function generateAndSaveThumbnail(
  uri: string,
  hash: string,
): Promise<ThumbnailResult> {
  await ensureDirExists();
  const targetPath = getThumbnailPath(hash);

  if (await hasThumbnail(hash)) {
    const info = (await FileSystem.getInfoAsync(targetPath)) as unknown as {
      exists: boolean;
      size?: number;
    };
    const temp = await ImageManipulator.manipulateAsync(targetPath, [], {
      compress: 1,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    await FileSystem.deleteAsync(temp.uri, { idempotent: true });

    let size = 0;
    if (info.exists) {
      size = (info as { size?: number }).size ?? 0;
    }
    return {
      uri: targetPath,
      width: temp.width,
      height: temp.height,
      size,
      sizeFormatted: formatFileSize(size),
    };
  }

  const thumbnail = await generateThumbnail(uri);
  await FileSystem.moveAsync({ from: thumbnail.uri, to: targetPath });
  return { ...thumbnail, uri: targetPath };
}

export type HashedThumbnailResult = ThumbnailResult & {
  hash: string;
};

export async function generateAndSaveThumbnailWithHash(
  uri: string,
): Promise<HashedThumbnailResult> {
  await ensureDirExists();

  const thumbnail = await generateThumbnail(uri);
  const hash = await calculateFileHash(thumbnail.uri);
  if (!isValidHash(hash)) {
    await FileSystem.deleteAsync(thumbnail.uri, { idempotent: true });
    throw new Error('invalid_thumbnail_hash');
  }

  const targetPath = getThumbnailPath(hash);
  const targetInfo = await FileSystem.getInfoAsync(targetPath);
  if (targetInfo.exists) {
    await FileSystem.deleteAsync(thumbnail.uri, { idempotent: true });
    return { ...thumbnail, uri: targetPath, hash };
  }

  await FileSystem.moveAsync({ from: thumbnail.uri, to: targetPath });
  return { ...thumbnail, uri: targetPath, hash };
}

export async function generateThumbnailsForPhotos(
  photos: { uri: string; hash: string }[],
  onProgress?: (current: number, total: number) => void,
): Promise<ThumbnailResult[]> {
  await ensureDirExists();
  const results: ThumbnailResult[] = new Array(photos.length);

  for (let i = 0; i < photos.length; i += 1) {
    const photo = photos[i];
    try {
      results[i] = await generateAndSaveThumbnail(photo.uri, photo.hash);
    } catch (error) {
      console.warn('generateAndSaveThumbnail failed:', photo.uri, error);
      results[i] = {
        uri: '',
        width: 0,
        height: 0,
        size: 0,
        sizeFormatted: formatFileSize(0),
      };
    } finally {
      onProgress?.(i + 1, photos.length);
    }
  }

  return results;
}

export async function clearThumbnailCache(): Promise<number> {
  const dir = getThumbnailDir();
  const dirInfo = (await FileSystem.getInfoAsync(dir)) as unknown as {
    exists: boolean;
  };
  if (!dirInfo.exists) {
    return 0;
  }

  const files = await FileSystem.readDirectoryAsync(dir);
  await Promise.all(files.map((file) => FileSystem.deleteAsync(dir + file, { idempotent: true })));
  return files.length;
}

export async function getThumbnailCacheSize(): Promise<number> {
  const dir = getThumbnailDir();
  const dirInfo = (await FileSystem.getInfoAsync(dir)) as unknown as {
    exists: boolean;
  };
  if (!dirInfo.exists) {
    return 0;
  }

  const files = await FileSystem.readDirectoryAsync(dir);
  let totalSize = 0;
  for (const file of files) {
    const info = (await FileSystem.getInfoAsync(dir + file)) as unknown as {
      exists: boolean;
      size?: number;
    };
    if (info.exists) {
      totalSize += (info as { size?: number }).size ?? 0;
    }
  }

  return totalSize;
}
