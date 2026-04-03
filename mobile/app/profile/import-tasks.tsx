import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ProgressBar } from 'react-native-paper';

import {
  getImportTaskSourceLabel,
  loadImportTasks,
  subscribeImportTasks,
} from '@/services/import/importTaskService';
import { JourneyPalette } from '@/styles/colors';
import type { ImportTaskPhase, ImportTaskRecord, ImportTaskState } from '@/types/importTask';
import {
  ActionButton,
  EmptyStateCard,
  InlineBanner,
  MetricPill,
  PageContent,
  PageHeader,
  SectionLabel,
  SurfaceCard,
} from '@/components/ui/revamp';

const PHASE_ORDER = ['prepare', 'analysis', 'sync', 'story'] as const;
type TaskFilter = 'all' | 'running' | 'completed' | 'failed';

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '刚刚';
  }
  return date.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getTaskStatusLabel(task: ImportTaskRecord): string {
  if (task.status === 'completed') {
    return '已完成';
  }
  if (task.status === 'failed') {
    return '失败';
  }
  return '进行中';
}

function getTaskStatusColor(task: ImportTaskRecord): string {
  if (task.status === 'completed') {
    return JourneyPalette.success;
  }
  if (task.status === 'failed') {
    return JourneyPalette.danger;
  }
  return JourneyPalette.accent;
}

function getPhaseProgress(phase: ImportTaskPhase): number {
  if (typeof phase.current === 'number' && typeof phase.total === 'number' && phase.total > 0) {
    return Math.max(0, Math.min(1, phase.current / phase.total));
  }
  if (phase.status === 'completed') {
    return 1;
  }
  return 0;
}

function getPhaseStatusText(phase: ImportTaskPhase): string {
  if (typeof phase.current === 'number' && typeof phase.total === 'number' && phase.total > 0) {
    if (phase.key === 'story' && phase.total === 100) {
      return `${Math.round(phase.current)}%`;
    }
    return `${phase.current}/${phase.total}`;
  }
  if (phase.status === 'completed') {
    return '完成';
  }
  if (phase.status === 'failed') {
    return '失败';
  }
  return phase.status === 'running' ? '处理中' : '等待中';
}

export default function ImportTasksScreen() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<TaskFilter>('all');
  const [taskState, setTaskState] = useState<ImportTaskState>({
    tasks: [],
    latestVisibleTask: null,
    runningCount: 0,
  });

  useEffect(() => {
    const unsubscribe = subscribeImportTasks((state) => {
      setTaskState(state);
    });
    void loadImportTasks();
    return unsubscribe;
  }, []);

  const latestTask = useMemo(() => taskState.tasks[0] ?? null, [taskState.tasks]);
  const failedCount = useMemo(
    () => taskState.tasks.filter((task) => task.status === 'failed').length,
    [taskState.tasks],
  );
  const completedCount = useMemo(
    () => taskState.tasks.filter((task) => task.status === 'completed').length,
    [taskState.tasks],
  );

  const filteredTasks = useMemo(() => {
    if (activeFilter === 'running') {
      return taskState.tasks.filter((task) => task.status === 'running');
    }
    if (activeFilter === 'completed') {
      return taskState.tasks.filter((task) => task.status === 'completed');
    }
    if (activeFilter === 'failed') {
      return taskState.tasks.filter((task) => task.status === 'failed');
    }
    return taskState.tasks;
  }, [activeFilter, taskState.tasks]);

  return (
    <PageContent>
      <PageHeader
        eyebrow="IMPORT TASKS"
        title="导入任务"
        subtitle="把跨页状态条、即时进度和历史记录统一到一个可以回看的中心。"
        rightSlot={
          <ActionButton
            label="返回"
            tone="secondary"
            icon="arrow-left"
            fullWidth={false}
            onPress={() => router.back()}
          />
        }
      />

      <InlineBanner
        icon="timeline-clock-outline"
        title="顶部状态条会跨页出现"
        body="分析仍在后台继续，点开这里可以回看完整阶段、结果和失败项。"
        tone="accent"
      />

      <View style={styles.metricsRow}>
        <MetricPill value={String(taskState.runningCount)} label="进行中" />
        <MetricPill
          value={latestTask ? formatDateTime(latestTask.createdAt) : '暂无'}
          label="最近启动"
        />
        <MetricPill value={String(failedCount)} label="需要关注" />
      </View>

      <SurfaceCard>
        <SectionLabel title="筛选任务" />
        <View style={styles.filterRow}>
          {(
            [
              { key: 'all', label: '全部', count: taskState.tasks.length },
              { key: 'running', label: '进行中', count: taskState.runningCount },
              { key: 'completed', label: '已完成', count: completedCount },
              { key: 'failed', label: '异常', count: failedCount },
            ] as const
          ).map((item) => {
            const active = activeFilter === item.key;
            return (
              <Pressable
                key={item.key}
                style={[styles.filterChip, active && styles.filterChipActive]}
                onPress={() => setActiveFilter(item.key)}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                  {item.label}
                </Text>
                <Text style={[styles.filterChipCount, active && styles.filterChipCountActive]}>
                  {item.count}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </SurfaceCard>

      {taskState.tasks.length === 0 ? (
        <EmptyStateCard
          icon="timeline-clock-outline"
          title="还没有导入任务"
          description="第一次导入照片后，这里会显示每一轮任务的分析与同步进度。"
        />
      ) : (
        filteredTasks.map((task) => (
          <SurfaceCard key={task.id} style={styles.taskCard}>
            <View style={styles.taskHeader}>
              <View style={styles.taskBadges}>
                <View style={styles.sourceBadge}>
                  <Text style={styles.sourceBadgeText}>
                    {getImportTaskSourceLabel(task.source)}
                  </Text>
                </View>
                <View
                  style={[styles.statusBadge, { backgroundColor: `${getTaskStatusColor(task)}16` }]}
                >
                  <Text style={[styles.statusBadgeText, { color: getTaskStatusColor(task) }]}>
                    {getTaskStatusLabel(task)}
                  </Text>
                </View>
              </View>
              <Text style={styles.taskTime}>{formatDateTime(task.createdAt)}</Text>
            </View>

            <View style={styles.countRow}>
              <View style={styles.countItem}>
                <Text style={styles.countValue}>{task.counts.selected}</Text>
                <Text style={styles.countLabel}>选中</Text>
              </View>
              <View style={styles.countItem}>
                <Text style={styles.countValue}>{task.counts.dedupedNew}</Text>
                <Text style={styles.countLabel}>新增</Text>
              </View>
              <View style={styles.countItem}>
                <Text style={styles.countValue}>{task.counts.dedupedExisting}</Text>
                <Text style={styles.countLabel}>去重</Text>
              </View>
              <View style={styles.countItem}>
                <Text style={styles.countValue}>{task.counts.failed}</Text>
                <Text style={styles.countLabel}>失败</Text>
              </View>
            </View>

            <View style={styles.phaseList}>
              {PHASE_ORDER.map((phaseKey, index) => {
                const phase = task.phases[phaseKey];
                const isActive = task.activePhase === phase.key && task.status !== 'completed';
                return (
                  <View key={phase.key} style={styles.phaseCard}>
                    <View style={styles.phaseTopRow}>
                      <View
                        style={[
                          styles.phaseIndexBadge,
                          isActive && styles.phaseIndexBadgeActive,
                          phase.status === 'completed' && styles.phaseIndexBadgeCompleted,
                          phase.status === 'failed' && styles.phaseIndexBadgeFailed,
                        ]}
                      >
                        <Text style={styles.phaseIndexText}>{index + 1}</Text>
                      </View>
                      <View style={styles.phaseCopy}>
                        <Text style={styles.phaseTitle}>{phase.label}</Text>
                        <Text style={styles.phaseDetail} numberOfLines={2}>
                          {phase.detail || '等待进入该阶段'}
                        </Text>
                      </View>
                      <Text style={styles.phaseStatus}>{getPhaseStatusText(phase)}</Text>
                    </View>
                    <ProgressBar
                      progress={getPhaseProgress(phase)}
                      color={getTaskStatusColor(task)}
                      style={styles.phaseProgress}
                    />
                  </View>
                );
              })}
            </View>
          </SurfaceCard>
        ))
      )}
    </PageContent>
  );
}

const styles = StyleSheet.create({
  metricsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  filterChip: {
    minHeight: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.cardAlt,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterChipActive: {
    borderColor: JourneyPalette.accent,
    backgroundColor: JourneyPalette.accentSoft,
  },
  filterChipText: {
    color: JourneyPalette.ink,
    fontWeight: '800',
  },
  filterChipTextActive: {
    color: JourneyPalette.accent,
  },
  filterChipCount: {
    minWidth: 22,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: '#FFFFFF',
    color: JourneyPalette.inkSoft,
    fontSize: 11,
    fontWeight: '800',
    textAlign: 'center',
  },
  filterChipCountActive: {
    color: JourneyPalette.accent,
  },
  taskCard: {
    gap: 14,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  taskBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sourceBadge: {
    borderRadius: 999,
    backgroundColor: JourneyPalette.cardAlt,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  sourceBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  taskTime: {
    color: JourneyPalette.inkSoft,
    fontSize: 12,
  },
  countRow: {
    flexDirection: 'row',
    gap: 10,
  },
  countItem: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: JourneyPalette.cardAlt,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 4,
  },
  countValue: {
    color: JourneyPalette.ink,
    fontSize: 18,
    fontWeight: '900',
  },
  countLabel: {
    color: JourneyPalette.inkSoft,
    fontSize: 11,
    fontWeight: '700',
  },
  phaseList: {
    gap: 10,
  },
  phaseCard: {
    borderRadius: 20,
    backgroundColor: JourneyPalette.cardAlt,
    padding: 12,
    gap: 10,
  },
  phaseTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  phaseIndexBadge: {
    width: 28,
    height: 28,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  phaseIndexBadgeActive: {
    backgroundColor: JourneyPalette.accentSoft,
  },
  phaseIndexBadgeCompleted: {
    backgroundColor: JourneyPalette.successSoft,
  },
  phaseIndexBadgeFailed: {
    backgroundColor: JourneyPalette.dangerSoft,
  },
  phaseIndexText: {
    color: JourneyPalette.ink,
    fontSize: 12,
    fontWeight: '900',
  },
  phaseCopy: {
    flex: 1,
    gap: 4,
  },
  phaseTitle: {
    color: JourneyPalette.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  phaseDetail: {
    color: JourneyPalette.inkSoft,
    fontSize: 12,
    lineHeight: 18,
  },
  phaseStatus: {
    color: JourneyPalette.inkSoft,
    fontSize: 11,
    fontWeight: '800',
  },
  phaseProgress: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
});
