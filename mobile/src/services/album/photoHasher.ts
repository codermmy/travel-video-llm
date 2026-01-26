import * as ImagePicker from 'expo-image-picker';

import { PhotoHashResult } from '@/types/photo';
import { calculateFileHash } from '@/utils/hashUtils';

export async function calculatePhotoHash(
  asset: ImagePicker.ImagePickerAsset,
): Promise<PhotoHashResult> {
  const hash = await calculateFileHash(asset.uri);
  return {
    uri: asset.uri,
    hash,
    width: asset.width ?? 0,
    height: asset.height ?? 0,
  };
}

export async function calculatePhotoHashes(
  assets: ImagePicker.ImagePickerAsset[],
  onProgress?: (current: number, total: number) => void,
): Promise<PhotoHashResult[]> {
  const results: PhotoHashResult[] = [];
  const total = assets.length;

  for (let i = 0; i < total; i += 1) {
    try {
      results.push(await calculatePhotoHash(assets[i]));
    } catch {
      const asset = assets[i];
      results.push({
        uri: asset.uri,
        hash: '',
        width: asset.width ?? 0,
        height: asset.height ?? 0,
      });
    } finally {
      onProgress?.(i + 1, total);
    }
  }

  return results;
}

export function filterNewPhotos(
  photos: PhotoHashResult[],
  existingHashes: Set<string>,
): PhotoHashResult[] {
  return photos.filter((photo) => !photo.hash || !existingHashes.has(photo.hash));
}
