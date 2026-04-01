import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, ActivityIndicator, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import { eventApi } from '@/services/api/eventApi';
import type { EventRecord } from '@/types/event';
import { MapViewContainer } from '@/components/map/MapViewContainer';

export default function MapScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadEvents = useCallback(
    async (mode: 'initial' | 'background' = 'background') => {
      const shouldBlock = mode === 'initial' && !hasLoadedOnce;

      if (shouldBlock) {
        setLoading(true);
      }

      try {
        const data = await eventApi.listAllEvents();
        setEvents(data);
        setError(null);
        setHasLoadedOnce(true);
      } catch (err) {
        console.error('Failed to load events for map:', err);
        if (!hasLoadedOnce) {
          setError('Failed to load events');
        }
      } finally {
        if (shouldBlock) {
          setLoading(false);
        }
      }
    },
    [hasLoadedOnce],
  );

  useEffect(() => {
    void loadEvents('initial');
  }, [loadEvents]);

  useFocusEffect(
    useCallback(() => {
      void loadEvents('background');
    }, [loadEvents]),
  );

  const handleEventPress = useCallback(
    (eventId: string) => {
      router.push(`/events/${eventId}`);
    },
    [router],
  );

  if (loading) {
    return (
      <View style={styles.centerContainer} testID="map-loading">
        <ActivityIndicator size="large" color="#2F6AF6" testID="loading-indicator" />
      </View>
    );
  }

  if (error && !hasLoadedOnce) {
    return (
      <View style={styles.centerContainer} testID="map-error">
        <Text style={styles.errorText}>{error}</Text>
        <Text style={styles.retryText} onPress={() => void loadEvents('initial')}>
          Tap to retry
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container} testID="map-screen">
      <MapViewContainer events={events} onEventPress={handleEventPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: '#E04646',
    marginBottom: 8,
  },
  retryText: {
    color: '#2F6AF6',
    textDecorationLine: 'underline',
  },
});
