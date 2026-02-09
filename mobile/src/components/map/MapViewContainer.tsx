import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, Text, Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import type { EventRecord } from '@/types/event';
import { EventMarker } from './EventMarker';
import { EventBubble } from './EventBubble';
import type { AMapModule, MapViewProps, MapViewRef, MarkerProps } from './amapTypes';

declare function require(moduleName: string): unknown;

const DEFAULT_AMAP_ANDROID_KEY = '__AMAP_ANDROID_KEY__';
const DEFAULT_AMAP_IOS_KEY = '__AMAP_IOS_KEY__';

interface MapViewContainerProps {
  events: EventRecord[];
  onEventPress: (eventId: string) => void;
}

type AMapLoadStatus = 'idle' | 'ready' | 'missing_keys' | 'module_error';

export const MapViewContainer: React.FC<MapViewContainerProps> = ({ events, onEventPress }) => {
  const mapRef = useRef<MapViewRef | null>(null);
  const [amap, setAmap] = useState<AMapModule | null>(null);
  const [amapStatus, setAmapStatus] = useState<AMapLoadStatus>('idle');
  const [amapError, setAmapError] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);

  const isWeb = Platform.OS === 'web';
  const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  const amapAndroidKey =
    (Constants.expoConfig?.extra as { amap?: { androidKey?: string } } | undefined)?.amap
      ?.androidKey ?? DEFAULT_AMAP_ANDROID_KEY;
  const amapIosKey =
    (Constants.expoConfig?.extra as { amap?: { iosKey?: string } } | undefined)?.amap?.iosKey ??
    DEFAULT_AMAP_IOS_KEY;

  const isConfiguredKey = (key: string, placeholder: string) => Boolean(key && key !== placeholder);
  const isPlatformKeyConfigured =
    Platform.OS === 'android'
      ? isConfiguredKey(amapAndroidKey, DEFAULT_AMAP_ANDROID_KEY)
      : isConfiguredKey(amapIosKey, DEFAULT_AMAP_IOS_KEY);

  const isAmapModule = (value: unknown): value is AMapModule => {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const maybe = value as { MapView?: unknown; Marker?: unknown; AMapSdk?: unknown };
    return Boolean(maybe.MapView && maybe.Marker && maybe.AMapSdk);
  };

  useEffect(() => {
    if (isWeb) {
      // Web doesn't support react-native-amap3d (native module).
      setAmap(null);
      setAmapError(null);
      setAmapStatus('module_error');
      return;
    }

    if (isExpoGo) {
      return;
    }

    if (!isPlatformKeyConfigured) {
      setAmap(null);
      setAmapError(null);
      setAmapStatus('missing_keys');
      return;
    }

    try {
      const mod = require('react-native-amap3d');
      if (!isAmapModule(mod)) {
        console.warn('AMap module loaded but shape is unexpected');
        setAmap(null);
        setAmapError('amap_module_shape_unexpected');
        setAmapStatus('module_error');
        return;
      }
      setAmap(mod);

      if (Platform.OS === 'android') {
        mod.AMapSdk.init(amapAndroidKey);
      } else if (Platform.OS === 'ios') {
        mod.AMapSdk.init(amapIosKey);
      }

      setAmapError(null);
      setAmapStatus('ready');
    } catch (error) {
      console.warn('Failed to load or initialize AMap module:', error);
      setAmap(null);
      setAmapError(String(error));
      setAmapStatus('module_error');
    }
  }, [amapAndroidKey, amapIosKey, isExpoGo, isPlatformKeyConfigured, isWeb]);

  const hasValidGps = (e: EventRecord): e is EventRecord & { gpsLat: number; gpsLon: number } => {
    if (typeof e.gpsLat !== 'number' || typeof e.gpsLon !== 'number') {
      return false;
    }
    if (!Number.isFinite(e.gpsLat) || !Number.isFinite(e.gpsLon)) {
      return false;
    }
    if (Math.abs(e.gpsLat) > 90 || Math.abs(e.gpsLon) > 180) {
      return false;
    }
    return true;
  };

  // Filter events with valid coordinates
  const validEvents = useMemo(() => events.filter(hasValidGps), [events]);
  const selectedEvent = validEvents.find((e) => e.id === selectedEventId);

  useEffect(() => {
    if (!selectedEventId) {
      return;
    }
    if (!selectedEvent) {
      setSelectedEventId(null);
    }
  }, [selectedEvent, selectedEventId]);

  useEffect(() => {
    if (isMapReady && validEvents.length > 0 && mapRef.current) {
      // Calculate bounding box
      let minLat = 90;
      let maxLat = -90;
      let minLon = 180;
      let maxLon = -180;
      validEvents.forEach((e) => {
        const lat = e.gpsLat;
        const lon = e.gpsLon;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
        if (lon < minLon) minLon = lon;
        if (lon > maxLon) maxLon = lon;
      });

      // Add padding
      const latDelta = maxLat - minLat;
      const lonDelta = maxLon - minLon;

      // If only one point, or very close points
      if (latDelta < 0.01 && lonDelta < 0.01) {
        mapRef.current.moveCamera(
          {
            target: {
              latitude: (minLat + maxLat) / 2,
              longitude: (minLon + maxLon) / 2,
            },
            zoom: 15,
          },
          1000,
        );
      } else {
        // AMap3D doesn't have a direct "fitToCoordinates" in the typed ref sometimes,
        // but moveCamera supports bounds?
        // Checking types... MapView methods: moveCamera(CameraUpdate, duration)
        // CameraUpdate can be CameraPosition.
        // Actually, react-native-amap3d v3 doesn't have fitToCoordinates easily exposed in the same way as google maps.
        // But we can set zoom level manually or use the center.
        // For now, let's just center on the first event or average.

        // Better: Average center
        const centerLat = (minLat + maxLat) / 2;
        const centerLon = (minLon + maxLon) / 2;

        // Rough zoom estimation
        // 0.1 delta ~ zoom 10
        // 0.01 delta ~ zoom 14
        const maxDelta = Math.max(latDelta, lonDelta);
        let zoom = 10;
        if (maxDelta < 0.05) zoom = 13;
        if (maxDelta < 0.01) zoom = 15;
        if (maxDelta > 1) zoom = 5;

        mapRef.current.moveCamera(
          {
            target: { latitude: centerLat, longitude: centerLon },
            zoom,
          },
          1000,
        );
      }
    }
  }, [isMapReady, validEvents]);

  if (isWeb) {
    return (
      <View style={styles.fallbackContainer}>
        <Ionicons name="map-outline" size={64} color="#ccc" />
        <Text style={styles.fallbackTitle}>Web 不支持高德地图</Text>
        <Text style={styles.fallbackText}>
          高德地图依赖原生模块，仅 iOS/Android Development Build 可用。
        </Text>
        <View style={styles.eventListPreview}>
          <Text style={styles.previewTitle}>Events ({validEvents.length})</Text>
          {validEvents.slice(0, 3).map((e) => (
            <View key={e.id} style={styles.previewItem}>
              <Text>{e.title}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (isExpoGo) {
    return (
      <View style={styles.fallbackContainer}>
        <Ionicons name="map-outline" size={64} color="#ccc" />
        <Text style={styles.fallbackTitle}>Expo Go 无法显示地图</Text>
        <Text style={styles.fallbackText}>高德地图需要原生模块，Expo Go 不支持该类原生模块。</Text>
        <Text style={styles.fallbackText}>请使用 Development Build（自定义客户端）运行。</Text>
        <View style={styles.eventListPreview}>
          <Text style={styles.previewTitle}>Events ({validEvents.length})</Text>
          {validEvents.slice(0, 3).map((e) => (
            <View key={e.id} style={styles.previewItem}>
              <Text>{e.title}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (!amap) {
    if (amapStatus === 'missing_keys') {
      const keyPath =
        Platform.OS === 'android' ? 'expo.extra.amap.androidKey' : 'expo.extra.amap.iosKey';
      return (
        <View style={styles.fallbackContainer}>
          <Ionicons name="key-outline" size={64} color="#ccc" />
          <Text style={styles.fallbackTitle}>未配置高德地图 Key</Text>
          <Text style={styles.fallbackText}>请在 `mobile/app.json` 中配置：</Text>
          <Text style={styles.fallbackText}>{keyPath}</Text>
          <Text style={styles.fallbackText}>配置后需要重新构建 Development Build。</Text>
        </View>
      );
    }

    if (amapStatus === 'module_error') {
      return (
        <View style={styles.fallbackContainer}>
          <Ionicons name="warning-outline" size={64} color="#ccc" />
          <Text style={styles.fallbackTitle}>地图模块不可用</Text>
          <Text style={styles.fallbackText}>
            请确认你运行的是 Development Build（不是 Expo Go）。
          </Text>
          <Text style={styles.fallbackText}>如果问题持续，可能需要重新安装依赖并重新构建。</Text>
          {amapError && <Text style={styles.fallbackText}>错误: {amapError}</Text>}
        </View>
      );
    }

    return (
      <View style={styles.fallbackContainer}>
        <Ionicons name="map-outline" size={64} color="#ccc" />
        <Text style={styles.fallbackTitle}>地图模块加载中</Text>
        <Text style={styles.fallbackText}>如果你在 Expo Go，这里将无法显示地图。</Text>
        <Text style={styles.fallbackText}>请使用 Development Build 运行以启用高德地图。</Text>
      </View>
    );
  }

  const MapViewComponent = amap.MapView as unknown as React.ComponentType<
    MapViewProps & { ref?: unknown }
  >;
  const MarkerComponent = amap.Marker as unknown as React.ComponentType<MarkerProps>;

  return (
    <View style={styles.container}>
      <MapViewComponent
        ref={(ref: unknown) => {
          mapRef.current = ref ? (ref as unknown as MapViewRef) : null;
        }}
        style={styles.map}
        onLoad={() => setIsMapReady(true)}
        onPress={() => setSelectedEventId(null)}
        initialCameraPosition={{
          target: { latitude: 39.9042, longitude: 116.4074 }, // China default
          zoom: 10,
        }}
      >
        {validEvents.map((event) => (
          <EventMarker
            key={event.id}
            event={event}
            isSelected={selectedEventId === event.id}
            onPress={() => setSelectedEventId(event.id)}
            MarkerComponent={MarkerComponent}
          />
        ))}
      </MapViewComponent>

      {validEvents.length === 0 && (
        <View pointerEvents="none" style={styles.emptyState}>
          <Text style={styles.emptyTitle}>还没有带定位的事件</Text>
          <Text style={styles.emptyText}>上传包含 GPS 信息的照片后，这里会显示足迹标记。</Text>
        </View>
      )}

      {selectedEvent && (
        <EventBubble
          event={selectedEvent}
          onPressDetails={() => onEventPress(selectedEvent.id)}
          onClose={() => setSelectedEventId(null)}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  fallbackContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f5f5f5',
  },
  fallbackTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
    color: '#333',
  },
  fallbackText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 4,
  },
  eventListPreview: {
    marginTop: 24,
    width: '100%',
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  previewTitle: {
    fontWeight: 'bold',
    marginBottom: 8,
  },
  previewItem: {
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  emptyState: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 18,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111',
    marginBottom: 2,
  },
  emptyText: {
    fontSize: 12,
    color: '#555',
    lineHeight: 16,
  },
});
