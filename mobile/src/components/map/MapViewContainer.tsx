import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';

import { ClusterMarker } from '@/components/map/ClusterMarker';
import { EventCardList } from '@/components/map/EventCardList';
import { JourneyPalette } from '@/styles/colors';
import type { EventRecord } from '@/types/event';
import type { MapViewStack } from '@/types/mapStack';
import {
  clusterEvents,
  getAdaptiveClusterThreshold,
  hasValidGps,
  initializeStack,
  popStack,
  returnToInitialState,
} from '@/utils/mapClusterUtils';
import { getCompactLocationText } from '@/utils/locationDisplay';
import { getEventStatusMeta } from '@/utils/eventStatus';
import { getPreferredEventCoverUri } from '@/utils/mediaRefs';
import type { JourneyStateKind } from '@/utils/statusLanguage';
import type { AMapModule, MapViewProps, MapViewRef, MarkerProps } from './amapTypes';

declare function require(moduleName: string): unknown;

const DEFAULT_AMAP_ANDROID_KEY = '__AMAP_ANDROID_KEY__';
const DEFAULT_AMAP_IOS_KEY = '__AMAP_IOS_KEY__';

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

function getClusterTone(events: EventRecord[]): JourneyStateKind {
  const tones = events.map((event) => getEventStatusMeta(event).tone);
  if (tones.includes('failed')) {
    return 'failed';
  }
  if (tones.includes('stale')) {
    return 'stale';
  }
  if (tones.includes('importing') || tones.includes('processing')) {
    return 'processing';
  }
  return 'ready';
}

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
  const [stack, setStack] = useState<MapViewStack | null>(null);

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

  useEffect(() => {
    if (!isMapReady || validEvents.length === 0) {
      if (validEvents.length === 0) {
        setSelectedClusterId(null);
      }
      return;
    }
    setStack(initializeStack(validEvents));
    setSelectedClusterId(null);
  }, [isMapReady, validEvents]);

  useEffect(() => {
    if (!stack || !mapRef.current) {
      return;
    }

    const currentState = stack.states[stack.currentIndex];
    mapRef.current.moveCamera(currentState, 500);
  }, [stack]);

  const clusters = useMemo(() => {
    if (!stack || validEvents.length === 0) {
      return [];
    }
    const currentState = stack.states[stack.currentIndex];
    const thresholdKm = getAdaptiveClusterThreshold(currentState.zoom);
    return clusterEvents(validEvents, thresholdKm);
  }, [stack, validEvents]);

  const selectedCluster = useMemo(() => {
    if (!selectedClusterId) {
      return null;
    }
    return clusters.find((cluster) => cluster.id === selectedClusterId) || null;
  }, [clusters, selectedClusterId]);

  const canResetView = useMemo(() => {
    if (!stack || validEvents.length === 0) {
      return false;
    }
    return stack.currentIndex > 0;
  }, [stack, validEvents.length]);

  useEffect(() => {
    onCanResetChange?.(canResetView);
  }, [canResetView, onCanResetChange]);

  useEffect(() => {
    if (!stack || resetToken <= 0 || !canResetView) {
      return;
    }
    setStack(returnToInitialState(stack));
    setSelectedClusterId(null);
  }, [canResetView, resetToken, stack]);

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
      return;
    }

    if (stack && stack.currentIndex > 0) {
      setStack((prev) => (prev ? popStack(prev) : prev));
    }
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
        initialCameraPosition={
          stack?.initialState || { target: { latitude: 39.9042, longitude: 116.4074 }, zoom: 5 }
        }
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
              tone={getClusterTone(cluster.events)}
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
