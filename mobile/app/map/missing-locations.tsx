import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import {
  ActionButton,
  EmptyStateCard,
  ListItemRow,
  PageContent,
  PageHeader,
  SurfaceCard,
} from '@/components/ui/revamp';
import { eventApi } from '@/services/api/eventApi';
import { JourneyPalette } from '@/styles/colors';
import type { EventRecord } from '@/types/event';
import { needsLocationSupplement } from '@/utils/locationDisplay';

function formatDateMeta(event: EventRecord): string {
  const value = event.endTime || event.startTime;
  if (!value) {
    return `${event.photoCount} 张照片`;
  }

  const date = new Date(value);
  return `${date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} · ${event.photoCount} 张照片`;
}

export default function MissingLocationsScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const nextEvents = await eventApi.listAllEvents();
      setEvents(nextEvents);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadEvents();
    }, [loadEvents]),
  );

  const pendingEvents = useMemo(
    () => events.filter((event) => needsLocationSupplement(event)),
    [events],
  );

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color={JourneyPalette.accent} />
      </View>
    );
  }

  return (
    <PageContent>
      <PageHeader
        title="待补地点"
        rightSlot={
          <ActionButton
            label="返回"
            tone="secondary"
            icon="arrow-left"
            fullWidth={false}
            onPress={() => router.back()}
          />
        }
      />

      {error ? (
        <EmptyStateCard
          icon="map-marker-alert-outline"
          title="加载失败"
          description={error}
          action={<ActionButton label="重试" onPress={() => void loadEvents()} fullWidth={false} />}
        />
      ) : pendingEvents.length === 0 ? (
        <EmptyStateCard
          icon="map-marker-check-outline"
          title="地点已补齐"
          description="当前没有待补地点的事件。"
          action={<ActionButton label="返回地图" onPress={() => router.back()} fullWidth={false} />}
        />
      ) : (
        <SurfaceCard style={styles.listCard}>
          {pendingEvents.map((event, index) => (
            <View key={event.id}>
              <ListItemRow
                icon="map-marker-alert-outline"
                title={event.title || '未命名事件'}
                subtitle={formatDateMeta(event)}
                onPress={() => router.push(`/event-location/${event.id}`)}
              />
              {index < pendingEvents.length - 1 ? <View style={styles.divider} /> : null}
            </View>
          ))}
        </SurfaceCard>
      )}
    </PageContent>
  );
}

const styles = StyleSheet.create({
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.cardAlt,
  },
  listCard: {
    paddingVertical: 6,
    paddingHorizontal: 0,
  },
  divider: {
    marginLeft: 68,
    height: 1,
    backgroundColor: JourneyPalette.line,
  },
});
