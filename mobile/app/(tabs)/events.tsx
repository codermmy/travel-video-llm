import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, SectionList, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Button, Snackbar, Text } from 'react-native-paper';

import { EventEditSheet } from '@/components/event/EventEditSheet';
import { EventPhotoManagerSheet } from '@/components/event/EventPhotoManagerSheet';
import { ImportProgressModal, type ImportProgress } from '@/components/import/ImportProgressModal';
import { PhotoLibraryPickerModal } from '@/components/photo/PhotoLibraryPickerModal';
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
import { JourneyPalette } from '@/styles/colors';
import type { EventRecord } from '@/types/event';
import { groupEventsByMonth, type MonthSection } from '@/utils/eventGrouping';
import { openAppSettings } from '@/utils/permissionUtils';

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

function formatDateLabel(value: string | null | undefined): string {
  if (!value) {
    return '尚未整理';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '尚未整理';
  }

  return date.toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
  });
}

export default function EventsScreen() {
  const router = useRouter();
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importVisible, setImportVisible] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress>({ stage: 'idle' });
  const [importSummary, setImportSummary] = useState<ImportCacheSummary | null>(null);
  const [snackbar, setSnackbar] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);
  const [taskProgressVisible, setTaskProgressVisible] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [actionEvent, setActionEvent] = useState<EventRecord | null>(null);
  const [editingEvent, setEditingEvent] = useState<EventRecord | null>(null);
  const [photoManagerEventId, setPhotoManagerEventId] = useState<string | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerSubmitting, setPickerSubmitting] = useState(false);
  const autoImportTriggeredRef = useRef(false);

  const dismissSnackbar = useCallback(() => setSnackbar(''), []);

  const canShowModal = useMemo(
    () => importVisible && importProgress.stage !== 'idle',
    [importProgress.stage, importVisible],
  );
  const monthSections = useMemo(() => groupEventsByMonth(events), [events]);
  const totalPhotoCount = useMemo(
    () => events.reduce((sum, event) => sum + event.photoCount, 0),
    [events],
  );
  const staleEventCount = useMemo(
    () => events.filter((event) => event.storyFreshness === 'stale').length,
    [events],
  );
  const showImportActionCard = events.length === 0 && !importSummary?.lastRunAt;

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

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadEvents(), loadImportSummary()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadEvents, loadImportSummary]);

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
    if (loading || refreshing || importVisible) {
      return;
    }
    if (events.length > 0) {
      return;
    }
    if (!importSummary || importSummary.lastRunAt) {
      return;
    }
    if (autoImportTriggeredRef.current) {
      return;
    }

    autoImportTriggeredRef.current = true;
    void runImport('recent');
  }, [events.length, importSummary, importVisible, loading, refreshing, runImport]);

  const goToEventDetail = useCallback(
    (id: string) => {
      router.push(`/events/${id}`);
    },
    [router],
  );

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

  const header = (
    <View style={styles.headerBlock}>
      <LinearGradient colors={['#FFF8F0', '#F0EADD']} style={styles.heroCard}>
        <Text style={styles.eyebrow}>TRAVEL MEMORY</Text>
        <View style={styles.heroRow}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroTitle}>旅程</Text>
            <Text style={styles.heroSubtitle}>
              系统会自动把最近导入的照片整理为事件，让回看更像翻一本安静的旅行手帐。
            </Text>
          </View>
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeValue}>{events.length}</Text>
            <Text style={styles.heroBadgeLabel}>事件</Text>
          </View>
        </View>

        <View style={styles.metricsRow}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{totalPhotoCount}</Text>
            <Text style={styles.metricLabel}>已整理照片</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{formatDateLabel(importSummary?.lastRunAt)}</Text>
            <Text style={styles.metricLabel}>最近整理</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{staleEventCount}</Text>
            <Text style={styles.metricLabel}>待更新故事</Text>
          </View>
        </View>
      </LinearGradient>

      {showImportActionCard ? (
        <View style={styles.actionCard}>
          <View style={styles.actionCopy}>
            <Text style={styles.actionTitle}>继续整理照片</Text>
            <Text style={styles.actionSubtitle}>
              主入口仍然是最近 {AUTO_IMPORT_LIMIT} 张，手动补导入只作为补充能力保留。
            </Text>
          </View>

          <View style={styles.actionRow}>
            <Pressable
              style={({ pressed }) => [styles.primaryAction, pressed && styles.actionPressed]}
              onPress={handleRecentImport}
            >
              <MaterialCommunityIcons name="image-multiple" size={16} color="#FFF9F2" />
              <Text style={styles.primaryActionText}>导入最近 200 张</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [styles.secondaryAction, pressed && styles.actionPressed]}
              onPress={handleManualImport}
            >
              <MaterialCommunityIcons name="image-plus" size={16} color={JourneyPalette.ink} />
              <Text style={styles.secondaryActionText}>手动补导入</Text>
            </Pressable>
          </View>

          <View style={styles.privacyRow}>
            <MaterialCommunityIcons
              name="shield-lock-outline"
              size={16}
              color={JourneyPalette.inkSoft}
            />
            <Text style={styles.privacyText}>默认不上图，只同步 metadata 与端侧结构化结果。</Text>
          </View>
        </View>
      ) : null}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <LinearGradient colors={['#F8F1E7', '#ECF0E8']} style={styles.loadingOrb}>
          <MaterialCommunityIcons name="image-filter-hdr" size={28} color={JourneyPalette.accent} />
        </LinearGradient>
        <ActivityIndicator size="large" color={JourneyPalette.accent} />
        <Text style={styles.loadingTitle}>正在整理你的旅程</Text>
        <Text style={styles.loadingText}>导入、聚类和故事状态会在这里汇总展示。</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <LinearGradient colors={['#FAECE9', '#F8F1E8']} style={styles.loadingOrb}>
          <MaterialCommunityIcons
            name="alert-circle-outline"
            size={28}
            color={JourneyPalette.danger}
          />
        </LinearGradient>
        <Text style={styles.errorText}>{error}</Text>
        <Button mode="contained" onPress={refresh} style={styles.retryButton}>
          重新加载
        </Button>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {events.length === 0 ? (
        <View style={styles.emptyState}>
          {header}
          <LinearGradient colors={['#F4ECDF', '#EAF1EB']} style={styles.emptyIconWrap}>
            <MaterialCommunityIcons
              name="image-filter-center-focus"
              size={44}
              color={JourneyPalette.accent}
            />
          </LinearGradient>
          <Text style={styles.emptyTitle}>还没有生成旅程卡片</Text>
          <Text style={styles.emptyDescription}>
            首次整理后，系统会自动聚合事件、补全故事并把它们陈列在这里。你不需要再从手动选图开始。
          </Text>

          {showSettings ? (
            <Pressable
              style={({ pressed }) => [styles.settingsAction, pressed && styles.actionPressed]}
              onPress={openAppSettings}
            >
              <Text style={styles.settingsActionText}>打开系统设置授权</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <SectionList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          sections={monthSections}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={header}
          renderSectionHeader={renderMonthHeader}
          renderItem={renderTimelineCard}
          refreshing={refreshing}
          onRefresh={refresh}
          stickySectionHeadersEnabled={false}
          initialNumToRender={8}
          maxToRenderPerBatch={10}
          windowSize={7}
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
      <Snackbar visible={Boolean(snackbar)} onDismiss={dismissSnackbar} duration={2500}>
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
          <View style={styles.sheetCard}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>{actionEvent?.title || '未命名事件'}</Text>
            <Text style={styles.sheetHint}>长按卡片后的快捷入口，不用先进入事件详情。</Text>

            <Pressable
              style={({ pressed }) => [styles.sheetAction, pressed && styles.actionPressed]}
              onPress={() => {
                setEditingEvent(actionEvent);
                setActionEvent(null);
              }}
            >
              <MaterialCommunityIcons name="pencil-outline" size={18} color={JourneyPalette.ink} />
              <Text style={styles.sheetActionText}>编辑事件</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.sheetAction, pressed && styles.actionPressed]}
              onPress={() => {
                setPhotoManagerEventId(actionEvent?.id ?? null);
                setActionEvent(null);
              }}
            >
              <MaterialCommunityIcons
                name="image-multiple-outline"
                size={18}
                color={JourneyPalette.ink}
              />
              <Text style={styles.sheetActionText}>管理照片</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.sheetDangerAction, pressed && styles.actionPressed]}
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
                          } catch (error) {
                            setSnackbar(
                              error instanceof Error ? error.message : '删除失败，请稍后再试',
                            );
                          }
                        })();
                      },
                    },
                  ],
                );
              }}
            >
              <MaterialCommunityIcons
                name="trash-can-outline"
                size={18}
                color={JourneyPalette.danger}
              />
              <Text style={styles.sheetDangerText}>删除事件</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.sheetCancelAction, pressed && styles.actionPressed]}
              onPress={() => setActionEvent(null)}
            >
              <Text style={styles.sheetCancelText}>取消</Text>
            </Pressable>
          </View>
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
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: JourneyPalette.cardAlt,
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
    fontSize: 22,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  loadingText: {
    marginTop: 8,
    color: JourneyPalette.inkSoft,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorText: {
    color: JourneyPalette.danger,
    marginVertical: 12,
    textAlign: 'center',
  },
  retryButton: {
    borderRadius: 999,
    backgroundColor: JourneyPalette.accent,
  },
  headerBlock: {
    gap: 14,
    paddingTop: 16,
  },
  heroCard: {
    marginHorizontal: 14,
    borderRadius: 30,
    padding: 20,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: JourneyPalette.muted,
  },
  heroRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  heroCopy: {
    flex: 1,
  },
  heroTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  heroSubtitle: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: JourneyPalette.inkSoft,
  },
  heroBadge: {
    minWidth: 76,
    borderRadius: 22,
    backgroundColor: JourneyPalette.card,
    paddingHorizontal: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadgeValue: {
    fontSize: 24,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  heroBadgeLabel: {
    marginTop: 3,
    fontSize: 11,
    color: JourneyPalette.muted,
  },
  metricsRow: {
    marginTop: 16,
    gap: 10,
  },
  metricCard: {
    borderRadius: 20,
    backgroundColor: 'rgba(255,252,247,0.74)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  metricLabel: {
    marginTop: 4,
    fontSize: 12,
    color: JourneyPalette.muted,
  },
  actionCard: {
    marginHorizontal: 14,
    borderRadius: 26,
    backgroundColor: JourneyPalette.card,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    padding: 18,
    gap: 14,
  },
  actionCopy: {
    gap: 6,
  },
  actionTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  actionSubtitle: {
    lineHeight: 20,
    color: JourneyPalette.inkSoft,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: JourneyPalette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  primaryActionText: {
    color: '#FFF9F2',
    fontWeight: '800',
  },
  secondaryAction: {
    flex: 1,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: JourneyPalette.cardAlt,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  secondaryActionText: {
    color: JourneyPalette.ink,
    fontWeight: '800',
  },
  actionPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  privacyText: {
    flex: 1,
    color: JourneyPalette.muted,
    fontSize: 12,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    paddingBottom: 40,
  },
  emptyIconWrap: {
    width: 92,
    height: 92,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
  },
  emptyTitle: {
    marginTop: 18,
    fontSize: 22,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  emptyDescription: {
    marginTop: 10,
    paddingHorizontal: 28,
    textAlign: 'center',
    color: JourneyPalette.inkSoft,
    lineHeight: 21,
  },
  settingsAction: {
    marginTop: 18,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  settingsActionText: {
    color: JourneyPalette.ink,
    fontWeight: '700',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 110,
  },
  sheetBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(21, 32, 31, 0.42)',
  },
  sheetCard: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: JourneyPalette.card,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 28,
    gap: 10,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 46,
    height: 5,
    borderRadius: 999,
    backgroundColor: JourneyPalette.lineStrong,
    marginBottom: 8,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  sheetHint: {
    marginBottom: 4,
    color: JourneyPalette.inkSoft,
    lineHeight: 20,
  },
  sheetAction: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: '#FFF9F2',
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sheetActionText: {
    color: JourneyPalette.ink,
    fontWeight: '800',
  },
  sheetDangerAction: {
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: '#FCE8E5',
    borderWidth: 1,
    borderColor: '#F2C8C1',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sheetDangerText: {
    color: JourneyPalette.danger,
    fontWeight: '800',
  },
  sheetCancelAction: {
    minHeight: 52,
    borderRadius: 18,
    backgroundColor: JourneyPalette.cardAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCancelText: {
    color: JourneyPalette.ink,
    fontWeight: '800',
  },
});
