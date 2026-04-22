import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';

import { ClusterMarker } from '@/components/map/ClusterMarker';
import { EventCardList } from '@/components/map/EventCardList';
import { JourneyPalette } from '@/styles/colors';
import type { EventRecord } from '@/types/event';
import type { CameraState } from '@/types/mapStack';
import {
  clusterEvents,
  getInitialCameraState,
  hasValidGps,
  haversineDistance,
} from '@/utils/mapClusterUtils';
import { getCompactLocationText } from '@/utils/locationDisplay';
import { getPreferredEventCoverUri } from '@/utils/mediaRefs';
import type { AMapModule, CameraEvent, MapViewProps, MapViewRef, MarkerProps } from './amapTypes';

declare function require(moduleName: string): unknown;

const DEFAULT_AMAP_ANDROID_KEY = '__AMAP_ANDROID_KEY__';
const DEFAULT_AMAP_IOS_KEY = '__AMAP_IOS_KEY__';
const DEFAULT_CAMERA: CameraState = {
  target: { latitude: 39.9042, longitude: 116.4074 },
  zoom: 5,
};
const RESET_DISTANCE_THRESHOLD_KM = 0.3;
const RESET_ZOOM_THRESHOLD = 0.2;

interface MapViewContainerProps {
  events: EventRecord[];
  onEventPress: (eventId: string) => void;
  resetToken?: number;
  onCanResetChange?: (canReset: boolean) => void;
  onSelectionScopeChange?: (
    scope: { locationLabel: string | null; eventCount: number } | null,
  ) => void;
  topInset?: number;
}

type AMapLoadStatus = 'idle' | 'ready' | 'missing_keys' | 'module_error';

export const MapViewContainer: React.FC<MapViewContainerProps> = ({
  events,
  onEventPress,
  resetToken = 0,
  onCanResetChange,
  onSelectionScopeChange,
  topInset = 0,
}) => {
  const mapRef = useRef<MapViewRef | null>(null);
  const [amap, setAmap] = useState<AMapModule | null>(null);
  const [amapStatus, setAmapStatus] = useState<AMapLoadStatus>('idle');
  const [amapError, setAmapError] = useState<string | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);

  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [cameraState, setCameraState] = useState<CameraState>(DEFAULT_CAMERA);

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

  const validEvents = useMemo(() => events.filter(hasValidGps), [events]);
  const initialCamera = useMemo(
    () => (validEvents.length > 0 ? getInitialCameraState(validEvents) : DEFAULT_CAMERA),
    [validEvents],
  );

  useEffect(() => {
    setCameraState(initialCamera);
    setSelectedClusterId(null);
  }, [initialCamera]);

  useEffect(() => {
    if (!isMapReady || !mapRef.current) {
      return;
    }

    mapRef.current.moveCamera(initialCamera, 0);
  }, [initialCamera, isMapReady]);

  const clusters = useMemo(() => {
    if (validEvents.length === 0) {
      return [];
    }
    return clusterEvents(
      validEvents,
      cameraState.zoom ?? initialCamera.zoom ?? DEFAULT_CAMERA.zoom ?? 5,
    );
  }, [cameraState.zoom, initialCamera.zoom, validEvents]);

  const selectedCluster = useMemo(() => {
    if (!selectedClusterId) {
      return null;
    }
    return clusters.find((cluster) => cluster.id === selectedClusterId) || null;
  }, [clusters, selectedClusterId]);

  const canResetView = useMemo(() => {
    if (validEvents.length === 0 || !cameraState.target || !initialCamera.target) {
      return false;
    }

    const zoomDiff = Math.abs(
      (cameraState.zoom ?? initialCamera.zoom ?? 0) - (initialCamera.zoom ?? 0),
    );
    const distance = haversineDistance(
      cameraState.target.latitude,
      cameraState.target.longitude,
      initialCamera.target.latitude,
      initialCamera.target.longitude,
    );

    return zoomDiff > RESET_ZOOM_THRESHOLD || distance > RESET_DISTANCE_THRESHOLD_KM;
  }, [
    cameraState.target,
    cameraState.zoom,
    initialCamera.target,
    initialCamera.zoom,
    validEvents.length,
  ]);

  useEffect(() => {
    onCanResetChange?.(canResetView);
  }, [canResetView, onCanResetChange]);

  useEffect(() => {
    if (resetToken <= 0 || !canResetView || !mapRef.current) {
      return;
    }

    mapRef.current.moveCamera(initialCamera, 400);
    setCameraState(initialCamera);
    setSelectedClusterId(null);
  }, [canResetView, initialCamera, resetToken]);

  useEffect(() => {
    if (clusters.length === 0) {
      setSelectedClusterId(null);
      return;
    }

    if (selectedClusterId && !clusters.some((cluster) => cluster.id === selectedClusterId)) {
      setSelectedClusterId(null);
    }
  }, [clusters, selectedClusterId]);

  const selectionScope = useMemo(() => {
    if (!selectedCluster) {
      return null;
    }

    const locationLabel = selectedCluster.events
      .map((event) => getCompactLocationText(event))
      .find(Boolean);

    return {
      locationLabel: locationLabel ?? null,
      eventCount: selectedCluster.events.length,
    };
  }, [selectedCluster]);

  useEffect(() => {
    onSelectionScopeChange?.(selectionScope);
  }, [onSelectionScopeChange, selectionScope]);

  const handleClusterPress = (clusterId: string) => {
    setSelectedClusterId(clusterId);
  };

  const handleMapPress = () => {
    if (selectedClusterId) {
      setSelectedClusterId(null);
    }
  };

  const handleCameraIdle = (event: { nativeEvent: CameraEvent }) => {
    const nextCamera = event.nativeEvent.cameraPosition;
    const nextTarget = nextCamera?.target;

    if (!nextTarget) {
      return;
    }

    setCameraState((current) => {
      const currentTarget = current.target;
      const nextZoom = nextCamera.zoom ?? current.zoom ?? initialCamera.zoom;

      if (
        currentTarget.latitude === nextTarget.latitude &&
        currentTarget.longitude === nextTarget.longitude &&
        current.zoom === nextZoom
      ) {
        return current;
      }

      return {
        ...current,
        ...nextCamera,
        target: nextTarget,
        zoom: nextZoom,
      };
    });
  };

  if (isWeb) {
    return (
      <View style={styles.fallbackContainer}>
        <View style={styles.fallbackIconWrap}>
          <Ionicons name="map-outline" size={40} color={JourneyPalette.accent} />
        </View>
        <Text style={styles.fallbackTitle}>Web 不支持高德地图</Text>
        <Text style={styles.fallbackText}>
          高德地图依赖原生模块，仅 iOS/Android Development Build 可用。
        </Text>
      </View>
    );
  }

  if (isExpoGo) {
    return (
      <View style={styles.fallbackContainer}>
        <View style={styles.fallbackIconWrap}>
          <Ionicons name="map-outline" size={40} color={JourneyPalette.accentWarm} />
        </View>
        <Text style={styles.fallbackTitle}>Expo Go 无法显示地图</Text>
        <Text style={styles.fallbackText}>高德地图需要原生模块，Expo Go 不支持该类原生模块。</Text>
        <Text style={styles.fallbackText}>请使用 Development Build（自定义客户端）运行。</Text>
      </View>
    );
  }

  if (!amap) {
    if (amapStatus === 'missing_keys') {
      const keyPath =
        Platform.OS === 'android' ? 'expo.extra.amap.androidKey' : 'expo.extra.amap.iosKey';
      return (
        <View style={styles.fallbackContainer}>
          <View style={styles.fallbackIconWrap}>
            <Ionicons name="key-outline" size={40} color={JourneyPalette.warning} />
          </View>
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
          <View style={styles.fallbackIconWrap}>
            <Ionicons name="warning-outline" size={40} color={JourneyPalette.danger} />
          </View>
          <Text style={styles.fallbackTitle}>地图模块不可用</Text>
          <Text style={styles.fallbackText}>
            请确认你运行的是 Development Build（不是 Expo Go）。
          </Text>
          {amapError ? <Text style={styles.fallbackText}>错误: {amapError}</Text> : null}
        </View>
      );
    }

    return (
      <View style={styles.fallbackContainer}>
        <View style={styles.fallbackIconWrap}>
          <Ionicons name="map-outline" size={40} color={JourneyPalette.accent} />
        </View>
        <Text style={styles.fallbackTitle}>地图模块加载中</Text>
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
        onPress={handleMapPress}
        onCameraIdle={handleCameraIdle}
        initialCameraPosition={initialCamera}
      >
        {clusters.map((cluster) => (
          <MarkerComponent
            key={cluster.id}
            position={cluster.center}
            onPress={() => handleClusterPress(cluster.id)}
            zIndex={selectedClusterId === cluster.id ? 100 : 1}
          >
            <ClusterMarker
              coverUrl={getPreferredEventCoverUri(cluster.events[0])}
              clusterCount={cluster.count}
              isSelected={selectedClusterId === cluster.id}
              onPress={() => handleClusterPress(cluster.id)}
            />
          </MarkerComponent>
        ))}
      </MapViewComponent>

      {validEvents.length === 0 ? (
        <View pointerEvents="none" style={[styles.emptyState, { top: topInset + 20 }]}>
          <Text style={styles.emptyTitle}>还没有带定位的事件</Text>
        </View>
      ) : null}

      {selectedCluster ? (
        <EventCardList
          events={selectedCluster.events}
          onPressDetails={onEventPress}
          onClose={() => setSelectedClusterId(null)}
        />
      ) : null}
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
    backgroundColor: JourneyPalette.cardAlt,
  },
  fallbackIconWrap: {
    width: 84,
    height: 84,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.card,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
  },
  fallbackTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 16,
    marginBottom: 8,
    color: JourneyPalette.ink,
  },
  fallbackText: {
    fontSize: 14,
    color: JourneyPalette.inkSoft,
    textAlign: 'center',
    marginBottom: 4,
  },
  emptyState: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 16,
    backgroundColor: JourneyPalette.overlay,
    borderWidth: 1,
    borderColor: 'rgba(37, 93, 88, 0.08)',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
});
