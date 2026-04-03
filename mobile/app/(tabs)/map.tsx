import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { FilterChip } from '@/components/ui/revamp';
import { MapViewContainer } from '@/components/map/MapViewContainer';
import { eventApi } from '@/services/api/eventApi';
import { JourneyPalette } from '@/styles/colors';
import type { EventRecord } from '@/types/event';
import { getEventStatusMeta } from '@/utils/eventStatus';
import { hasValidGps } from '@/utils/mapClusterUtils';

type MapFilter = 'all' | 'ready' | 'stale';

function getMapFilterLabel(filter: MapFilter): string {
  if (filter === 'ready') {
    return '已完成';
  }
  if (filter === 'stale') {
    return '待更新';
  }
  return '全部';
}

export default function MapScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<MapFilter>('all');
  const [canResetView, setCanResetView] = useState(false);
  const [resetToken, setResetToken] = useState(0);

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
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
  const readyEventCount = useMemo(
    () =>
      events.filter((event) => hasValidGps(event) && getEventStatusMeta(event).tone === 'ready')
        .length,
    [events],
  );
  const staleEventCount = useMemo(
    () =>
      events.filter((event) => hasValidGps(event) && getEventStatusMeta(event).tone === 'stale')
        .length,
    [events],
  );
  const filteredEvents = useMemo(() => {
    if (activeFilter === 'ready') {
      return events.filter((event) => getEventStatusMeta(event).tone === 'ready');
    }
    if (activeFilter === 'stale') {
      return events.filter((event) => getEventStatusMeta(event).tone === 'stale');
    }
    return events;
  }, [activeFilter, events]);
  const filteredMappableEvents = useMemo(
    () => filteredEvents.filter(hasValidGps),
    [filteredEvents],
  );

  const scopeLabel = useMemo(() => {
    if (filteredEvents.length === 0) {
      return `${getMapFilterLabel(activeFilter)} · 0 个事件`;
    }
    if (filteredMappableEvents.length === 0) {
      return `${getMapFilterLabel(activeFilter)} · 暂无可映射地点`;
    }
    const firstLocation = filteredMappableEvents
      .find((event) => event.locationName?.trim())
      ?.locationName?.trim();
    if (firstLocation) {
      return `${firstLocation} · ${filteredMappableEvents.length} 个事件`;
    }
    return `空间回看 · ${filteredMappableEvents.length} 个事件`;
  }, [activeFilter, filteredEvents.length, filteredMappableEvents]);

  const emptyState = useMemo(() => {
    if (events.length === 0) {
      return {
        title: '还没有可映射到地图的事件',
        description: '先在回忆页导入照片，地图会在后台整理完成后自动出现。',
        actionLabel: '回到回忆',
        onPress: () => router.push('/'),
      };
    }
    if (filteredEvents.length === 0) {
      return {
        title: `当前没有“${getMapFilterLabel(activeFilter)}”事件`,
        description: '切回“全部”可以继续查看当前可映射的回忆。',
        actionLabel: '查看全部',
        onPress: () => setActiveFilter('all'),
      };
    }
    if (filteredMappableEvents.length === 0) {
      return {
        title: '当前筛选下暂无可映射地点',
        description: '这些回忆仍缺少地点信息，所以暂时不会出现在地图上。',
        actionLabel: activeFilter === 'all' ? '回到回忆' : '查看全部',
        onPress: () => {
          if (activeFilter === 'all') {
            router.push('/');
            return;
          }
          setActiveFilter('all');
        },
      };
    }
    return null;
  }, [activeFilter, events.length, filteredEvents.length, filteredMappableEvents.length, router]);

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
        <Text selectable style={styles.loadingHint}>
          地图是辅助探索入口，默认从最近回忆进入。
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
      />

      <View pointerEvents="box-none" style={styles.topOverlay}>
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

        <View style={styles.filterRow}>
          <FilterChip
            label="全部"
            count={allMappableEvents.length}
            active={activeFilter === 'all'}
            onPress={() => setActiveFilter('all')}
          />
          <FilterChip
            label="已完成"
            count={readyEventCount}
            active={activeFilter === 'ready'}
            onPress={() => setActiveFilter('ready')}
          />
          <FilterChip
            label="待更新"
            count={staleEventCount}
            active={activeFilter === 'stale'}
            onPress={() => setActiveFilter('stale')}
          />
        </View>
      </View>

      {emptyState ? (
        <View pointerEvents="box-none" style={styles.emptyOverlay}>
          <View style={styles.emptyCard}>
            <Text selectable style={styles.emptyTitle}>
              {emptyState.title}
            </Text>
            <Text selectable style={styles.emptyText}>
              {emptyState.description}
            </Text>
            <Pressable style={styles.backHomeButton} onPress={emptyState.onPress}>
              <Text selectable style={styles.backHomeText}>
                {emptyState.actionLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      ) : null}
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
  loadingHint: {
    marginTop: 8,
    color: JourneyPalette.inkSoft,
    textAlign: 'center',
    lineHeight: 20,
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
    top: 12,
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
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  emptyOverlay: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 22,
  },
  emptyCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.overlay,
    padding: 14,
    gap: 8,
  },
  emptyTitle: {
    color: JourneyPalette.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  emptyText: {
    color: JourneyPalette.inkSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  backHomeButton: {
    marginTop: 2,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.card,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  backHomeText: {
    color: JourneyPalette.accent,
    fontWeight: '800',
    fontSize: 13,
  },
});
