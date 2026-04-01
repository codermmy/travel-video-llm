import type { EventRecord } from '@/types/event';
import type { CameraState, MapViewStack } from '@/types/mapStack';

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
const MAX_STACK_DEPTH = 10;

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

export function getAdaptiveClusterThreshold(zoom: number): number {
  if (zoom >= 14) return 0;
  if (zoom >= 10) return 0.1;
  if (zoom >= 6) return 1;
  return 10;
}

function buildClusterId(events: EventPoint[]): string {
  const ids = events.map((event) => event.id).sort();
  return ids.join('__');
}

export function clusterEvents(events: EventPoint[], thresholdKm: number): EventCluster[] {
  if (events.length === 0) {
    return [];
  }

  if (thresholdKm <= 0) {
    return events.map((event) => ({
      id: event.id,
      center: { latitude: event.gpsLat, longitude: event.gpsLon },
      events: [event],
      count: 1,
    }));
  }

  const clusters: EventCluster[] = [];
  const processed = new Set<string>();

  for (const event of events) {
    if (processed.has(event.id)) {
      continue;
    }

    const nearby: EventPoint[] = [event];
    processed.add(event.id);

    for (const other of events) {
      if (processed.has(other.id)) {
        continue;
      }

      const dist = haversineDistance(event.gpsLat, event.gpsLon, other.gpsLat, other.gpsLon);
      if (dist <= thresholdKm) {
        nearby.push(other);
        processed.add(other.id);
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

export function initializeStack(events: EventPoint[]): MapViewStack {
  const bounds = computeBounds(events);
  const initialState: CameraState = {
    target: {
      latitude: (bounds.minLat + bounds.maxLat) / 2,
      longitude: (bounds.minLon + bounds.maxLon) / 2,
    },
    zoom: estimateZoom(bounds),
  };

  return {
    states: [initialState],
    initialState,
    currentIndex: 0,
  };
}

export function zoomIntoCluster(cluster: EventCluster, stack: MapViewStack): MapViewStack {
  if (stack.currentIndex >= MAX_STACK_DEPTH - 1) {
    return stack;
  }

  const currentZoom = stack.states[stack.currentIndex]?.zoom ?? stack.initialState.zoom;
  const nextState: CameraState = {
    target: {
      latitude: cluster.center.latitude,
      longitude: cluster.center.longitude,
    },
    zoom: Math.min(currentZoom + 3, 18),
  };

  return {
    ...stack,
    states: [...stack.states.slice(0, stack.currentIndex + 1), nextState],
    currentIndex: stack.currentIndex + 1,
  };
}

export function popStack(stack: MapViewStack): MapViewStack {
  if (stack.currentIndex <= 0) {
    return stack;
  }

  return {
    ...stack,
    currentIndex: stack.currentIndex - 1,
  };
}

export function returnToInitialState(stack: MapViewStack): MapViewStack {
  return {
    ...stack,
    states: [stack.initialState],
    currentIndex: 0,
  };
}

export function getLevelName(cameraState: CameraState): string {
  if (cameraState.zoom <= 5) return '全国';
  if (cameraState.zoom <= 8) return '省级视图';
  if (cameraState.zoom <= 11) return '城市视图';
  return '区域视图';
}
