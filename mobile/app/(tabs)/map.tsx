import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionButton, InlineBanner } from '@/components/ui/revamp';
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

  const scopeLabel = selectedScope
    ? `${selectedScope.locationLabel || '该地点'} ${selectedScope.eventCount}个事件`
    : '欢迎来到您的旅行日记';

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

      <View pointerEvents="box-none" style={[styles.topOverlay, { top: insets.top + 20 }]}>
        <View style={styles.topBar}>
          <View style={styles.scopePill}>
            <Text selectable numberOfLines={1} style={styles.scopePillText}>
              {scopeLabel}
            </Text>
          </View>
          <View style={styles.toolRow}>
            <Pressable style={styles.toolButton} onPress={() => router.push('/')}>
              <MaterialCommunityIcons
                name="image-filter-hdr"
                size={18}
                color={JourneyPalette.ink}
              />
            </Pressable>
            <Pressable
              style={styles.toolButton}
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
                size={18}
                color={JourneyPalette.ink}
              />
            </Pressable>
          </View>
        </View>

        {pendingLocationEvents.length > 0 ? (
          <InlineBanner
            icon="map-marker-alert-outline"
            title={
              pendingLocationEvents.length === 1
                ? '有 1 个事件待补地点'
                : `${pendingLocationEvents.length} 个事件待补地点`
            }
            body={
              pendingLocationEvents.length === 1
                ? `${pendingLocationEvents[0].title || '未命名事件'} 还没有地点`
                : '补充后就能正确出现在地图上'
            }
            action={
              <ActionButton
                label={pendingLocationEvents.length === 1 ? '去补充' : '查看'}
                tone="secondary"
                fullWidth={false}
                onPress={handlePendingLocationPress}
              />
            }
          />
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
    left: 14,
    right: 14,
    gap: 8,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  scopePill: {
    flex: 1,
    minHeight: 42,
    borderRadius: 999,
    paddingHorizontal: 16,
    backgroundColor: JourneyPalette.overlaySoft,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.72)',
    justifyContent: 'center',
  },
  scopePillText: {
    color: JourneyPalette.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  toolRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toolButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.card,
  },
});
