import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';

import { BackButton } from '@/components/map/BackButton';
import { ClusterMarker } from '@/components/map/ClusterMarker';
import { EventCardList } from '@/components/map/EventCardList';
import type { EventRecord } from '@/types/event';
import type { MapViewStack } from '@/types/mapStack';
import {
  clusterEvents,
  getAdaptiveClusterThreshold,
  getLevelName,
  hasValidGps,
  initializeStack,
  popStack,
  returnToInitialState,
  zoomIntoCluster,
} from '@/utils/mapClusterUtils';
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
  const [isMapReady, setIsMapReady] = useState(false);

  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
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
      return;
    }
    setStack(initializeStack(validEvents));
    setSelectedClusterId(null);
    setSelectedEventId(null);
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

  const handleClusterPress = (clusterId: string) => {
    setSelectedClusterId(clusterId);
    setSelectedEventId(null);
  };

  const handleClusterDoubleClick = (clusterId: string) => {
    if (!stack) {
      return;
    }

    const cluster = clusters.find((item) => item.id === clusterId);
    if (!cluster) {
      return;
    }

    if (cluster.count <= 1) {
      const event = cluster.events[0];
      if (event) {
        onEventPress(event.id);
      }
      return;
    }

    setStack((prev) => (prev ? zoomIntoCluster(cluster, prev) : prev));
    setSelectedClusterId(null);
    setSelectedEventId(null);
  };

  const handleMapPress = () => {
    if (selectedClusterId) {
      setSelectedClusterId(null);
      setSelectedEventId(null);
      return;
    }

    if (stack && stack.currentIndex > 0) {
      setStack((prev) => (prev ? popStack(prev) : prev));
    }
  };

  const handleBackToInitial = () => {
    if (!stack) {
      return;
    }
    setStack(returnToInitialState(stack));
    setSelectedClusterId(null);
    setSelectedEventId(null);
  };

  const showBackButton = Boolean(stack && stack.currentIndex > 0);
  const backButtonLevelName = stack ? getLevelName(stack.initialState) : '初始视图';

  if (isWeb) {
    return (
      <View style={styles.fallbackContainer}>
        <Ionicons name="map-outline" size={64} color="#ccc" />
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
        <Ionicons name="map-outline" size={64} color="#ccc" />
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
          <Text style={styles.fallbackText}>请确认你运行的是 Development Build（不是 Expo Go）。</Text>
          {amapError ? <Text style={styles.fallbackText}>错误: {amapError}</Text> : null}
        </View>
      );
    }

    return (
      <View style={styles.fallbackContainer}>
        <Ionicons name="map-outline" size={64} color="#ccc" />
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
        initialCameraPosition={stack?.initialState || { target: { latitude: 39.9042, longitude: 116.4074 }, zoom: 5 }}
      >
        {clusters.map((cluster) => (
          <MarkerComponent
            key={cluster.id}
            position={cluster.center}
            onPress={() => handleClusterPress(cluster.id)}
            zIndex={selectedClusterId === cluster.id ? 100 : 1}
          >
            <ClusterMarker
              coverUrl={cluster.events[0]?.coverPhotoUrl || null}
              clusterCount={cluster.count}
              isSelected={selectedClusterId === cluster.id}
              onPress={() => handleClusterPress(cluster.id)}
              onDoublePress={() => handleClusterDoubleClick(cluster.id)}
            />
          </MarkerComponent>
        ))}
      </MapViewComponent>

      {validEvents.length === 0 ? (
        <View pointerEvents="none" style={styles.emptyState}>
          <Text style={styles.emptyTitle}>还没有带定位的事件</Text>
          <Text style={styles.emptyText}>上传包含 GPS 信息的照片后，这里会显示足迹标记。</Text>
        </View>
      ) : null}

      {showBackButton ? (
        <BackButton levelName={backButtonLevelName} onPress={handleBackToInitial} />
      ) : null}

      {selectedCluster ? (
        <EventCardList
          events={selectedCluster.events}
          selectedEventId={selectedEventId}
          onPressEvent={(eventId) => {
            setSelectedEventId(eventId);
          }}
          onPressDetails={(eventId) => {
            setSelectedEventId(eventId);
            onEventPress(eventId);
          }}
          onClose={() => {
            setSelectedClusterId(null);
            setSelectedEventId(null);
          }}
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
