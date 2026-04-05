import type { EventDetail, EventRecord } from '@/types/event';

const COORDINATE_LOCATION_PATTERN = /^\s*-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?\s*$/;
const PROVINCE_PREFIXES = [
  '内蒙古',
  '黑龙江',
  '广西',
  '宁夏',
  '新疆',
  '西藏',
  '北京',
  '天津',
  '上海',
  '重庆',
  '河北',
  '山西',
  '辽宁',
  '吉林',
  '江苏',
  '浙江',
  '安徽',
  '福建',
  '江西',
  '山东',
  '河南',
  '湖北',
  '湖南',
  '广东',
  '海南',
  '四川',
  '贵州',
  '云南',
  '陕西',
  '甘肃',
  '青海',
  '台湾',
  '香港',
  '澳门',
] as const;
const DETAILED_LOCATION_SUFFIXES = [
  '风景名胜区',
  '旅游度假区',
  '国家森林公园',
  '国家湿地公园',
  '森林公园',
  '湿地公园',
  '国家公园',
  '自然保护区',
  '文化旅游区',
  '风景区',
  '景区',
  '度假区',
  '步行街',
  '古镇',
  '古城',
  '公园',
  '广场',
  '街道',
  '社区',
  '景点',
  '商圈',
  '片区',
  '新区',
  '园区',
  '区',
] as const;

function normalizeLocationText(value?: string | null): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function isCoordinateLocationText(value?: string | null): boolean {
  const normalized = normalizeLocationText(value);
  return Boolean(normalized && COORDINATE_LOCATION_PATTERN.test(normalized));
}

function shortenDetailedLocation(value: string): string {
  const primarySegment = value.split(/[·,，(（]/)[0]?.trim() ?? value.trim();
  for (const suffix of DETAILED_LOCATION_SUFFIXES) {
    if (primarySegment.endsWith(suffix) && primarySegment.length > suffix.length + 1) {
      return primarySegment.slice(0, -suffix.length);
    }
  }
  return primarySegment;
}

function getRegionPrefix(locationName: string): string {
  const matchedPrefix = PROVINCE_PREFIXES.find((prefix) => locationName.startsWith(prefix));
  if (matchedPrefix) {
    return matchedPrefix;
  }
  return locationName.slice(0, 2);
}

function shouldCombineRegionWithDetail(locationName: string): boolean {
  return (
    locationName.endsWith('州') || locationName.endsWith('盟') || locationName.endsWith('地区')
  );
}

export function getReadableLocationText(
  event:
    | Pick<EventRecord, 'locationName' | 'detailedLocation'>
    | Pick<EventDetail, 'locationName' | 'detailedLocation'>
    | null
    | undefined,
): string | null {
  if (!event) {
    return null;
  }

  const locationName = normalizeLocationText(event.locationName);
  if (locationName && !isCoordinateLocationText(locationName)) {
    return locationName;
  }

  const detailedLocation = normalizeLocationText(event.detailedLocation);
  if (detailedLocation && !isCoordinateLocationText(detailedLocation)) {
    return detailedLocation;
  }

  return null;
}

export function getCompactLocationText(
  event:
    | Pick<EventRecord, 'locationName' | 'detailedLocation'>
    | Pick<EventDetail, 'locationName' | 'detailedLocation'>
    | null
    | undefined,
): string | null {
  if (!event) {
    return null;
  }

  const locationName = normalizeLocationText(event.locationName);
  const detailedLocation = normalizeLocationText(event.detailedLocation);
  const shortDetail =
    detailedLocation && !isCoordinateLocationText(detailedLocation)
      ? shortenDetailedLocation(detailedLocation)
      : null;

  if (locationName && !isCoordinateLocationText(locationName)) {
    if (shortDetail && locationName.includes(shortDetail)) {
      return locationName;
    }
    if (shortDetail && shouldCombineRegionWithDetail(locationName)) {
      return `${getRegionPrefix(locationName)}${shortDetail}`;
    }
    return locationName;
  }

  return shortDetail || getReadableLocationText(event);
}

export function needsLocationSupplement(
  event:
    | Pick<EventRecord, 'locationName' | 'detailedLocation' | 'gpsLat' | 'gpsLon'>
    | Pick<EventDetail, 'locationName' | 'detailedLocation' | 'gpsLat' | 'gpsLon'>,
): boolean {
  return !(
    typeof event.gpsLat === 'number' &&
    Number.isFinite(event.gpsLat) &&
    typeof event.gpsLon === 'number' &&
    Number.isFinite(event.gpsLon)
  );
}
