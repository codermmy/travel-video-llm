import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ProgressBar } from 'react-native-paper';

import { EmptyStateCard, PageContent, PageHeader, SurfaceCard, StatusPill, StateChip, MetricPill, SectionLabel, ListItemRow } from '@/components/ui/revamp';
import {
  loadImportTasks,
  subscribeImportTasks,
  getImportTaskSourceLabel,
} from '@/services/import/importTaskService';
import { JourneyPalette } from '@/styles/colors';
import type { ImportTaskPhase, ImportTaskState, ImportTaskRecord } from '@/types/importTask';
import {
  IMPORT_TASK_PHASE_ORDER,
  buildImportTaskMetricItems,
  buildImportTaskSummary,
  formatImportTaskTime,
  getImportTaskOverallProgress,
  getImportTaskPhaseProgress,
  getImportTaskPhaseStatusText,
  getImportTaskProgressColor,
  getImportTaskStatusLabel,
  getImportTaskStatusTone,
} from '@/utils/importTaskPresentation';

type ImportTaskDetailScreenProps = {
  taskId: string;
};

function getTaskDisplayTitle(task: ImportTaskRecord): string {
  const title = task.title.trim();
  return title ? title : '未命名任务';
}

function getTaskDisplaySummary(task: ImportTaskRecord): string {
  const summary = buildImportTaskSummary(task, getImportTaskSourceLabel(task.source)).trim();
  return summary ? summary : '正在准备整理内容';
}



function getPhaseIconName(phase: ImportTaskPhase): keyof typeof MaterialCommunityIcons.glyphMap {
  if (phase.status === 'completed') {
    return 'check';
  }
  if (phase.status === 'failed') {
    return 'alert-circle-outline';
  }
  if (phase.status === 'running') {
    return 'progress-clock';
  }

  return 'circle-outline';
}

function getPhaseSurface(phase: ImportTaskPhase): {
  backgroundColor: string;
  iconColor: string;
  progressColor: string;
} {
  if (phase.status === 'completed') {
    return {
      backgroundColor: JourneyPalette.successSoft,
      iconColor: JourneyPalette.success,
      progressColor: JourneyPalette.success,
    };
  }

  if (phase.status === 'failed') {
    return {
      backgroundColor: JourneyPalette.dangerSoft,
      iconColor: JourneyPalette.danger,
      progressColor: JourneyPalette.danger,
    };
  }

  if (phase.status === 'running') {
    return {
      backgroundColor: JourneyPalette.accentSoft,
      iconColor: JourneyPalette.accent,
      progressColor: JourneyPalette.accent,
    };
  }

  return {
    backgroundColor: JourneyPalette.surfaceVariant,
    iconColor: JourneyPalette.muted,
    progressColor: JourneyPalette.accent,
  };
}

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
      <PageContent style={styles.pageContent}>
        <PageHeader title="任务详情" />
        <EmptyStateCard
          icon="timeline-remove-outline"
          title="没有找到这条任务"
          description="这条记录可能已经被清理，或者当前参数已失效。"
          style={styles.emptyState}
        />
      </PageContent>
    );
  }

  if (!task) {
    return (
      <PageContent style={styles.pageContent}>
        <PageHeader title="任务详情" subtitle="正在读取任务记录..." />
      </PageContent>
    );
  }

  const sourceLabel = getImportTaskSourceLabel(task.source);
  const summary = getTaskDisplaySummary(task);
  const progress = getImportTaskOverallProgress(task);
  const metricItems = buildImportTaskMetricItems(task).slice(0, 4);

  return (
    <PageContent style={styles.pageContent}>
      <PageHeader
        eyebrow="整理中心"
        title="任务详情"
        subtitle={`${sourceLabel} · ${formatImportTaskTime(task.createdAt)}`}
      />

      <SurfaceCard style={styles.heroCard}>
        <View style={styles.heroBadge}>
          <StateChip
            state={getImportTaskStatusTone(task)}
            label={getImportTaskStatusLabel(task)}
            compact
          />
        </View>

        <Text numberOfLines={2} style={styles.heroTitle}>
          {getTaskDisplayTitle(task)}
        </Text>
        <Text style={styles.heroSummary}>{summary}</Text>

        <View style={styles.progressContainer}>
          <ProgressBar
            progress={progress}
            color={getImportTaskProgressColor(task)}
            style={styles.progressBar}
          />
          <View style={styles.progressMeta}>
            <Text style={styles.progressLabel}>{task.phases[task.activePhase].label}</Text>
            <Text style={[styles.progressValue, { color: getImportTaskProgressColor(task) }]}>
              {`${Math.round(progress * 100)}%`}
            </Text>
          </View>
        </View>

        <Text style={styles.heroMeta}>{`更新时间 ${formatImportTaskTime(task.updatedAt)}`}</Text>
      </SurfaceCard>

      <View style={styles.metricGrid}>
        {metricItems.map((item) => (
          <MetricPill
            key={item.label}
            value={String(item.value)}
            label={item.label}
            tone={item.tone as any}
            style={styles.metricTile}
          />
        ))}
      </View>

      <SectionLabel title="阶段进度" />

      <SurfaceCard style={styles.phaseListCard}>
        <View style={styles.phaseList}>
          {IMPORT_TASK_PHASE_ORDER.map((phaseKey, index) => {
            const phase = task.phases[phaseKey];
            const phaseSurface = getPhaseSurface(phase);

            return (
              <View key={phase.key}>
                <View style={styles.phaseRow}>
                  <View
                    style={[styles.phaseIconWrap, { backgroundColor: phaseSurface.backgroundColor }]}
                  >
                    <MaterialCommunityIcons
                      name={getPhaseIconName(phase)}
                      size={20}
                      color={phaseSurface.iconColor}
                    />
                  </View>

                  <View style={styles.phaseCopy}>
                    <View style={styles.phaseHeader}>
                      <Text style={styles.phaseTitle}>{phase.label}</Text>
                      <Text style={styles.phaseStatus}>{getImportTaskPhaseStatusText(phase)}</Text>
                    </View>
                    <Text style={styles.phaseDetail}>{phase.detail || '等待进入该阶段'}</Text>
                    <ProgressBar
                      progress={getImportTaskPhaseProgress(phase)}
                      color={phaseSurface.progressColor}
                      style={styles.phaseProgress}
                    />
                  </View>
                </View>

                {index < IMPORT_TASK_PHASE_ORDER.length - 1 ? (
                  <View style={styles.phaseDivider} />
                ) : null}
              </View>
            );
          })}
        </View>
      </SurfaceCard>
    </PageContent>
  );
}

const styles = StyleSheet.create({
  pageContent: {
    backgroundColor: JourneyPalette.background,
    gap: 0,
    paddingTop: 10,
    paddingBottom: 100,
  },
  emptyState: {
    marginTop: 8,
  },
  heroCard: {
    marginBottom: 24,
    padding: 24,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  heroTitle: {
    color: JourneyPalette.ink,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  heroSummary: {
    color: JourneyPalette.inkSoft,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  progressContainer: {
    marginVertical: 24,
  },
  progressBar: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  progressMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 12,
  },
  progressLabel: {
    color: JourneyPalette.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  progressValue: {
    fontSize: 14,
    fontWeight: '900',
  },
  heroMeta: {
    color: JourneyPalette.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 32,
  },
  metricTile: {
    width: '48%',
  },
  sectionLabel: {
    color: JourneyPalette.muted,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 20,
  },
  phaseListCard: {
    padding: 0,
    marginTop: 8,
  },
  phaseList: {
    backgroundColor: 'transparent',
  },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  phaseIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phaseCopy: {
    flex: 1,
    gap: 8,
  },
  phaseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  phaseTitle: {
    color: JourneyPalette.ink,
    fontSize: 17,
    fontWeight: '800',
  },
  phaseStatus: {
    color: JourneyPalette.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  phaseDetail: {
    color: JourneyPalette.inkSoft,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  phaseProgress: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  phaseDivider: {
    height: 1,
    backgroundColor: JourneyPalette.cardSoft,
  },
});
