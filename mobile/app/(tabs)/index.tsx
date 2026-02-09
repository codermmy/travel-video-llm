import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, ActivityIndicator, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import { eventApi } from '@/services/api/eventApi';
import type { EventRecord } from '@/types/event';
import { MapViewContainer } from '@/components/map/MapViewContainer';
import { ImportProgressModal, type ImportProgress } from '@/components/import/ImportProgressModal';
import { autoImportRecentMonths } from '@/services/album/photoImportService';
import { taskApi } from '@/services/api/taskApi';

export default function MapScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importVisible, setImportVisible] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress>({ stage: 'idle' });
  const didAutoImportRef = useRef(false);

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

  useEffect(() => {
    if (didAutoImportRef.current) {
      return;
    }
    didAutoImportRef.current = true;

    const run = async () => {
      try {
        setImportVisible(true);
        setImportProgress({ stage: 'scanning', detail: '自动导入最近 6 个月照片...' });
        const result = await autoImportRecentMonths({
          months: 6,
          maxPhotos: 200,
          minIntervalMs: 6 * 60 * 60 * 1000,
          onProgress: (p) => setImportProgress(p),
        });

        if (result.taskId) {
          const startedAt = Date.now();
          while (Date.now() - startedAt < 120_000) {
            const status = await taskApi.getTaskStatus(result.taskId);
            setImportProgress({
              stage: 'clustering',
              current: Math.max(0, Math.min(100, status.progress ?? 0)),
              total: 100,
              detail:
                status.result ||
                (status.error ? `失败: ${status.error}` : `状态: ${status.status}`),
            });
            if (status.status === 'success' || status.status === 'failure') {
              break;
            }
            await new Promise((r) => setTimeout(r, 1200));
          }
          await loadEvents('background');
        } else if (result.dedupedNew > 0) {
          await loadEvents('background');
        }
      } catch (e) {
        console.warn('auto import skipped/failed:', e);
      } finally {
        setImportVisible(false);
        setImportProgress({ stage: 'idle' });
      }
    };

    void run();
  }, [loadEvents]);

  const handleEventPress = useCallback(
    (eventId: string) => {
      router.push(`/events/${eventId}`);
    },
    [router],
  );

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2F6AF6" />
      </View>
    );
  }

  if (error && !hasLoadedOnce) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error}</Text>
        <Text style={styles.retryText} onPress={() => void loadEvents('initial')}>
          Tap to retry
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapViewContainer events={events} onEventPress={handleEventPress} />
      <ImportProgressModal
        visible={importVisible && importProgress.stage !== 'idle'}
        progress={importProgress}
        allowClose={false}
      />
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
