import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Snackbar } from 'react-native-paper';

import { ImportProgressModal, type ImportProgress } from '@/components/import/ImportProgressModal';
import { MapViewContainer } from '@/components/map/MapViewContainer';
import { UploadProgress } from '@/components/upload/UploadProgress';
import { eventApi } from '@/services/api/eventApi';
import { photoApi } from '@/services/api/photoApi';
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
  const [totalPhotos, setTotalPhotos] = useState<number | null>(null);
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
          setError('加载地图内容失败');
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

  const loadPhotoStats = useCallback(async () => {
    const stats = await photoApi.getPhotoStats();
    setTotalPhotos(stats.total);
    return stats;
  }, []);

  useEffect(() => {
    void Promise.all([loadEvents('initial'), loadImportSummary(), loadPhotoStats()]);
  }, [loadEvents, loadImportSummary, loadPhotoStats]);

  useFocusEffect(
    useCallback(() => {
      void Promise.all([loadEvents('background'), loadImportSummary(), loadPhotoStats()]);
    }, [loadEvents, loadImportSummary, loadPhotoStats]),
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
            ? `已新增 ${result.dedupedNew} 张，${result.queuedVision} 张会在后台继续分析`
            : `已新增 ${result.dedupedNew} 张，地图内容正在刷新`,
        );
        await Promise.all([loadEvents('background'), loadPhotoStats()]);
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
        await Promise.all([loadImportSummary(), loadPhotoStats()]);
      } catch (summaryError) {
        console.warn('Failed to refresh import summary:', summaryError);
      }
    }
  }, [loadEvents, loadImportSummary, loadPhotoStats]);

  useEffect(() => {
    if (loading || hasImportRun === null || totalPhotos === null) {
      return;
    }
    if (hasImportRun || totalPhotos > 0 || events.length > 0 || autoImportTriggeredRef.current) {
      return;
    }

    autoImportTriggeredRef.current = true;
    void runAutoImport();
  }, [events.length, hasImportRun, loading, runAutoImport, totalPhotos]);

  const handleEventPress = useCallback(
    (eventId: string) => {
      router.push(`/events/${eventId}`);
    },
    [router],
  );

  const readyEventCount = useMemo(
    () => events.filter((event) => event.status === 'generated').length,
    [events],
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
        <Text style={styles.loadingTitle}>正在加载地图</Text>
        <Text style={styles.loadingHint}>地图只负责空间回看，主入口在回忆首页。</Text>
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
          <Pressable style={styles.settingsLink} onPress={openAppSettings}>
            <Text style={styles.settingsLinkText}>打开系统设置授权</Text>
          </Pressable>
        ) : null}
        <ImportProgressModal visible={importVisible} progress={importProgress} allowClose={false} />
      </View>
    );
  }

  return (
    <View style={styles.container} testID="map-screen">
      <MapViewContainer events={events} onEventPress={handleEventPress} />

      <View pointerEvents="box-none" style={styles.topOverlay}>
        <View style={styles.topHeaderCard}>
          <View style={styles.topHeaderCopy}>
            <Text style={styles.topHeaderTitle}>地图</Text>
            <Text style={styles.topHeaderSubtitle}>从地点重新浏览回忆</Text>
          </View>
          <View style={styles.topHeaderStats}>
            <View style={styles.metaChip}>
              <MaterialCommunityIcons
                name="map-marker-radius-outline"
                size={14}
                color={JourneyPalette.accent}
              />
              <Text style={styles.metaChipText}>{events.length} 个事件</Text>
            </View>
            <View style={styles.metaChip}>
              <MaterialCommunityIcons
                name="image-outline"
                size={14}
                color={JourneyPalette.accent}
              />
              <Text style={styles.metaChipText}>{readyEventCount} 个可回看</Text>
            </View>
          </View>
        </View>

        {events.length === 0 ? (
          <View style={styles.emptyBanner}>
            <Text style={styles.emptyBannerTitle}>还没有可映射到地图的事件</Text>
            <Text style={styles.emptyBannerText}>
              先去回忆页导入照片，地图会在后台整理完成后自动出现内容。
            </Text>
            <Pressable style={styles.emptyBannerButton} onPress={() => router.push('/')}>
              <Text style={styles.emptyBannerButtonText}>回到回忆首页</Text>
            </Pressable>
          </View>
        ) : null}
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
          setSnackbar('自动整理完成，地图已更新');
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
    fontWeight: '800',
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
  settingsLink: {
    marginTop: 10,
  },
  settingsLinkText: {
    color: JourneyPalette.accent,
    fontWeight: '700',
  },
  topOverlay: {
    position: 'absolute',
    top: 12,
    left: 14,
    right: 14,
    gap: 10,
  },
  topHeaderCard: {
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: JourneyPalette.overlay,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.66)',
    shadowColor: JourneyPalette.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
    gap: 10,
  },
  topHeaderCopy: {
    gap: 4,
  },
  topHeaderTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  topHeaderSubtitle: {
    color: JourneyPalette.inkSoft,
    fontSize: 13,
    lineHeight: 18,
  },
  topHeaderStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaChip: {
    minHeight: 34,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: JourneyPalette.card,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaChipText: {
    color: JourneyPalette.ink,
    fontSize: 12,
    fontWeight: '700',
  },
  emptyBanner: {
    borderRadius: 22,
    padding: 16,
    backgroundColor: JourneyPalette.overlay,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    gap: 10,
  },
  emptyBannerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  emptyBannerText: {
    color: JourneyPalette.inkSoft,
    lineHeight: 20,
  },
  emptyBannerButton: {
    alignSelf: 'flex-start',
    minHeight: 40,
    borderRadius: 999,
    backgroundColor: JourneyPalette.card,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  emptyBannerButtonText: {
    color: JourneyPalette.accent,
    fontWeight: '800',
  },
});
