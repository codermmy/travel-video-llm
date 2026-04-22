import type { EventRecord } from '@/types/event';
import type { CameraState } from '@/types/mapStack';

export type EventPoint = EventRecord & { gpsLat: number; gpsLon: number };

export interface EventCluster {
  id: string;
  center: {
    latitude: number;
    longitude: number;
  };
  events: EventPoint[];
  count: number;
}

const EARTH_RADIUS_KM = 6371;
const TILE_SIZE = 256;
const CLUSTER_PIXEL_RADIUS = 56;

function toRadians(degree: number): number {
  return (degree * Math.PI) / 180;
}

export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

export function hasValidGps(event: EventRecord): event is EventPoint {
  if (typeof event.gpsLat !== 'number' || typeof event.gpsLon !== 'number') {
    return false;
  }
  if (!Number.isFinite(event.gpsLat) || !Number.isFinite(event.gpsLon)) {
    return false;
  }
  if (Math.abs(event.gpsLat) > 90 || Math.abs(event.gpsLon) > 180) {
    return false;
  }
  return true;
}

function buildClusterId(events: EventPoint[]): string {
  const ids = events.map((event) => event.id).sort();
  return ids.join('__');
}

function projectToWorldPixel(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const scale = TILE_SIZE * 2 ** zoom;
  const clampedLat = Math.max(Math.min(lat, 85.05112878), -85.05112878);
  const sinLat = Math.sin(toRadians(clampedLat));

  return {
    x: ((lon + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
}

function getPixelDistance(left: { x: number; y: number }, right: { x: number; y: number }): number {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function clusterEvents(events: EventPoint[], zoom: number): EventCluster[] {
  if (events.length === 0) {
    return [];
  }

  const projectedPoints = new Map(
    events.map((event) => [event.id, projectToWorldPixel(event.gpsLat, event.gpsLon, zoom)]),
  );

  const clusters: EventCluster[] = [];
  const processed = new Set<string>();

  for (const event of events) {
    if (processed.has(event.id)) {
      continue;
    }

    const nearby: EventPoint[] = [];
    const queue: EventPoint[] = [event];
    processed.add(event.id);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      nearby.push(current);
      const currentProjection = projectedPoints.get(current.id);
      if (!currentProjection) {
        continue;
      }

      for (const other of events) {
        if (processed.has(other.id)) {
          continue;
        }

        const otherProjection = projectedPoints.get(other.id);
        if (!otherProjection) {
          continue;
        }

        const dist = getPixelDistance(currentProjection, otherProjection);
        if (dist <= CLUSTER_PIXEL_RADIUS) {
          processed.add(other.id);
          queue.push(other);
        }
      }
    }

    const centerLat = nearby.reduce((sum, item) => sum + item.gpsLat, 0) / nearby.length;
    const centerLon = nearby.reduce((sum, item) => sum + item.gpsLon, 0) / nearby.length;

    clusters.push({
      id: buildClusterId(nearby),
      center: { latitude: centerLat, longitude: centerLon },
      events: nearby,
      count: nearby.length,
    });
  }

  return clusters;
}

function computeBounds(events: EventPoint[]): {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
} {
  let minLat = 90;
  let maxLat = -90;
  let minLon = 180;
  let maxLon = -180;

  for (const event of events) {
    if (event.gpsLat < minLat) minLat = event.gpsLat;
    if (event.gpsLat > maxLat) maxLat = event.gpsLat;
    if (event.gpsLon < minLon) minLon = event.gpsLon;
    if (event.gpsLon > maxLon) maxLon = event.gpsLon;
  }

  return { minLat, maxLat, minLon, maxLon };
}

function estimateZoom(bounds: {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}): number {
  const latDelta = Math.abs(bounds.maxLat - bounds.minLat);
  const lonDelta = Math.abs(bounds.maxLon - bounds.minLon);
  const maxDelta = Math.max(latDelta, lonDelta);

  if (maxDelta < 0.02) return 15;
  if (maxDelta < 0.08) return 13;
  if (maxDelta < 0.4) return 11;
  if (maxDelta < 2) return 8;
  return 5;
}

export function getInitialCameraState(events: EventPoint[]): CameraState {
  const bounds = computeBounds(events);
  return {
    target: {
      latitude: (bounds.minLat + bounds.maxLat) / 2,
      longitude: (bounds.minLon + bounds.maxLon) / 2,
    },
    zoom: estimateZoom(bounds),
  };
}

export function getLevelName(cameraState: CameraState): string {
  if (cameraState.zoom <= 5) return '全国';
  if (cameraState.zoom <= 8) return '省级视图';
  if (cameraState.zoom <= 11) return '城市视图';
  return '区域视图';
}
