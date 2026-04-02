import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Button, Snackbar } from 'react-native-paper';

import { ImportProgressModal, type ImportProgress } from '@/components/import/ImportProgressModal';
import { UploadProgress } from '@/components/upload/UploadProgress';
import { MapViewContainer } from '@/components/map/MapViewContainer';
import { eventApi } from '@/services/api/eventApi';
import {
  AUTO_IMPORT_LIMIT,
  getImportCacheSummary,
  importRecentPhotos,
} from '@/services/album/photoImportService';
import { JourneyPalette } from '@/styles/colors';
import type { EventRecord } from '@/types/event';
import { openAppSettings } from '@/utils/permissionUtils';

export default function MapScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState<ImportProgress>({ stage: 'idle' });
  const [importVisible, setImportVisible] = useState(false);
  const [taskProgressVisible, setTaskProgressVisible] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [hasImportRun, setHasImportRun] = useState<boolean | null>(null);
  const autoImportTriggeredRef = useRef(false);

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
      } catch (loadError) {
        console.error('Failed to load events for map:', loadError);
        if (!hasLoadedOnce) {
          setError('加载足迹失败');
        }
      } finally {
        if (shouldBlock) {
          setLoading(false);
        }
      }
    },
    [hasLoadedOnce],
  );

  const loadImportSummary = useCallback(async () => {
    const summary = await getImportCacheSummary();
    setHasImportRun(Boolean(summary.lastRunAt));
    return summary;
  }, []);

  useEffect(() => {
    void Promise.all([loadEvents('initial'), loadImportSummary()]);
  }, [loadEvents, loadImportSummary]);

  useFocusEffect(
    useCallback(() => {
      void Promise.all([loadEvents('background'), loadImportSummary()]);
    }, [loadEvents, loadImportSummary]),
  );

  const runAutoImport = useCallback(async () => {
    setShowSettings(false);
    setImportVisible(true);
    setImportProgress({
      stage: 'scanning',
      detail: `正在准备导入最近 ${AUTO_IMPORT_LIMIT} 张照片...`,
    });

    try {
      const result = await importRecentPhotos({
        limit: AUTO_IMPORT_LIMIT,
        onProgress: (progress) => setImportProgress(progress),
      });

      if (result.selected === 0) {
        setSnackbar('最近没有可导入的照片');
        return;
      }

      if (result.dedupedNew === 0) {
        if (result.failed > 0) {
          setSnackbar(`最近 ${AUTO_IMPORT_LIMIT} 张里没有可处理的新照片`);
          return;
        }
        setSnackbar(
          result.dedupedExisting > 0
            ? `没有发现可新增的照片，已去重 ${result.dedupedExisting} 张`
            : '没有发现可新增的照片',
        );
        return;
      }

      if (result.taskId) {
        setTaskId(result.taskId);
        setTaskProgressVisible(true);
        setSnackbar(
          result.queuedVision > 0
            ? `已新增 ${result.dedupedNew} 张，正在聚合事件，${result.queuedVision} 张会在后台继续分析`
            : `已新增 ${result.dedupedNew} 张，正在聚合事件和生成故事...`,
        );
      } else {
        setSnackbar(
          result.queuedVision > 0
            ? `已新增 ${result.dedupedNew} 张，${result.queuedVision} 张会在后台继续分析，正在刷新足迹`
            : `已新增 ${result.dedupedNew} 张，正在刷新足迹`,
        );
        await loadEvents('background');
      }
    } catch (importError) {
      const message = String(importError);
      if (message.includes('permission_denied')) {
        setShowSettings(true);
        setSnackbar('需要相册权限才能自动整理旅行照片');
      } else {
        console.error('Auto import failed on map screen:', importError);
        setSnackbar('自动导入失败，请稍后重试');
      }
    } finally {
      setImportVisible(false);
      setImportProgress({ stage: 'idle' });
      try {
        await loadImportSummary();
      } catch (summaryError) {
        console.warn('Failed to refresh import summary:', summaryError);
      }
    }
  }, [loadEvents, loadImportSummary]);

  useEffect(() => {
    if (loading || hasImportRun === null) {
      return;
    }
    if (hasImportRun || autoImportTriggeredRef.current) {
      return;
    }

    autoImportTriggeredRef.current = true;
    void runAutoImport();
  }, [hasImportRun, loading, runAutoImport]);

  const handleEventPress = useCallback(
    (eventId: string) => {
      router.push(`/events/${eventId}`);
    },
    [router],
  );

  if (loading) {
    return (
      <View style={styles.centerContainer} testID="map-loading">
        <LinearGradient colors={['#F7F0E7', '#E7F0EB']} style={styles.loadingOrb}>
          <MaterialCommunityIcons
            name="map-search-outline"
            size={28}
            color={JourneyPalette.accent}
          />
        </LinearGradient>
        <ActivityIndicator size="large" color={JourneyPalette.accent} testID="loading-indicator" />
        <Text style={styles.loadingTitle}>正在整理足迹</Text>
      </View>
    );
  }

  if (error && !hasLoadedOnce) {
    return (
      <View style={styles.centerContainer} testID="map-error">
        <Text style={styles.errorText}>{error}</Text>
        <Pressable style={styles.retryPill} onPress={() => void loadEvents('initial')}>
          <Text style={styles.retryText}>重新加载</Text>
        </Pressable>
        {showSettings ? (
          <Button mode="text" onPress={openAppSettings} style={styles.settingsButton}>
            打开系统设置授权
          </Button>
        ) : null}
        <ImportProgressModal visible={importVisible} progress={importProgress} allowClose={false} />
      </View>
    );
  }

  return (
    <View style={styles.container} testID="map-screen">
      <MapViewContainer events={events} onEventPress={handleEventPress} />
      <View pointerEvents="box-none" style={styles.overlay}>
        <LinearGradient
          colors={['rgba(255,252,247,0.96)', 'rgba(255,249,241,0.88)']}
          style={styles.heroCard}
        >
          <View style={styles.heroTopRow}>
            <View style={styles.heroCopy}>
              <Text style={styles.eyebrow}>ATLAS VIEW</Text>
              <Text style={styles.heroTitle}>足迹</Text>
              <Text style={styles.heroSubtitle}>
                用地图回看旅行发生过的地方，点开聚类即可钻进具体事件。
              </Text>
            </View>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeValue}>{events.length}</Text>
              <Text style={styles.heroBadgeLabel}>事件</Text>
            </View>
          </View>

          <View style={styles.heroActions}>
            <Pressable
              style={({ pressed }) => [styles.primaryAction, pressed && styles.actionPressed]}
              onPress={() => void runAutoImport()}
            >
              <MaterialCommunityIcons name="image-multiple" size={16} color="#FFF9F2" />
              <Text style={styles.primaryActionText}>导入最近 {AUTO_IMPORT_LIMIT} 张</Text>
            </Pressable>
            <View style={styles.heroHintRow}>
              <MaterialCommunityIcons
                name="shield-lock-outline"
                size={14}
                color={JourneyPalette.inkSoft}
              />
              <Text style={styles.heroHintText}>默认不上图，只同步 metadata 与端侧结果。</Text>
            </View>
          </View>
        </LinearGradient>
      </View>
      <ImportProgressModal visible={importVisible} progress={importProgress} allowClose={false} />
      <UploadProgress
        visible={taskProgressVisible}
        taskId={taskId}
        onContinueInBackground={() => {
          setTaskProgressVisible(false);
        }}
        onDismissFailed={() => {
          setTaskProgressVisible(false);
          setTaskId(null);
        }}
        onComplete={() => {
          setTaskProgressVisible(false);
          setTaskId(null);
          setSnackbar('自动整理完成，足迹已更新');
          void loadEvents('background');
        }}
      />
      <Snackbar visible={Boolean(snackbar)} onDismiss={() => setSnackbar('')} duration={2800}>
        {snackbar}
      </Snackbar>
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
    width: 76,
    height: 76,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  loadingTitle: {
    marginTop: 14,
    fontSize: 21,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  errorText: {
    color: JourneyPalette.danger,
    marginBottom: 10,
    textAlign: 'center',
  },
  retryPill: {
    borderRadius: 999,
    backgroundColor: JourneyPalette.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: {
    color: '#FFF9F2',
    fontWeight: '800',
  },
  settingsButton: {
    marginTop: 8,
  },
  overlay: {
    position: 'absolute',
    top: 14,
    left: 14,
    right: 14,
  },
  heroCard: {
    borderRadius: 30,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: 'rgba(37, 93, 88, 0.08)',
    shadowColor: JourneyPalette.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 6,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  heroCopy: {
    flex: 1,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: JourneyPalette.muted,
  },
  heroTitle: {
    marginTop: 6,
    fontSize: 32,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  heroSubtitle: {
    marginTop: 8,
    color: JourneyPalette.inkSoft,
    lineHeight: 20,
  },
  heroBadge: {
    minWidth: 76,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  heroBadgeValue: {
    fontSize: 24,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  heroBadgeLabel: {
    marginTop: 4,
    fontSize: 11,
    color: JourneyPalette.muted,
  },
  heroActions: {
    marginTop: 16,
    gap: 10,
  },
  primaryAction: {
    alignSelf: 'flex-start',
    minHeight: 46,
    borderRadius: 999,
    backgroundColor: JourneyPalette.accent,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryActionText: {
    color: '#FFF9F2',
    fontWeight: '800',
  },
  actionPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
  heroHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroHintText: {
    color: JourneyPalette.inkSoft,
    fontSize: 12,
  },
});
