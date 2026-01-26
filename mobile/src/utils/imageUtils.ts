import * as FileSystem from 'expo-file-system/build/legacy/FileSystem';
import * as ImageManipulator from 'expo-image-manipulator';

import { FILE_SIZE_UNITS, THUMBNAIL_CONFIG } from '@/constants/appConstants';

export interface ThumbnailResult {
  uri: string;
  width: number;
  height: number;
  size: number;
  sizeFormatted: string;
}

export async function generateThumbnail(
  sourceUri: string,
  options: {
    width?: number;
    quality?: number;
    maxSize?: number;
  } = {},
): Promise<ThumbnailResult> {
  const fileInfo = (await FileSystem.getInfoAsync(sourceUri)) as unknown as {
    exists: boolean;
  };
  if (!fileInfo.exists) {
    throw new Error(`文件不存在: ${sourceUri}`);
  }

  const targetWidth = options.width ?? THUMBNAIL_CONFIG.WIDTH;
  const quality = options.quality ?? THUMBNAIL_CONFIG.QUALITY;
  const maxSize = options.maxSize ?? THUMBNAIL_CONFIG.MAX_SIZE;

  const meta = await ImageManipulator.manipulateAsync(sourceUri, [], {
    compress: 1,
    format: ImageManipulator.SaveFormat.JPEG,
  });

  const resizeWidth = meta.width > targetWidth ? targetWidth : meta.width;

  const result = await ImageManipulator.manipulateAsync(
    sourceUri,
    [{ resize: { width: resizeWidth } }],
    { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
  );

  const info = (await FileSystem.getInfoAsync(result.uri)) as unknown as {
    exists: boolean;
    size?: number;
  };
  let size = 0;
  if (info.exists) {
    size = (info as { size?: number }).size ?? 0;
  }
  if (size > maxSize) {
    return compressToSize(sourceUri, resizeWidth, maxSize);
  }

  return {
    uri: result.uri,
    width: result.width,
    height: result.height,
    size,
    sizeFormatted: formatFileSize(size),
  };
}

async function compressToSize(
  sourceUri: string,
  width: number,
  maxSize: number,
  minQuality: number = 0.5,
): Promise<ThumbnailResult> {
  let quality = THUMBNAIL_CONFIG.QUALITY;
  let lastResult: ThumbnailResult | null = null;

  while (quality >= minQuality) {
    const result = await ImageManipulator.manipulateAsync(sourceUri, [{ resize: { width } }], {
      compress: quality,
      format: ImageManipulator.SaveFormat.JPEG,
    });

    const info = (await FileSystem.getInfoAsync(result.uri)) as unknown as {
      exists: boolean;
      size?: number;
    };
    let size = 0;
    if (info.exists) {
      size = (info as { size?: number }).size ?? 0;
    }

    lastResult = {
      uri: result.uri,
      width: result.width,
      height: result.height,
      size,
      sizeFormatted: formatFileSize(size),
    };

    if (size <= maxSize) {
      return lastResult;
    }

    quality -= 0.1;
  }

  if (!lastResult) {
    throw new Error('无法压缩到目标大小');
  }

  return lastResult;
}

export async function generateThumbnails(
  sourceUris: string[],
  options: {
    width?: number;
    quality?: number;
    maxSize?: number;
  } = {},
  onProgress?: (current: number, total: number) => void,
): Promise<ThumbnailResult[]> {
  const results: ThumbnailResult[] = [];
  const total = sourceUris.length;

  for (let i = 0; i < total; i += 1) {
    const uri = sourceUris[i];
    try {
      const thumbnail = await generateThumbnail(uri, options);
      results.push(thumbnail);
    } catch (error) {
      console.warn('generateThumbnail failed:', uri, error);
    } finally {
      onProgress?.(i + 1, total);
    }
  }

  return results;
}

export function formatFileSize(bytes: number): string {
  if (bytes < FILE_SIZE_UNITS.KB) {
    return `${bytes} B`;
  }
  if (bytes < FILE_SIZE_UNITS.MB) {
    const kb = bytes / FILE_SIZE_UNITS.KB;
    return `${kb.toFixed(1)} KB`;
  }
  const mb = bytes / FILE_SIZE_UNITS.MB;
  return `${mb.toFixed(2)} MB`;
}
