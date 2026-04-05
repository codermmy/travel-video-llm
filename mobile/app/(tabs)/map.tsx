import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MapViewContainer } from '@/components/map/MapViewContainer';
import { eventApi } from '@/services/api/eventApi';
import { JourneyPalette } from '@/styles/colors';
import type { EventRecord } from '@/types/event';
import { hasValidGps } from '@/utils/mapClusterUtils';
import { needsLocationSupplement } from '@/utils/locationDisplay';

type SelectedMapScope = {
  locationLabel: string | null;
  eventCount: number;
};

export default function MapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canResetView, setCanResetView] = useState(false);
  const [resetToken, setResetToken] = useState(0);
  const [selectedScope, setSelectedScope] = useState<SelectedMapScope | null>(null);

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setSelectedScope(null);
      const data = await eventApi.listAllEvents();
      setEvents(data);
    } catch (loadError) {
      console.error('Failed to load events for map:', loadError);
      setError('加载地图内容失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadEvents();
    }, [loadEvents]),
  );

  const allMappableEvents = useMemo(() => events.filter(hasValidGps), [events]);
  const pendingLocationEvents = useMemo(
    () => events.filter((event) => needsLocationSupplement(event)),
    [events],
  );
  const filteredMappableEvents = allMappableEvents;

  const scopeLabel = `${selectedScope?.locationLabel?.trim() || '全部区域'} · ${selectedScope?.eventCount ?? 0} 个回忆`;

  const handleSelectionScopeChange = useCallback((scope: SelectedMapScope | null) => {
    setSelectedScope((current) => {
      if (
        current?.locationLabel === scope?.locationLabel &&
        current?.eventCount === scope?.eventCount
      ) {
        return current;
      }
      return scope;
    });
  }, []);

  const handlePendingLocationPress = useCallback(() => {
    if (pendingLocationEvents.length === 1) {
      router.push(`/event-location/${pendingLocationEvents[0].id}`);
      return;
    }

    router.push('/map/missing-locations');
  }, [pendingLocationEvents, router]);

  const handleEventPress = useCallback(
    (eventId: string) => {
      router.push(`/events/${eventId}`);
    },
    [router],
  );

  if (loading) {
    return (
      <View style={styles.centerContainer} testID="map-loading">
        <View style={styles.loadingOrb}>
          <MaterialCommunityIcons
            name="map-search-outline"
            size={30}
            color={JourneyPalette.accent}
          />
        </View>
        <ActivityIndicator size="large" color={JourneyPalette.accent} testID="loading-indicator" />
        <Text selectable style={styles.loadingTitle}>
          正在加载地图
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centerContainer} testID="map-error">
        <Text selectable style={styles.errorText}>
          {error}
        </Text>
        <Pressable style={styles.retryPill} onPress={() => void loadEvents()}>
          <Text selectable style={styles.retryText}>
            重新加载
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="map-screen">
      <MapViewContainer
        events={filteredMappableEvents}
        onEventPress={handleEventPress}
        resetToken={resetToken}
        onCanResetChange={setCanResetView}
        onSelectionScopeChange={handleSelectionScopeChange}
        topInset={insets.top}
      />

      <View pointerEvents="box-none" style={styles.topOverlay}>
        <View style={styles.topBar}>
          <View style={styles.scopePill}>
            <Text selectable numberOfLines={1} style={styles.scopePillText}>
              {scopeLabel}
            </Text>
          </View>
          <View style={styles.toolRow}>
            <Pressable
              style={({ pressed }) => [styles.toolButton, pressed && styles.pressed]}
              onPress={() => router.push('/')}
            >
              <MaterialCommunityIcons
                name="image-filter-hdr"
                size={20}
                color={JourneyPalette.ink}
              />
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.toolButton, pressed && styles.pressed]}
              onPress={() => {
                if (canResetView) {
                  setResetToken((value) => value + 1);
                  return;
                }
                router.push('/profile/import-tasks');
              }}
            >
              <MaterialCommunityIcons
                name={canResetView ? 'crosshairs-gps' : 'dots-horizontal'}
                size={20}
                color={JourneyPalette.ink}
              />
            </Pressable>
          </View>
        </View>

        {pendingLocationEvents.length > 0 ? (
          <View style={styles.pendingBanner}>
            <MaterialCommunityIcons name="information-outline" size={16} color="#B45309" />
            <Text
              selectable
              adjustsFontSizeToFit
              minimumFontScale={0.85}
              numberOfLines={1}
              style={styles.pendingBannerText}
            >
              有 {pendingLocationEvents.length} 个事件需要补充地点
            </Text>
            <Pressable
              style={({ pressed }) => [styles.pendingBannerAction, pressed && styles.pressed]}
              onPress={handlePendingLocationPress}
            >
              <Text selectable style={styles.pendingBannerActionText}>
                去处理
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: JourneyPalette.cardAlt,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: JourneyPalette.cardAlt,
    padding: 24,
  },
  loadingOrb: {
    width: 84,
    height: 84,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    backgroundColor: JourneyPalette.accentSoft,
  },
  loadingTitle: {
    marginTop: 14,
    fontSize: 22,
    fontWeight: '900',
    color: JourneyPalette.ink,
  },
  errorText: {
    color: JourneyPalette.danger,
    marginBottom: 12,
    textAlign: 'center',
  },
  retryPill: {
    borderRadius: 999,
    backgroundColor: JourneyPalette.accent,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  retryText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  topOverlay: {
    position: 'absolute',
    top: 54,
    left: 16,
    right: 16,
    gap: 12,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  scopePill: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(255,255,255,0.95)',
    justifyContent: 'center',
    shadowColor: JourneyPalette.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 25,
    elevation: 4,
  },
  scopePillText: {
    color: JourneyPalette.ink,
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  toolRow: {
    flexDirection: 'row',
    gap: 10,
  },
  toolButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.white,
    shadowColor: JourneyPalette.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 25,
    elevation: 4,
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 16,
    backgroundColor: JourneyPalette.warningSoft,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  pendingBannerText: {
    flex: 1,
    color: '#92400E',
    fontSize: 12,
    fontWeight: '700',
  },
  pendingBannerAction: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pendingBannerActionText: {
    color: '#B45309',
    fontSize: 11,
    fontWeight: '900',
  },
  pressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.7,
  },
});
