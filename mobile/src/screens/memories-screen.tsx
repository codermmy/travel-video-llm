import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Snackbar } from 'react-native-paper';

import { EventEditSheet } from '@/components/event/EventEditSheet';
import { EventPhotoManagerSheet } from '@/components/event/EventPhotoManagerSheet';
import { ImportProgressModal, type ImportProgress } from '@/components/import/ImportProgressModal';
import { PhotoLibraryPickerModal } from '@/components/photo/PhotoLibraryPickerModal';
import {
  ActionButton,
  BottomSheetScaffold,
  FilterChip,
  InlineBanner,
  StatusPill,
  SurfaceCard,
} from '@/components/ui/revamp';
import { UploadProgress } from '@/components/upload/UploadProgress';
import { MonthHeader } from '@/components/timeline/MonthHeader';
import { TimelineEventCard } from '@/components/timeline/TimelineEventCard';
import { eventApi } from '@/services/api/eventApi';
import {
  AUTO_IMPORT_LIMIT,
  getImportCacheSummary,
  importSelectedLibraryAssets,
  importRecentPhotos,
  type ImportCacheSummary,
  type ImportResult,
} from '@/services/album/photoImportService';
import {
  getImportTaskState,
  loadImportTasks,
  subscribeImportTasks,
} from '@/services/import/importTaskService';
import { usePhotoViewerStore } from '@/stores/photoViewerStore';
import { useSlideshowStore } from '@/stores/slideshowStore';
import { JourneyPalette } from '@/styles/colors';
import type { EventRecord } from '@/types/event';
import type { ImportTaskRecord, ImportTaskState } from '@/types/importTask';
import { groupEventsByMonth, type MonthSection } from '@/utils/eventGrouping';
import { getEventStatusMeta } from '@/utils/eventStatus';
import { getPreferredEventCoverUri } from '@/utils/mediaRefs';
import { openAppSettings } from '@/utils/permissionUtils';

type MemoryFilter = 'all' | 'processing' | 'stale' | 'failed';

function buildImportSummaryText(
  result: ImportResult,
  mode: 'recent' | 'manual',
  queued: boolean,
): string {
  const sourceLabel = mode === 'recent' ? `最近 ${AUTO_IMPORT_LIMIT} 张` : '手动补导入';
  const parts = [`${sourceLabel}已读取 ${result.selected} 张`, `新增 ${result.dedupedNew} 张`];

  if (result.dedupedExisting > 0) {
    parts.push(`去重 ${result.dedupedExisting} 张`);
  }
  if (result.failed > 0) {
    parts.push(`失败 ${result.failed} 张`);
  }
  if (result.queuedVision > 0) {
    parts.push(`后台分析 ${result.queuedVision} 张`);
  }

  return queued ? `${parts.join('，')}，正在聚合事件和生成故事...` : parts.join('，');
}

function buildMemoryTeaser(event?: EventRecord | null): string {
  const text = (event?.storyText || event?.fullStory || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    return '打开这段回忆，继续浏览照片、片段和完整故事。';
  }
  const firstSentence = text.split(/[。！？!?]/)[0]?.trim() || text;
  return firstSentence.length > 48 ? `${firstSentence.slice(0, 48).trim()}…` : firstSentence;
}

function buildRunningTaskCopy(task: ImportTaskRecord | null): string {
  if (!task) {
    return '';
  }

  const phase = task.phases[task.activePhase];
  if (phase?.detail?.trim()) {
    return phase.detail.trim();
  }

  if (typeof phase?.current === 'number' && typeof phase.total === 'number' && phase.total > 0) {
    return `${phase.label} ${phase.current}/${phase.total}`;
  }

  return `${task.title} 正在后台继续`;
}

export default function MemoriesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    filter?: string | string[];
    importMode?: string | string[];
    intentKey?: string | string[];
  }>();
  const setPhotoViewerSession = usePhotoViewerStore((state) => state.setSession);
  const setSlideshowSession = useSlideshowStore((state) => state.setSession);
  const handledIntentKeyRef = useRef<string | null>(null);

  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importVisible, setImportVisible] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress>({ stage: 'idle' });
  const [importSummary, setImportSummary] = useState<ImportCacheSummary | null>(null);
  const [snackbar, setSnackbar] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [taskProgressVisible, setTaskProgressVisible] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [actionEvent, setActionEvent] = useState<EventRecord | null>(null);
  const [editingEvent, setEditingEvent] = useState<EventRecord | null>(null);
  const [photoManagerEventId, setPhotoManagerEventId] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerSubmitting, setPickerSubmitting] = useState(false);
  const [activeFilter, setActiveFilter] = useState<MemoryFilter>('all');
  const [taskState, setTaskState] = useState<ImportTaskState>(getImportTaskState());

  const canShowModal = useMemo(
    () => importVisible && importProgress.stage !== 'idle',
    [importProgress.stage, importVisible],
  );

  const loadImportSummary = useCallback(async () => {
    const summary = await getImportCacheSummary();
    setImportSummary(summary);
    return summary;
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      setError(null);
      const result = await eventApi.listAllEvents();
      setEvents(result);
    } catch (loadError) {
      console.warn('Failed to load events:', loadError);
      setError('加载事件失败');
    }
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadEvents(), loadImportSummary()]);
    } finally {
      setLoading(false);
    }
  }, [loadEvents, loadImportSummary]);

  useFocusEffect(
    useCallback(() => {
      void loadInitial();
    }, [loadInitial]),
  );

  useEffect(() => {
    const unsubscribe = subscribeImportTasks((state) => {
      setTaskState(state);
    });
    void loadImportTasks();
    return unsubscribe;
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadEvents(), loadImportSummary()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadEvents, loadImportSummary]);

  const readyEventCount = useMemo(
    () => events.filter((event) => getEventStatusMeta(event).tone === 'ready').length,
    [events],
  );
  const staleEventCount = useMemo(
    () => events.filter((event) => getEventStatusMeta(event).tone === 'stale').length,
    [events],
  );
  const failedEventCount = useMemo(
    () => events.filter((event) => getEventStatusMeta(event).tone === 'failed').length,
    [events],
  );
  const activeEventCount = useMemo(
    () =>
      events.filter((event) => {
        const tone = getEventStatusMeta(event).tone;
        return tone === 'importing' || tone === 'processing';
      }).length,
    [events],
  );
  const runningTask = useMemo(
    () => taskState.tasks.find((task) => task.status === 'running') ?? null,
    [taskState.tasks],
  );
  const runningTaskCopy = useMemo(() => buildRunningTaskCopy(runningTask), [runningTask]);
  const runningTaskSummary = useMemo(() => {
    if (taskState.runningCount > 1) {
      return `${taskState.runningCount} 个后台任务正在运行，涉及 ${activeEventCount} 个回忆。`;
    }
    if (taskState.runningCount === 1) {
      return (
        runningTaskCopy || `1 个后台任务正在运行，涉及 ${Math.max(activeEventCount, 1)} 个回忆。`
      );
    }
    return '';
  }, [activeEventCount, runningTaskCopy, taskState.runningCount]);
  const filteredEvents = useMemo(() => {
    if (activeFilter === 'processing') {
      return events.filter((event) => {
        const tone = getEventStatusMeta(event).tone;
        return tone === 'importing' || tone === 'processing';
      });
    }
    if (activeFilter === 'stale') {
      return events.filter((event) => getEventStatusMeta(event).tone === 'stale');
    }
    if (activeFilter === 'failed') {
      return events.filter((event) => getEventStatusMeta(event).tone === 'failed');
    }
    return events;
  }, [activeFilter, events]);
  const activeFilterMeta = useMemo(() => {
    if (activeFilter === 'processing') {
      return {
        heroKicker: '整理中的回忆',
        sectionLabel: '整理中的回忆',
        emptyTitle: '当前没有正在整理的回忆',
        emptyDescription: '切回“全部”继续浏览，或稍后再回来查看最新整理结果。',
      };
    }
    if (activeFilter === 'stale') {
      return {
        heroKicker: '待更新的回忆',
        sectionLabel: '待更新的回忆',
        emptyTitle: '当前没有待更新的回忆',
        emptyDescription: '切回“全部”继续浏览，或等系统完成后台刷新后再回来查看。',
      };
    }
    if (activeFilter === 'failed') {
      return {
        heroKicker: '需重试的回忆',
        sectionLabel: '需重试的回忆',
        emptyTitle: '当前没有需重试的回忆',
        emptyDescription: '切回“全部”继续浏览，或等待新的整理结果后再回来查看。',
      };
    }
    return {
      heroKicker: '最近旅程',
      sectionLabel: '回忆流',
      emptyTitle: '当前筛选下没有内容',
      emptyDescription: '可以切回“全部”，或者等系统继续整理后再回来查看。',
    };
  }, [activeFilter]);
  const statusSegments = useMemo(
    () =>
      [
        {
          key: 'ready',
          label: '已就绪',
          count: readyEventCount,
          color: JourneyPalette.success,
        },
        {
          key: 'processing',
          label: '整理中',
          count: activeEventCount,
          color: JourneyPalette.accent,
        },
        {
          key: 'stale',
          label: '待更新',
          count: staleEventCount,
          color: JourneyPalette.warning,
        },
        {
          key: 'failed',
          label: '需重试',
          count: failedEventCount,
          color: JourneyPalette.danger,
        },
      ].filter((segment) => segment.count > 0),
    [activeEventCount, failedEventCount, readyEventCount, staleEventCount],
  );
  const heroEvent = (activeFilter === 'all' ? events : filteredEvents)[0] ?? null;
  const heroCoverUri = getPreferredEventCoverUri(heroEvent);
  const heroEventTone = useMemo(
    () => (heroEvent ? getEventStatusMeta(heroEvent).tone : null),
    [heroEvent],
  );
  const monthSections = useMemo(() => groupEventsByMonth(filteredEvents), [filteredEvents]);

  const executeLibraryImport = useCallback(
    async (assets: import('expo-media-library').Asset[]) => {
      setShowSettings(false);
      setImportVisible(true);
      setImportProgress({
        stage: 'scanning',
        detail: '正在准备手动补导入...',
      });

      try {
        const result = await importSelectedLibraryAssets({
          assets,
          onProgress: (progress) => setImportProgress(progress),
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
          setSnackbar(buildImportSummaryText(result, 'manual', true));
        } else {
          setSnackbar(buildImportSummaryText(result, 'manual', false));
          await refresh();
        }
      } catch (importError) {
        const message = String(importError);
        setSnackbar(
          message.includes('permission_denied')
            ? '没有相册权限，请到系统设置中开启'
            : '导入失败，请稍后重试',
        );
        if (message.includes('permission_denied')) {
          setShowSettings(true);
        } else {
          console.warn('manual import failed:', importError);
        }
      } finally {
        setImportVisible(false);
        setImportProgress({ stage: 'idle' });
        setPickerSubmitting(false);
        setPickerVisible(false);
        try {
          await loadImportSummary();
        } catch (summaryError) {
          console.warn('Failed to refresh import summary:', summaryError);
        }
      }
    },
    [loadImportSummary, refresh],
  );

  const runImport = useCallback(
    async (mode: 'recent') => {
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
          setSnackbar(buildImportSummaryText(result, mode, true));
        } else {
          setSnackbar(buildImportSummaryText(result, mode, false));
          await refresh();
        }
      } catch (importError) {
        const message = String(importError);
        if (message.includes('permission_denied')) {
          setSnackbar('没有相册权限，请到系统设置中开启');
          setShowSettings(true);
        } else {
          setSnackbar('导入失败，请稍后重试');
          console.warn(`${mode} import failed:`, importError);
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
    },
    [loadImportSummary, refresh],
  );

  const handleRecentImport = useCallback(() => {
    void runImport('recent');
  }, [runImport]);

  const handleManualImport = useCallback(() => {
    setPickerVisible(true);
  }, []);

  useEffect(() => {
    const requestedIntentKey = Array.isArray(params.intentKey)
      ? params.intentKey[0]
      : params.intentKey;
    const requestedFilter = Array.isArray(params.filter) ? params.filter[0] : params.filter;
    const requestedImportMode = Array.isArray(params.importMode)
      ? params.importMode[0]
      : params.importMode;

    if (
      !requestedIntentKey ||
      handledIntentKeyRef.current === requestedIntentKey ||
      loading ||
      error
    ) {
      return;
    }

    if (
      requestedFilter === 'all' ||
      requestedFilter === 'processing' ||
      requestedFilter === 'stale' ||
      requestedFilter === 'failed'
    ) {
      setActiveFilter(requestedFilter);
    }

    if (requestedImportMode === 'manual') {
      setPickerVisible(true);
    }

    handledIntentKeyRef.current = requestedIntentKey;
  }, [error, loading, params.filter, params.importMode, params.intentKey]);

  const goToEventDetail = useCallback(
    (id: string) => {
      router.push(`/events/${id}`);
    },
    [router],
  );

  const openHeroStory = useCallback(async () => {
    if (!heroEvent) {
      return;
    }

    try {
      const detail = await eventApi.getEventDetail(heroEvent.id);
      if (detail.photos.length === 0) {
        setSnackbar('这段回忆还没有可播放的照片');
        return;
      }
      setPhotoViewerSession(detail.photos, 0);
      setSlideshowSession(
        {
          id: detail.id,
          title: detail.title,
          emotionTag: detail.emotionTag ?? null,
          musicUrl: detail.musicUrl ?? null,
          storyText: detail.storyText ?? null,
          fullStory: detail.fullStory ?? null,
          storyFreshness: detail.storyFreshness,
          slideshowFreshness: detail.slideshowFreshness,
          hasPendingStructureChanges: detail.hasPendingStructureChanges,
          chapters: detail.chapters,
          photoGroups: detail.photoGroups,
        },
        detail.photos,
      );
      router.push('/slideshow');
    } catch (playError) {
      console.warn('Failed to open slideshow from home:', playError);
      setSnackbar('暂时无法直接播放，请先进入详情页');
    }
  }, [heroEvent, router, setPhotoViewerSession, setSlideshowSession]);

  const openHeroPhotos = useCallback(async () => {
    if (!heroEvent) {
      return;
    }

    try {
      const detail = await eventApi.getEventDetail(heroEvent.id);
      if (detail.photos.length === 0) {
        setSnackbar('这段回忆还没有可查看的照片');
        return;
      }
      setPhotoViewerSession(detail.photos, 0);
      router.push('/photo-viewer');
    } catch (viewError) {
      console.warn('Failed to open photo viewer from home:', viewError);
      setSnackbar('暂时无法直接查看照片，请先进入详情页');
    }
  }, [heroEvent, router, setPhotoViewerSession]);

  const renderMonthHeader = useCallback(
    ({ section }: { section: MonthSection }) => <MonthHeader section={section} />,
    [],
  );

  const renderTimelineCard = useCallback(
    ({ item, index, section }: { item: EventRecord; index: number; section: MonthSection }) => (
      <TimelineEventCard
        event={item}
        isLastInSection={index === section.data.length - 1}
        onPress={goToEventDetail}
        onLongPress={setActionEvent}
      />
    ),
    [goToEventDetail],
  );

  const topStatus = useMemo(() => {
    if (failedEventCount > 0) {
      return {
        label: `需处理 ${failedEventCount}`,
        tone: 'failed' as const,
        icon: 'alert-circle-outline' as const,
      };
    }
    if (activeEventCount > 0) {
      return {
        label: `整理中 ${activeEventCount}`,
        tone: 'analyzing' as const,
        icon: 'progress-clock' as const,
      };
    }
    if (staleEventCount > 0) {
      return {
        label: `待更新 ${staleEventCount}`,
        tone: 'stale' as const,
        icon: 'update' as const,
      };
    }
    return {
      label: '已就绪',
      tone: 'ready' as const,
      icon: 'check-circle-outline' as const,
    };
  }, [activeEventCount, failedEventCount, staleEventCount]);

  const heroSection = (
    <View style={styles.headerBlock}>
      <View style={styles.topRow}>
        <View style={styles.titleStack}>
          <Text selectable style={styles.pageTitle}>
            回忆
          </Text>
        </View>
        <StatusPill label={topStatus.label} tone={topStatus.tone} icon={topStatus.icon} />
      </View>

      {(failedEventCount > 0 || activeEventCount > 0 || staleEventCount > 0) &&
      events.length > 0 ? (
        <InlineBanner
          icon={
            failedEventCount > 0
              ? 'alert-circle-outline'
              : activeEventCount > 0
                ? 'timeline-clock-outline'
                : 'update'
          }
          title={
            failedEventCount > 0
              ? '有回忆需要处理'
              : activeEventCount > 0
                ? '后台仍在继续整理'
                : '有回忆待自动更新'
          }
          body={
            failedEventCount > 0
              ? `${failedEventCount} 个回忆整理失败或分析异常，建议先筛到“需重试”查看。`
              : activeEventCount > 0
                ? runningTaskCopy ||
                  `${activeEventCount} 个回忆仍在后台继续整理，可在任务中心回看最近任务和历史结果。`
                : `${staleEventCount} 个回忆会在后台自动补齐最新故事和结构。`
          }
          action={
            <ActionButton
              label={failedEventCount > 0 ? '查看失败' : '查看'}
              tone="secondary"
              fullWidth={false}
              onPress={() => {
                if (failedEventCount > 0) {
                  setActiveFilter('failed');
                  return;
                }
                router.push('/profile/import-tasks');
              }}
            />
          }
        />
      ) : null}

      {heroEvent ? (
        <Pressable
          style={({ pressed }) => [styles.heroCard, pressed && styles.pressed]}
          onPress={() => goToEventDetail(heroEvent.id)}
        >
          {heroCoverUri ? (
            <Image source={{ uri: heroCoverUri }} style={styles.heroImage} resizeMode="cover" />
          ) : (
            <LinearGradient colors={['#D7E2FF', '#EEF4FF']} style={styles.heroImageFallback}>
              <MaterialCommunityIcons
                name="image-filter-hdr"
                size={34}
                color={JourneyPalette.accent}
              />
            </LinearGradient>
          )}
          <LinearGradient
            colors={['rgba(15,23,42,0.08)', 'rgba(15,23,42,0.62)']}
            style={styles.heroShade}
          />
          <View style={styles.heroCopy}>
            <Text selectable style={styles.heroKicker}>
              {activeFilterMeta.heroKicker}
            </Text>
            <Text selectable style={styles.heroTitle}>
              {heroEvent.title || '未命名事件'}
            </Text>
            <Text selectable numberOfLines={2} style={styles.heroSummary}>
              {buildMemoryTeaser(heroEvent)}
            </Text>
            <View style={styles.heroActions}>
              <ActionButton
                label={heroEventTone === 'ready' ? '继续回看' : '查看详情'}
                tone="secondary"
                fullWidth={false}
                onPress={() => goToEventDetail(heroEvent.id)}
                style={styles.heroPrimaryAction}
              />
              <ActionButton
                label={heroEventTone === 'ready' ? '播放回忆' : '查看照片'}
                fullWidth={false}
                onPress={heroEventTone === 'ready' ? openHeroStory : openHeroPhotos}
                style={styles.heroSecondaryAction}
              />
            </View>
          </View>
        </Pressable>
      ) : null}

      {events.length > 0 ? (
        <>
          <Text selectable style={styles.sectionLabel}>
            后台整理
          </Text>
          <SurfaceCard style={styles.progressCard}>
            <View style={styles.progressHead}>
              <View>
                <Text selectable style={styles.progressTitle}>
                  整理状态中心
                </Text>
              </View>
              <Pressable onPress={() => router.push('/profile/import-tasks')}>
                <Text selectable style={styles.progressAction}>
                  查看全部
                </Text>
              </Pressable>
            </View>

            <View style={styles.progressRail}>
              {statusSegments.map((segment) => (
                <View
                  key={segment.key}
                  style={[
                    styles.progressSegment,
                    {
                      flex: Math.max(segment.count, 1),
                      backgroundColor: segment.color,
                    },
                  ]}
                />
              ))}
            </View>
            <View style={styles.progressLegend}>
              {statusSegments.map((segment) => (
                <View key={segment.key} style={styles.progressLegendItem}>
                  <View style={[styles.progressLegendDot, { backgroundColor: segment.color }]} />
                  <Text style={styles.progressLegendText}>
                    {segment.label} {segment.count}
                  </Text>
                </View>
              ))}
            </View>
            <Text selectable style={styles.progressBody}>
              {failedEventCount > 0
                ? `${failedEventCount} 个回忆需要处理。可先筛到“需重试”，再进入详情执行重试或先查看照片。`
                : taskState.runningCount > 0
                  ? runningTaskSummary
                  : activeEventCount > 0
                    ? `当前有 ${activeEventCount} 个回忆仍在后台继续整理，可在任务中心回看最近任务和历史结果。`
                    : staleEventCount > 0
                      ? `${staleEventCount} 个回忆内容待更新，系统会继续后台刷新。`
                      : '当前首页内容已经就绪，可以直接继续回看或播放。'}
            </Text>
          </SurfaceCard>
          <View style={styles.importActionRow}>
            <ActionButton
              label="整理最近 200 张"
              tone="secondary"
              fullWidth={false}
              onPress={handleRecentImport}
              style={styles.importActionButton}
            />
            <ActionButton
              label="手动补导入"
              tone="secondary"
              fullWidth={false}
              onPress={handleManualImport}
              style={styles.importActionButton}
            />
          </View>
        </>
      ) : null}

      {events.length > 0 ? (
        <>
          <View style={styles.filterRow}>
            {(
              [
                { key: 'all', label: '全部', count: events.length },
                { key: 'processing', label: '整理中', count: activeEventCount },
                { key: 'stale', label: '待更新', count: staleEventCount },
                { key: 'failed', label: '需重试', count: failedEventCount },
              ] as const
            ).map((item) => {
              const active = activeFilter === item.key;
              return (
                <FilterChip
                  key={item.key}
                  label={item.label}
                  count={item.count}
                  active={active}
                  onPress={() => setActiveFilter(item.key)}
                />
              );
            })}
          </View>
          <Text selectable style={styles.sectionLabel}>
            {activeFilterMeta.sectionLabel}
          </Text>
        </>
      ) : null}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <View style={styles.loadingOrb}>
          <MaterialCommunityIcons name="image-filter-hdr" size={30} color={JourneyPalette.accent} />
        </View>
        <ActivityIndicator size="large" color={JourneyPalette.accent} />
        <Text selectable style={styles.loadingTitle}>
          正在加载回忆首页
        </Text>
        <Text selectable style={styles.loadingText}>
          最近回忆、整理状态和回忆流会按当前版本自动刷新。
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <View style={[styles.loadingOrb, styles.errorOrb]}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={30}
            color={JourneyPalette.danger}
          />
        </View>
        <Text selectable style={styles.errorText}>
          {error}
        </Text>
        <ActionButton label="重新加载" onPress={() => void refresh()} fullWidth={false} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {events.length === 0 ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.welcomeContent}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.welcomeHero}>
            <LinearGradient colors={['#EEF4FF', '#F9FBFF']} style={styles.welcomeHeroTop}>
              <StatusPill label="欢迎态" tone="ready" icon="check-circle-outline" />
              <Text selectable style={styles.welcomeTitle}>
                自动整理旅行回忆
              </Text>
              <Text selectable style={styles.welcomeBody}>
                第一次进入只保留一个主入口。导入最近照片后，系统会按时间和地点自动聚合成可回看的回忆。
              </Text>
            </LinearGradient>

            <SurfaceCard>
              <View style={styles.promiseRow}>
                <View style={styles.promiseIcon}>
                  <MaterialCommunityIcons
                    name="shield-lock-outline"
                    size={18}
                    color={JourneyPalette.accent}
                  />
                </View>
                <View style={styles.promiseCopy}>
                  <Text selectable style={styles.promiseTitle}>
                    默认不上图
                  </Text>
                  <Text selectable style={styles.promiseBody}>
                    只同步 metadata 与端侧结构化结果，原图不作为默认上传内容。
                  </Text>
                </View>
              </View>
              <View style={styles.promiseDivider} />
              <View style={styles.promiseRow}>
                <View style={styles.promiseIcon}>
                  <MaterialCommunityIcons
                    name="image-filter-hdr"
                    size={18}
                    color={JourneyPalette.accent}
                  />
                </View>
                <View style={styles.promiseCopy}>
                  <Text selectable style={styles.promiseTitle}>
                    自动聚合事件
                  </Text>
                  <Text selectable style={styles.promiseBody}>
                    相册不需要先手动分类，系统会按时间、地点和内容自动整理成回忆。
                  </Text>
                </View>
              </View>
              <View style={styles.promiseDivider} />
              <View style={styles.promiseRow}>
                <View style={styles.promiseIcon}>
                  <MaterialCommunityIcons
                    name="play-circle-outline"
                    size={18}
                    color={JourneyPalette.accent}
                  />
                </View>
                <View style={styles.promiseCopy}>
                  <Text selectable style={styles.promiseTitle}>
                    本机回看与播放
                  </Text>
                  <Text selectable style={styles.promiseBody}>
                    事件详情、照片浏览和幻灯片都围绕本地媒体展开，不再先把你带去地图或设置页。
                  </Text>
                </View>
              </View>
            </SurfaceCard>

            <View style={styles.welcomeActions}>
              <ActionButton label="整理最近 200 张" onPress={handleRecentImport} />
              <ActionButton label="手动补导入" tone="secondary" onPress={handleManualImport} />
            </View>

            {showSettings ? (
              <InlineBanner
                icon="cog-outline"
                title="需要相册权限"
                body="首次整理前需要系统相册授权，开启后即可回到这里继续主入口。"
                tone="warm"
                action={
                  <ActionButton
                    label="打开设置"
                    tone="secondary"
                    fullWidth={false}
                    onPress={openAppSettings}
                  />
                }
              />
            ) : null}

            {importSummary?.lastRunAt ? (
              <Text selectable style={styles.welcomeHint}>
                如果你之前已经导入过照片，整理记录会继续保留在本机任务中心。
              </Text>
            ) : null}
          </View>
        </ScrollView>
      ) : filteredEvents.length === 0 ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.filteredContent}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
        >
          {heroSection}
          <SurfaceCard style={styles.filteredEmptyCard}>
            <MaterialCommunityIcons name="tune-variant" size={24} color={JourneyPalette.muted} />
            <Text selectable style={styles.filteredEmptyTitle}>
              {activeFilterMeta.emptyTitle}
            </Text>
            <Text selectable style={styles.filteredEmptyText}>
              {activeFilterMeta.emptyDescription}
            </Text>
          </SurfaceCard>
        </ScrollView>
      ) : (
        <SectionList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          sections={monthSections}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={heroSection}
          renderSectionHeader={renderMonthHeader}
          renderItem={renderTimelineCard}
          refreshing={refreshing}
          onRefresh={() => void refresh()}
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          initialNumToRender={8}
          maxToRenderPerBatch={10}
          windowSize={7}
          contentInsetAdjustmentBehavior="automatic"
        />
      )}

      <ImportProgressModal visible={canShowModal} progress={importProgress} allowClose={false} />
      <PhotoLibraryPickerModal
        visible={pickerVisible}
        title="手动补导入"
        hint="从系统相册挑选照片，长按开始滑动多选；这只是补充导入能力。"
        confirmLabel="开始导入"
        confirmLoading={pickerSubmitting}
        onClose={() => {
          if (pickerSubmitting) {
            return;
          }
          setPickerVisible(false);
        }}
        onConfirm={async (assets) => {
          setPickerSubmitting(true);
          await executeLibraryImport(assets);
        }}
      />
      <EventEditSheet
        visible={Boolean(editingEvent)}
        event={editingEvent}
        onClose={() => setEditingEvent(null)}
        onSaved={() => {
          setEditingEvent(null);
          setActionEvent(null);
          setSnackbar('事件信息已更新');
          void refresh();
        }}
        onDeleted={() => {
          setEditingEvent(null);
          setActionEvent(null);
          setSnackbar('事件已删除');
          void refresh();
        }}
      />
      <EventPhotoManagerSheet
        visible={Boolean(photoManagerEventId)}
        eventId={photoManagerEventId}
        onClose={() => setPhotoManagerEventId(null)}
        onChanged={({ deletedCurrentEvent }) => {
          setPhotoManagerEventId(null);
          setActionEvent(null);
          setSnackbar(deletedCurrentEvent ? '事件照片已清空，事件已自动删除' : '事件照片已更新');
          void refresh();
        }}
      />
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
      <Snackbar visible={Boolean(snackbar)} onDismiss={() => setSnackbar('')} duration={2500}>
        {snackbar}
      </Snackbar>

      <Modal
        visible={Boolean(actionEvent)}
        animationType="slide"
        transparent
        onRequestClose={() => setActionEvent(null)}
      >
        <View style={styles.sheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setActionEvent(null)} />
          <BottomSheetScaffold
            title="长按事件后的快捷操作"
            hint="高频动作直接在回忆流里完成，不必先进入详情页。"
            onClose={() => setActionEvent(null)}
            footer={
              <ActionButton label="取消" tone="secondary" onPress={() => setActionEvent(null)} />
            }
          >
            <View style={styles.quickSheetActions}>
              <Pressable
                style={({ pressed }) => [styles.quickActionRow, pressed && styles.pressed]}
                onPress={() => {
                  if (!actionEvent) {
                    return;
                  }
                  goToEventDetail(actionEvent.id);
                  setActionEvent(null);
                }}
              >
                <View style={styles.quickActionIcon}>
                  <MaterialCommunityIcons
                    name="book-open-page-variant-outline"
                    size={18}
                    color={JourneyPalette.accent}
                  />
                </View>
                <View style={styles.quickActionCopy}>
                  <Text selectable style={styles.quickActionTitle}>
                    继续回看
                  </Text>
                  <Text selectable style={styles.quickActionBody}>
                    进入详情，继续浏览章节、相册和完整故事。
                  </Text>
                </View>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.quickActionRow, pressed && styles.pressed]}
                onPress={() => {
                  setEditingEvent(actionEvent);
                  setActionEvent(null);
                }}
              >
                <View style={styles.quickActionIcon}>
                  <MaterialCommunityIcons
                    name="pencil-outline"
                    size={18}
                    color={JourneyPalette.accent}
                  />
                </View>
                <View style={styles.quickActionCopy}>
                  <Text selectable style={styles.quickActionTitle}>
                    编辑事件
                  </Text>
                  <Text selectable style={styles.quickActionBody}>
                    修改标题和地点，新的内容会自动进入待更新状态。
                  </Text>
                </View>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.quickActionRow, pressed && styles.pressed]}
                onPress={() => {
                  setPhotoManagerEventId(actionEvent?.id ?? null);
                  setActionEvent(null);
                }}
              >
                <View style={styles.quickActionIcon}>
                  <MaterialCommunityIcons
                    name="image-multiple-outline"
                    size={18}
                    color={JourneyPalette.accent}
                  />
                </View>
                <View style={styles.quickActionCopy}>
                  <Text selectable style={styles.quickActionTitle}>
                    管理照片
                  </Text>
                  <Text selectable style={styles.quickActionBody}>
                    继续加图、批量移动、移出当前事件或删除照片。
                  </Text>
                </View>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.quickActionRow,
                  styles.quickActionRowDanger,
                  pressed && styles.pressed,
                ]}
                onPress={() => {
                  if (!actionEvent) {
                    return;
                  }
                  Alert.alert(
                    '删除事件',
                    '删除后，本事件照片会回到“无事件”状态，现有故事也会移除。',
                    [
                      { text: '取消', style: 'cancel' },
                      {
                        text: '删除',
                        style: 'destructive',
                        onPress: () => {
                          void (async () => {
                            try {
                              await eventApi.deleteEvent(actionEvent.id);
                              setActionEvent(null);
                              setSnackbar('事件已删除');
                              await refresh();
                            } catch (deleteError) {
                              setSnackbar(
                                deleteError instanceof Error
                                  ? deleteError.message
                                  : '删除失败，请稍后再试',
                              );
                            }
                          })();
                        },
                      },
                    ],
                  );
                }}
              >
                <View style={[styles.quickActionIcon, styles.quickActionIconDanger]}>
                  <MaterialCommunityIcons
                    name="trash-can-outline"
                    size={18}
                    color={JourneyPalette.danger}
                  />
                </View>
                <View style={styles.quickActionCopy}>
                  <Text selectable style={[styles.quickActionTitle, styles.quickActionTitleDanger]}>
                    删除事件
                  </Text>
                  <Text selectable style={styles.quickActionBody}>
                    危险动作单独强调，避免误触。
                  </Text>
                </View>
              </Pressable>
            </View>
          </BottomSheetScaffold>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: JourneyPalette.cardAlt,
  },
  scroll: {
    flex: 1,
    backgroundColor: JourneyPalette.cardAlt,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: JourneyPalette.cardAlt,
  },
  loadingOrb: {
    width: 84,
    height: 84,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    backgroundColor: JourneyPalette.accentSoft,
  },
  errorOrb: {
    backgroundColor: JourneyPalette.dangerSoft,
  },
  loadingTitle: {
    marginTop: 14,
    fontSize: 22,
    fontWeight: '900',
    color: JourneyPalette.ink,
  },
  loadingText: {
    marginTop: 8,
    color: JourneyPalette.inkSoft,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorText: {
    marginVertical: 12,
    color: JourneyPalette.danger,
    textAlign: 'center',
  },
  headerBlock: {
    gap: 16,
    paddingHorizontal: 14,
    paddingTop: 18,
    paddingBottom: 10,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleStack: {
    flex: 1,
    gap: 5,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: JourneyPalette.ink,
  },
  pageSubtitle: {
    color: JourneyPalette.inkSoft,
    fontSize: 13,
    lineHeight: 20,
  },
  heroCard: {
    height: 268,
    borderRadius: 30,
    overflow: 'hidden',
    backgroundColor: JourneyPalette.card,
    boxShadow: '0 22px 40px rgba(15, 23, 42, 0.10)',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroImageFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroShade: {
    ...StyleSheet.absoluteFillObject,
  },
  heroCopy: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 18,
    gap: 8,
  },
  heroKicker: {
    color: 'rgba(255,255,255,0.86)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
  },
  heroSummary: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 13,
    lineHeight: 19,
  },
  heroActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  heroPrimaryAction: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  heroSecondaryAction: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderColor: 'rgba(255,255,255,0.32)',
  },
  progressCard: {
    gap: 12,
  },
  importActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  importActionButton: {
    flex: 1,
  },
  progressHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: JourneyPalette.ink,
  },
  progressAction: {
    color: JourneyPalette.accent,
    fontWeight: '800',
  },
  progressRail: {
    height: 10,
    borderRadius: 999,
    backgroundColor: JourneyPalette.cardAlt,
    overflow: 'hidden',
    flexDirection: 'row',
    gap: 2,
  },
  progressSegment: {
    height: '100%',
    minWidth: 8,
    borderRadius: 999,
  },
  progressLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  progressLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  progressLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  progressLegendText: {
    color: JourneyPalette.inkSoft,
    fontSize: 12,
    fontWeight: '700',
  },
  progressBody: {
    color: JourneyPalette.inkSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sectionLabel: {
    color: JourneyPalette.inkSoft,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  filterChip: {
    minHeight: 38,
    borderRadius: 999,
    paddingLeft: 14,
    paddingRight: 10,
    backgroundColor: JourneyPalette.card,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterChipActive: {
    backgroundColor: JourneyPalette.accentSoft,
    borderColor: '#C9D8FF',
  },
  filterChipText: {
    color: JourneyPalette.inkSoft,
    fontSize: 12,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: JourneyPalette.accent,
  },
  filterCountBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.cardAlt,
  },
  filterCountBadgeActive: {
    backgroundColor: '#FFFFFF',
  },
  filterCountBadgeText: {
    color: JourneyPalette.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  filterCountBadgeTextActive: {
    color: JourneyPalette.accent,
  },
  welcomeContent: {
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 28,
  },
  welcomeHero: {
    gap: 16,
  },
  welcomeHeroTop: {
    borderRadius: 30,
    padding: 22,
    gap: 12,
  },
  welcomeTitle: {
    fontSize: 30,
    fontWeight: '900',
    color: JourneyPalette.ink,
  },
  welcomeBody: {
    color: JourneyPalette.inkSoft,
    fontSize: 14,
    lineHeight: 22,
  },
  promiseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  promiseIcon: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: JourneyPalette.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promiseCopy: {
    flex: 1,
    gap: 4,
  },
  promiseTitle: {
    color: JourneyPalette.ink,
    fontSize: 15,
    fontWeight: '800',
  },
  promiseBody: {
    color: JourneyPalette.inkSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  promiseDivider: {
    height: 1,
    backgroundColor: JourneyPalette.line,
    marginVertical: 4,
  },
  welcomeActions: {
    gap: 10,
  },
  welcomeHint: {
    color: JourneyPalette.inkSoft,
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
    paddingHorizontal: 10,
  },
  filteredContent: {
    paddingBottom: 24,
  },
  filteredEmptyCard: {
    marginHorizontal: 14,
    marginTop: 6,
    alignItems: 'center',
    gap: 8,
  },
  filteredEmptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  filteredEmptyText: {
    textAlign: 'center',
    color: JourneyPalette.inkSoft,
    lineHeight: 20,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 112,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.34)',
  },
  quickSheetActions: {
    gap: 10,
  },
  quickActionRow: {
    minHeight: 72,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.cardAlt,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  quickActionRowDanger: {
    backgroundColor: JourneyPalette.dangerSoft,
    borderColor: '#F3CEC4',
  },
  quickActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionIconDanger: {
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  quickActionCopy: {
    flex: 1,
    gap: 3,
  },
  quickActionTitle: {
    color: JourneyPalette.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  quickActionTitleDanger: {
    color: JourneyPalette.danger,
  },
  quickActionBody: {
    color: JourneyPalette.inkSoft,
    fontSize: 13,
    lineHeight: 18,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
});
