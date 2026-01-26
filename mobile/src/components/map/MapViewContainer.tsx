import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Text, Platform } from 'react-native';
import { MapView, AMapSdk } from 'react-native-amap3d';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import type { EventRecord } from '@/types/event';
import { EventMarker } from './EventMarker';
import { EventBubble } from './EventBubble';

const DEFAULT_AMAP_ANDROID_KEY = '__AMAP_ANDROID_KEY__';
const DEFAULT_AMAP_IOS_KEY = '__AMAP_IOS_KEY__';

interface MapViewContainerProps {
  events: EventRecord[];
  onEventPress: (eventId: string) => void;
}

export const MapViewContainer: React.FC<MapViewContainerProps> = ({ events, onEventPress }) => {
  const mapRef = useRef<MapView>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [isMapReady, setIsMapReady] = useState(false);

  const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  const amapAndroidKey =
    (Constants.expoConfig?.extra as { amap?: { androidKey?: string } } | undefined)?.amap
      ?.androidKey ?? DEFAULT_AMAP_ANDROID_KEY;
  const amapIosKey =
    (Constants.expoConfig?.extra as { amap?: { iosKey?: string } } | undefined)?.amap?.iosKey ??
    DEFAULT_AMAP_IOS_KEY;

  useEffect(() => {
    if (!isExpoGo) {
      try {
        AMapSdk.init({
          android: Platform.OS === 'android' ? amapAndroidKey : undefined,
          ios: Platform.OS === 'ios' ? amapIosKey : undefined,
        });
      } catch (error) {
        console.warn('Failed to initialize AMap SDK:', error);
      }
    }
  }, [amapAndroidKey, amapIosKey, isExpoGo]);

  // Filter events with valid coordinates
  const validEvents = events.filter(
    (e) => typeof e.gpsLat === 'number' && typeof e.gpsLon === 'number',
  );
  const selectedEvent = validEvents.find(e => e.id === selectedEventId);

  useEffect(() => {
    if (isMapReady && validEvents.length > 0 && mapRef.current) {
      // Calculate bounding box
      let minLat = 90;
      let maxLat = -90;
      let minLon = 180;
      let maxLon = -180;
      validEvents.forEach((e) => {
        const lat = e.gpsLat ?? 0;
        const lon = e.gpsLon ?? 0;
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
  }, [isMapReady, validEvents.length]); // Don't depend on validEvents content to avoid loops, just length

  if (isExpoGo) {
    return (
      <View style={styles.fallbackContainer}>
        <Ionicons name="map-outline" size={64} color="#ccc" />
        <Text style={styles.fallbackTitle}>Map Unavailable in Expo Go</Text>
        <Text style={styles.fallbackText}>
          AMap (Gaode Map) requires native modules which are not available in Expo Go.
        </Text>
        <Text style={styles.fallbackText}>
          Please use a Development Build to view the map.
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

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
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
           />
         ))}
      </MapView>

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
