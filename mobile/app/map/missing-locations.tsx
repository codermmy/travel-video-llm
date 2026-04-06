import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionButton, EmptyStateCard, HeaderIconButton, PageHeader } from '@/components/ui/revamp';
import { eventApi } from '@/services/api/eventApi';
import { JourneyPalette } from '@/styles/colors';
import type { EventRecord } from '@/types/event';
import { getReadableLocationText, needsLocationSupplement } from '@/utils/locationDisplay';

function getPendingEventTitle(event: EventRecord): string {
  const title = event.title.trim();
  return title || '未命名回忆';
}

function getPendingEventSubtitle(event: EventRecord): string {
  return getReadableLocationText(event) || '等待补全地点';
}

export default function MissingLocationsScreen() {
  const insets = useSafeAreaInsets();
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

  if (error) {
    return (
      <View style={styles.centerState}>
        <EmptyStateCard
          icon="map-marker-alert-outline"
          title="加载失败"
          description={error}
          action={<ActionButton label="重试" onPress={() => void loadEvents()} fullWidth={false} />}
        />
      </View>
    );
  }

  if (pendingEvents.length === 0) {
    return (
      <View style={styles.centerState}>
        <EmptyStateCard
          icon="map-marker-check-outline"
          title="地点已补齐"
          description="当前没有待补地点的事件。"
          action={<ActionButton label="返回地图" onPress={() => router.back()} fullWidth={false} />}
        />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <PageHeader
        title="补全地点"
        topInset
        style={styles.header}
        rightSlot={
          <HeaderIconButton
            icon="arrow-left"
            accessibilityLabel="返回"
            onPress={() => router.back()}
          />
        }
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.listContent, { paddingBottom: 24 + insets.bottom }]}
      >
        {pendingEvents.map((event, index) => (
          <View key={event.id}>
            <Pressable
              onPress={() => router.push(`/event-location/${event.id}`)}
              style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            >
              <View style={styles.rowIconBox}>
                <MaterialCommunityIcons
                  name="map-marker-outline"
                  size={20}
                  color={JourneyPalette.accent}
                />
              </View>

              <View style={styles.rowCopy}>
                <Text numberOfLines={1} style={styles.rowTitle}>
                  {getPendingEventTitle(event)}
                </Text>
                <Text numberOfLines={2} style={styles.rowSubtitle}>
                  {getPendingEventSubtitle(event)}
                </Text>
              </View>

              <MaterialCommunityIcons name="chevron-right" size={18} color={JourneyPalette.muted} />
            </Pressable>

            {index < pendingEvents.length - 1 ? <View style={styles.divider} /> : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: JourneyPalette.background,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.background,
    padding: 24,
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  listContent: {
    paddingHorizontal: 24,
  },
  row: {
    paddingVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  rowIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: JourneyPalette.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: JourneyPalette.ink,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  rowSubtitle: {
    color: JourneyPalette.muted,
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
});
