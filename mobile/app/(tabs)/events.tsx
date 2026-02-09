import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ActivityIndicator, Button, Snackbar, Text } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';

import { ImportProgressModal, type ImportProgress } from '@/components/import/ImportProgressModal';
import { UploadProgress } from '@/components/upload/UploadProgress';
import { openAppSettings } from '@/utils/permissionUtils';
import { manualImportFromPicker } from '@/services/album/photoImportService';
import { eventApi } from '@/services/api/eventApi';
import type { EventRecord } from '@/types/event';

const PAGE_SIZE = 50;

function formatRange(event: EventRecord): string {
  const start = event.startTime ? new Date(event.startTime) : null;
  const end = event.endTime ? new Date(event.endTime) : null;
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

  if (start && end) {
    return `${fmt(start)} - ${fmt(end)}`;
  }
  if (start) {
    return fmt(start);
  }
  return '时间未知';
}

function buildSubtitle(event: EventRecord): string {
  const location = event.locationName || '地点待补充';
  return `${location} · ${event.photoCount} 张照片`;
}

export default function EventsScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [importVisible, setImportVisible] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress>({ stage: 'idle' });
  const [snackbar, setSnackbar] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);
  const [taskProgressVisible, setTaskProgressVisible] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);

  const dismissSnackbar = useCallback(() => setSnackbar(''), []);

  const canShowModal = useMemo(
    () => importVisible && importProgress.stage !== 'idle',
    [importProgress.stage, importVisible],
  );

  const loadPage = useCallback(async (nextPage: number, mode: 'replace' | 'append') => {
    try {
      if (mode === 'replace') {
        setError(null);
      }
      const result = await eventApi.listEvents({ page: nextPage, pageSize: PAGE_SIZE });
      setTotalPages(result.totalPages);
      setPage(result.page);

      if (mode === 'append') {
        setEvents((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          const merged = [...prev];
          for (const item of result.items) {
            if (!seen.has(item.id)) {
              merged.push(item);
              seen.add(item.id);
            }
          }
          return merged;
        });
      } else {
        setEvents(result.items);
      }
    } catch (e) {
      console.warn('Failed to load events:', e);
      if (mode === 'append') {
        setSnackbar('加载更多失败');
      } else {
        setError('加载事件失败');
      }
    }
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      await loadPage(1, 'replace');
    } finally {
      setLoading(false);
    }
  }, [loadPage]);

  useFocusEffect(
    useCallback(() => {
      void loadInitial();
    }, [loadInitial]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadPage(1, 'replace');
    } finally {
      setRefreshing(false);
    }
  }, [loadPage]);

  const loadMore = useCallback(async () => {
    if (loading || refreshing || loadingMore || page >= totalPages) {
      return;
    }

    setLoadingMore(true);
    try {
      await loadPage(page + 1, 'append');
    } finally {
      setLoadingMore(false);
    }
  }, [loading, refreshing, loadingMore, page, totalPages, loadPage]);

  const handleManualImport = useCallback(async () => {
    setShowSettings(false);
    setImportVisible(true);
    setImportProgress({ stage: 'scanning', detail: '正在选择照片并准备导入...' });

    try {
      const result = await manualImportFromPicker({
        selectionLimit: 200,
        onProgress: (p) => setImportProgress(p),
      });

      if (result.selected === 0) {
        setSnackbar('你取消了本次导入');
        return;
      }

      if (result.dedupedNew === 0) {
        if (result.failed > 0) {
          setSnackbar('导入失败：所选照片无法处理');
          return;
        }
        setSnackbar('没有发现可新增的照片');
        return;
      }

      if (result.taskId) {
        setTaskId(result.taskId);
        setTaskProgressVisible(true);
        setSnackbar(`上传完成：新增 ${result.dedupedNew} 张，正在生成事件...`);
      } else {
        setSnackbar(`导入完成：新增 ${result.dedupedNew} 张，上传 ${result.uploaded} 张`);
        await refresh();
      }
    } catch (e) {
      const msg = String(e);
      if (msg.includes('permission_denied')) {
        setSnackbar('没有相册权限，请到系统设置中开启');
        setShowSettings(true);
      } else {
        setSnackbar('导入失败，请稍后重试');
        console.warn('manual import failed:', e);
      }
    } finally {
      setImportVisible(false);
      setImportProgress({ stage: 'idle' });
    }
  }, [refresh]);

  const goToEventDetail = useCallback(
    (id: string) => {
      router.push(`/events/${id}`);
    },
    [router],
  );

  const renderEventCard = useCallback(
    ({ item }: { item: EventRecord }) => (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.88}
        onPress={() => goToEventDetail(item.id)}
      >
        <View style={styles.coverWrap}>
          {item.coverPhotoUrl ? (
            <Image source={{ uri: item.coverPhotoUrl }} style={styles.cover} />
          ) : (
            <LinearGradient colors={['#DDE7FF', '#E9F8F2']} style={styles.coverPlaceholder}>
              <MaterialCommunityIcons name="image-filter-hdr" size={26} color="#4562B3" />
            </LinearGradient>
          )}
        </View>

        <View style={styles.cardBody}>
          <View style={styles.cardTopRow}>
            <Text numberOfLines={1} style={styles.cardTitle}>
              {item.title?.trim() ? item.title : '未命名事件'}
            </Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{item.photoCount} 张</Text>
            </View>
          </View>

          <Text numberOfLines={1} style={styles.cardDate}>
            {formatRange(item)}
          </Text>
          <Text numberOfLines={1} style={styles.cardSubtitle}>
            {buildSubtitle(item)}
          </Text>
        </View>

        <MaterialCommunityIcons name="chevron-right" size={20} color="#9AA4BC" />
      </TouchableOpacity>
    ),
    [goToEventDetail],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#2F6AF6" />
        <Text style={styles.loadingText}>正在整理你的旅行事件...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <MaterialCommunityIcons name="alert-circle-outline" size={36} color="#E04646" />
        <Text style={styles.errorText}>{error}</Text>
        <Button mode="contained" onPress={refresh} style={styles.retryButton}>
          重新加载
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#1E3D8F', '#2867D8', '#37A2FF']} style={styles.hero}>
        <View>
          <Text style={styles.heroTitle}>旅行事件</Text>
          <Text style={styles.heroSubtitle}>按时间线梳理每一段回忆</Text>
        </View>

        <Pressable
          style={({ pressed }) => [styles.importBtn, pressed && styles.importBtnPressed]}
          onPress={handleManualImport}
        >
          <MaterialCommunityIcons name="image-plus" size={18} color="#1F4AA8" />
          <Text style={styles.importBtnText}>手动导入</Text>
        </Pressable>
      </LinearGradient>

      {events.length === 0 ? (
        <View style={styles.emptyState}>
          <LinearGradient colors={['#EEF4FF', '#F4FBF8']} style={styles.emptyIconWrap}>
            <MaterialCommunityIcons name="image-off-outline" size={44} color="#6C82BE" />
          </LinearGradient>
          <Text style={styles.emptyTitle}>还没有旅行事件</Text>
          <Text style={styles.emptyDescription}>
            首次进入会自动尝试导入最近 6 个月照片，你也可以手动分批导入更早的照片。
          </Text>

          <Button mode="contained" onPress={handleManualImport} style={styles.emptyActionBtn}>
            立即导入
          </Button>

          {showSettings ? (
            <Button mode="text" onPress={openAppSettings} style={styles.settingsButton}>
              打开系统设置授权
            </Button>
          ) : null}
        </View>
      ) : (
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={events}
          keyExtractor={(item) => item.id}
          renderItem={renderEventCard}
          refreshing={refreshing}
          onRefresh={refresh}
          onEndReached={loadMore}
          onEndReachedThreshold={0.55}
          removeClippedSubviews={Platform.OS === 'android'}
          initialNumToRender={8}
          maxToRenderPerBatch={10}
          windowSize={7}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator size="small" color="#2F6AF6" />
              </View>
            ) : null
          }
        />
      )}

      <ImportProgressModal visible={canShowModal} progress={importProgress} allowClose={false} />
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
          setSnackbar('事件生成完成，已更新列表');
          void refresh();
        }}
      />
      <Snackbar visible={Boolean(snackbar)} onDismiss={dismissSnackbar} duration={2500}>
        {snackbar}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F6FC',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#F3F6FC',
  },
  loadingText: {
    marginTop: 10,
    color: '#4F5E82',
  },
  errorText: {
    color: '#BC2D2D',
    marginVertical: 12,
  },
  retryButton: {
    borderRadius: 999,
    backgroundColor: '#2F6AF6',
  },
  hero: {
    marginHorizontal: 14,
    marginTop: 12,
    marginBottom: 10,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#17316B',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  heroSubtitle: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 13,
  },
  importBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  importBtnPressed: {
    transform: [{ scale: 0.98 }],
  },
  importBtnText: {
    color: '#1F4AA8',
    fontWeight: '700',
    fontSize: 13,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  emptyIconWrap: {
    width: 92,
    height: 92,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    marginTop: 18,
    fontSize: 20,
    fontWeight: '800',
    color: '#243054',
  },
  emptyDescription: {
    marginTop: 10,
    color: '#5E6887',
    textAlign: 'center',
    lineHeight: 22,
  },
  emptyActionBtn: {
    marginTop: 20,
    borderRadius: 999,
    backgroundColor: '#2F6AF6',
  },
  settingsButton: {
    marginTop: 8,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E8EEFA',
  },
  coverWrap: {
    width: 72,
    height: 72,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#DFE6F5',
  },
  cover: {
    width: '100%',
    height: '100%',
  },
  coverPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    marginHorizontal: 12,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    color: '#1D2846',
  },
  badge: {
    marginLeft: 8,
    backgroundColor: '#EDF2FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    color: '#365CC3',
    fontSize: 11,
    fontWeight: '700',
  },
  cardDate: {
    marginTop: 6,
    color: '#334466',
    fontWeight: '600',
    fontSize: 12,
  },
  cardSubtitle: {
    marginTop: 4,
    color: '#6A7592',
    fontSize: 12,
  },
  footer: {
    paddingVertical: 14,
    alignItems: 'center',
  },
});
