import * as ImagePicker from 'expo-image-picker';

import { PhotoMetadata } from '@/types/photo';
import { extractExifFromAsset, normalizeDateTime } from '@/utils/exifUtils';

export function extractPhotoMetadata(
  asset: ImagePicker.ImagePickerAsset,
  hash: string,
): PhotoMetadata {
  const exif = extractExifFromAsset(asset);

  return {
    uri: asset.uri,
    hash,
    width: asset.width ?? 0,
    height: asset.height ?? 0,
    fileSize: asset.fileSize ?? undefined,
    exif,
  };
}

export function extractPhotoMetadataList(
  assets: ImagePicker.ImagePickerAsset[],
  hashes: string[],
): PhotoMetadata[] {
  return assets.map((asset, index) => extractPhotoMetadata(asset, hashes[index] ?? ''));
}

export function groupByGps(metadataList: PhotoMetadata[]): {
  withGps: PhotoMetadata[];
  withoutGps: PhotoMetadata[];
} {
  const withGps: PhotoMetadata[] = [];
  const withoutGps: PhotoMetadata[] = [];

  metadataList.forEach((metadata) => {
    if (metadata.exif.hasGps) {
      withGps.push(metadata);
    } else {
      withoutGps.push(metadata);
    }
  });

  return { withGps, withoutGps };
}

export function formatShootTime(shootTime?: string): string {
  if (!shootTime) {
    return '未知时间';
  }

  const normalized = normalizeDateTime(shootTime);
  const date = new Date(normalized);

  if (Number.isNaN(date.getTime())) {
    return '未知时间';
  }

  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, '0');
  const dd = `${date.getDate()}`.padStart(2, '0');
  const hh = `${date.getHours()}`.padStart(2, '0');
  const min = `${date.getMinutes()}`.padStart(2, '0');

  return `${yyyy}年${mm}月${dd}日 ${hh}:${min}`;
}
