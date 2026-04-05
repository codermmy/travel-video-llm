import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ProgressBar } from 'react-native-paper';

import {
  EmptyStateCard,
  PageContent,
  PageHeader,
  SectionLabel,
  StatusPill,
  SurfaceCard,
} from '@/components/ui/revamp';
import {
  getImportTaskSourceLabel,
  loadImportTasks,
  subscribeImportTasks,
} from '@/services/import/importTaskService';
import { JourneyPalette } from '@/styles/colors';
import type { ImportTaskState } from '@/types/importTask';
import {
  IMPORT_TASK_PHASE_ORDER,
  buildImportTaskMetricItems,
  buildImportTaskSummary,
  formatImportTaskTime,
  getImportTaskOverallProgress,
  getImportTaskPhaseProgress,
  getImportTaskPhaseStatusText,
  getImportTaskProgressColor,
  getImportTaskStatusIcon,
  getImportTaskStatusLabel,
  getImportTaskStatusTone,
} from '@/utils/importTaskPresentation';

type ImportTaskDetailScreenProps = {
  taskId: string;
};

export function ImportTaskDetailScreen({ taskId }: ImportTaskDetailScreenProps) {
  const [taskState, setTaskState] = useState<ImportTaskState>({
    tasks: [],
    latestVisibleTask: null,
    runningCount: 0,
  });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeImportTasks((state) => {
      setTaskState(state);
    });

    void (async () => {
      await loadImportTasks();
      setLoaded(true);
    })();

    return unsubscribe;
  }, []);

  const task = useMemo(
    () => taskState.tasks.find((item) => item.id === taskId) ?? null,
    [taskId, taskState.tasks],
  );

  if (loaded && !task) {
    return (
      <PageContent>
        <PageHeader eyebrow="IMPORT" title="任务详情" subtitle="这条任务记录可能已经被清理。" />
        <EmptyStateCard
          icon="timeline-remove-outline"
          title="没有找到这条任务"
          description="这条记录可能已经被清理，或者当前参数已失效。"
        />
      </PageContent>
    );
  }

  if (!task) {
    return (
      <PageContent>
        <PageHeader eyebrow="IMPORT" title="任务详情" subtitle="正在读取任务记录。" />
      </PageContent>
    );
  }

  const sourceLabel = getImportTaskSourceLabel(task.source);
  const summary = buildImportTaskSummary(task, sourceLabel);
  const progress = getImportTaskOverallProgress(task);
  const metricItems = buildImportTaskMetricItems(task).slice(0, 4);

  return (
    <PageContent style={styles.pageContent}>
      <PageHeader
        eyebrow="IMPORT"
        title="任务详情"
        subtitle={`${sourceLabel} · ${formatImportTaskTime(task.createdAt)}`}
      />

      <SurfaceCard style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <StatusPill
            label={getImportTaskStatusLabel(task)}
            tone={getImportTaskStatusTone(task)}
            icon={getImportTaskStatusIcon(task)}
          />
          <Text style={styles.heroTime}>更新时间 {formatImportTaskTime(task.updatedAt)}</Text>
        </View>

        <Text style={styles.heroTitle}>{task.title}</Text>
        <Text style={styles.heroSummary}>{summary}</Text>

        <View style={styles.heroProgressHeader}>
          <Text style={styles.heroProgressLabel}>{task.phases[task.activePhase].label}</Text>
          <Text style={styles.heroProgressValue}>{Math.round(progress * 100)}%</Text>
        </View>
        <ProgressBar
          progress={progress}
          color={getImportTaskProgressColor(task)}
          style={styles.heroProgressBar}
        />
      </SurfaceCard>

      <View style={styles.metricGrid}>
        {metricItems.map((item) => (
          <View
            key={item.label}
            style={[
              styles.metricTile,
              item.tone === 'ready'
                ? styles.metricTileReady
                : item.tone === 'failed'
                  ? styles.metricTileFailed
                  : item.tone === 'analyzing'
                    ? styles.metricTileAccent
                    : null,
            ]}
          >
            <Text
              style={[
                styles.metricTileValue,
                item.tone === 'ready'
                  ? styles.metricTileValueReady
                  : item.tone === 'failed'
                    ? styles.metricTileValueFailed
                    : item.tone === 'analyzing'
                      ? styles.metricTileValueAccent
                      : null,
              ]}
            >
              {item.value}
            </Text>
            <Text style={styles.metricTileLabel}>{item.label}</Text>
          </View>
        ))}
      </View>

      <View style={styles.sectionBlock}>
        <SectionLabel title="阶段进度" />
        <SurfaceCard style={styles.timelineCard}>
          {IMPORT_TASK_PHASE_ORDER.map((phaseKey, index) => {
            const phase = task.phases[phaseKey];
            return (
              <View key={phase.key} style={styles.timelineRow}>
                <View style={styles.timelineRail}>
                  <View
                    style={[
                      styles.timelineDot,
                      phase.status === 'completed'
                        ? styles.timelineDotReady
                        : phase.status === 'failed'
                          ? styles.timelineDotFailed
                          : phase.status === 'running'
                            ? styles.timelineDotAccent
                            : styles.timelineDotNeutral,
                    ]}
                  />
                  {index < IMPORT_TASK_PHASE_ORDER.length - 1 ? (
                    <View style={styles.timelineLine} />
                  ) : null}
                </View>

                <View style={styles.timelineContent}>
                  <View style={styles.timelineHeader}>
                    <Text style={styles.timelineTitle}>{phase.label}</Text>
                    <Text style={styles.timelineStatus}>{getImportTaskPhaseStatusText(phase)}</Text>
                  </View>
                  <Text style={styles.timelineDetail}>{phase.detail || '等待进入该阶段'}</Text>
                  <ProgressBar
                    progress={getImportTaskPhaseProgress(phase)}
                    color={
                      phase.status === 'failed'
                        ? JourneyPalette.danger
                        : phase.status === 'completed'
                          ? JourneyPalette.success
                          : JourneyPalette.accent
                    }
                    style={styles.timelineProgress}
                  />
                </View>
              </View>
            );
          })}
        </SurfaceCard>
      </View>
    </PageContent>
  );
}

const styles = StyleSheet.create({
  pageContent: {
    gap: 20,
  },
  heroCard: {
    gap: 14,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroTime: {
    color: JourneyPalette.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  heroTitle: {
    color: JourneyPalette.ink,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
  },
  heroSummary: {
    color: JourneyPalette.inkSoft,
    fontSize: 14,
    lineHeight: 21,
  },
  heroProgressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  heroProgressLabel: {
    color: JourneyPalette.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  heroProgressValue: {
    color: JourneyPalette.inkSoft,
    fontSize: 12,
    fontWeight: '800',
  },
  heroProgressBar: {
    height: 8,
    borderRadius: 999,
    backgroundColor: JourneyPalette.cardSoft,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricTile: {
    width: '48%',
    minHeight: 82,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.card,
    paddingHorizontal: 14,
    paddingVertical: 12,
    justifyContent: 'space-between',
  },
  metricTileAccent: {
    backgroundColor: JourneyPalette.accentSoft,
    borderColor: '#CADAFF',
  },
  metricTileReady: {
    backgroundColor: JourneyPalette.successSoft,
    borderColor: JourneyPalette.successBorder,
  },
  metricTileFailed: {
    backgroundColor: JourneyPalette.dangerSoft,
    borderColor: JourneyPalette.dangerBorder,
  },
  metricTileValue: {
    color: JourneyPalette.ink,
    fontSize: 22,
    fontWeight: '900',
  },
  metricTileValueAccent: {
    color: JourneyPalette.accent,
  },
  metricTileValueReady: {
    color: JourneyPalette.success,
  },
  metricTileValueFailed: {
    color: JourneyPalette.danger,
  },
  metricTileLabel: {
    color: JourneyPalette.inkSoft,
    fontSize: 11,
    fontWeight: '700',
  },
  sectionBlock: {
    gap: 10,
  },
  timelineCard: {
    gap: 14,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: 12,
  },
  timelineRail: {
    width: 14,
    alignItems: 'center',
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 999,
    borderWidth: 2,
  },
  timelineDotAccent: {
    backgroundColor: JourneyPalette.accentSoft,
    borderColor: JourneyPalette.accent,
  },
  timelineDotReady: {
    backgroundColor: JourneyPalette.successSoft,
    borderColor: JourneyPalette.success,
  },
  timelineDotFailed: {
    backgroundColor: JourneyPalette.dangerSoft,
    borderColor: JourneyPalette.danger,
  },
  timelineDotNeutral: {
    backgroundColor: JourneyPalette.cardSoft,
    borderColor: JourneyPalette.lineStrong,
  },
  timelineLine: {
    flex: 1,
    width: 2,
    marginTop: 4,
    backgroundColor: JourneyPalette.line,
  },
  timelineContent: {
    flex: 1,
    gap: 8,
    paddingBottom: 6,
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  timelineTitle: {
    color: JourneyPalette.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  timelineStatus: {
    color: JourneyPalette.inkSoft,
    fontSize: 11,
    fontWeight: '800',
  },
  timelineDetail: {
    color: JourneyPalette.inkSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  timelineProgress: {
    height: 7,
    borderRadius: 999,
    backgroundColor: JourneyPalette.cardSoft,
  },
});
