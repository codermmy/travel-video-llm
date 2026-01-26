import * as ImagePicker from 'expo-image-picker';

import { PhotoExif } from '@/types/photo';
import { normalizeDateTime } from '@/utils/dateTimeUtils';
import { formatGps, isValidGps } from '@/utils/gpsUtils';

export function extractExifFromAsset(asset: ImagePicker.ImagePickerAsset): PhotoExif {
  const exif =
    typeof asset.exif === 'object' && asset.exif !== null
      ? (asset.exif as Record<string, unknown>)
      : undefined;

  const gpsLat = getExifNumber(exif, ['GPSLatitude', 'gpsLat', 'latitude']);
  const gpsLon = getExifNumber(exif, ['GPSLongitude', 'gpsLon', 'longitude']);
  const hasGps = isValidGps(gpsLat, gpsLon);

  const shootTime = normalizeDateTime(
    getExifString(exif, ['DateTimeOriginal', 'DateTimeDigitized', 'DateTime']),
  );

  return {
    gpsLat,
    gpsLon,
    hasGps,
    shootTime,
    cameraMake: getExifString(exif, ['Make']) ?? undefined,
    cameraModel: getExifString(exif, ['Model']) ?? undefined,
  };
}

export { normalizeDateTime, isValidGps, formatGps };

function getExifString(
  exif: Record<string, unknown> | undefined,
  keys: string[],
): string | undefined {
  if (!exif) {
    return undefined;
  }
  for (const key of keys) {
    const value = exif[key];
    if (typeof value === 'string' && value.trim()) {
      return value;
    }
  }
  return undefined;
}

function getExifNumber(
  exif: Record<string, unknown> | undefined,
  keys: string[],
): number | undefined {
  if (!exif) {
    return undefined;
  }
  for (const key of keys) {
    const value = exif[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const num = Number(value);
      if (Number.isFinite(num)) {
        return num;
      }
    }
  }
  return undefined;
}
