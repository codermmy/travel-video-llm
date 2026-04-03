import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
  FilterChip,
  InlineBanner,
  MetricPill,
  PageContent,
  PageHeader,
  SectionLabel,
  StateChip,
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

function getTaskStatusState(task: ImportTaskRecord) {
  if (task.status === 'completed') {
    return 'ready' as const;
  }
  if (task.status === 'failed') {
    return 'failed' as const;
  }
  return 'processing' as const;
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

function buildTaskSummary(task: ImportTaskRecord): string {
  const source = getImportTaskSourceLabel(task.source);
  if (task.status === 'completed') {
    return `${source} · 新增 ${task.counts.dedupedNew} 张 · 去重 ${task.counts.dedupedExisting} 张 · 失败 ${task.counts.failed} 张`;
  }
  if (task.status === 'failed') {
    return `${source} · 最近一次任务在 ${task.phases[task.activePhase].label} 阶段中断`;
  }
  return `${source} · ${formatDateTime(task.createdAt)} 启动 · 后台持续处理中`;
}

export default function ImportTasksScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    filter?: string | string[];
    focusTaskId?: string | string[];
    intentKey?: string | string[];
  }>();
  const handledIntentKeyRef = useRef<string | null>(null);
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

  useEffect(() => {
    const requestedIntentKey = Array.isArray(params.intentKey)
      ? params.intentKey[0]
      : params.intentKey;
    const requestedFilter = Array.isArray(params.filter) ? params.filter[0] : params.filter;

    if (!requestedIntentKey || handledIntentKeyRef.current === requestedIntentKey) {
      return;
    }

    if (
      requestedFilter === 'all' ||
      requestedFilter === 'running' ||
      requestedFilter === 'completed' ||
      requestedFilter === 'failed'
    ) {
      setActiveFilter(requestedFilter);
    }

    handledIntentKeyRef.current = requestedIntentKey;
  }, [params.filter, params.intentKey]);

  const latestTask = useMemo(() => taskState.tasks[0] ?? null, [taskState.tasks]);
  const failedCount = useMemo(
    () => taskState.tasks.filter((task) => task.status === 'failed').length,
    [taskState.tasks],
  );
  const completedCount = useMemo(
    () => taskState.tasks.filter((task) => task.status === 'completed').length,
    [taskState.tasks],
  );

  const focusedTaskId = useMemo(
    () => (Array.isArray(params.focusTaskId) ? params.focusTaskId[0] : params.focusTaskId) ?? null,
    [params.focusTaskId],
  );
  const filteredTasks = useMemo(() => {
    const baseTasks =
      activeFilter === 'running'
        ? taskState.tasks.filter((task) => task.status === 'running')
        : activeFilter === 'completed'
          ? taskState.tasks.filter((task) => task.status === 'completed')
          : activeFilter === 'failed'
            ? taskState.tasks.filter((task) => task.status === 'failed')
            : taskState.tasks;

    if (!focusedTaskId) {
      return baseTasks;
    }

    return [...baseTasks].sort((left, right) => {
      if (left.id === focusedTaskId) {
        return -1;
      }
      if (right.id === focusedTaskId) {
        return 1;
      }
      return 0;
    });
  }, [activeFilter, focusedTaskId, taskState.tasks]);

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
        icon={
          failedCount > 0
            ? 'alert-circle-outline'
            : taskState.runningCount > 0
              ? 'timeline-clock-outline'
              : 'check-circle-outline'
        }
        title={
          failedCount > 0
            ? '任务中心有失败项'
            : taskState.runningCount > 0
              ? '顶部状态条会跨页出现'
              : '任务中心当前已就绪'
        }
        body={
          failedCount > 0
            ? focusedTaskId
              ? '已定位到对应失败任务，可先查看失败阶段，再决定返回回忆或继续导入。'
              : '失败项会保留在这里，建议先处理失败任务，再决定是否继续导入。'
            : taskState.runningCount > 0
              ? '分析仍在后台继续，点开这里可以回看完整阶段、结果和失败项。'
              : '没有进行中的任务时，这里仍会保留历史记录和失败项回看。'
        }
        tone={failedCount > 0 ? 'danger' : taskState.runningCount > 0 ? 'accent' : 'neutral'}
      />

      <View style={styles.metricsRow}>
        <MetricPill value={String(taskState.runningCount)} label="进行中" tone="analyzing" />
        <MetricPill
          value={latestTask ? formatDateTime(latestTask.createdAt) : '暂无'}
          label="最近启动"
        />
        <MetricPill value={String(failedCount)} label="需要关注" tone="failed" />
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
      </SurfaceCard>

      {taskState.tasks.length === 0 ? (
        <EmptyStateCard
          icon="timeline-clock-outline"
          title="还没有导入任务"
          description="第一次导入照片后，这里会显示每一轮任务的分析与同步进度。"
        />
      ) : filteredTasks.length === 0 ? (
        <EmptyStateCard
          icon="tune-variant"
          title="当前筛选下没有任务"
          description="切回“全部”可以查看完整导入历史。"
        />
      ) : (
        <>
          <SectionLabel title="任务列表" />
          {filteredTasks.map((task) => (
            <SurfaceCard
              key={task.id}
              style={[styles.taskCard, focusedTaskId === task.id && styles.taskCardFocused]}
            >
              <View style={styles.taskHeader}>
                <View style={styles.taskBadges}>
                  <View style={styles.sourceBadge}>
                    <Text style={styles.sourceBadgeText}>
                      {getImportTaskSourceLabel(task.source)}
                    </Text>
                  </View>
                  <StateChip
                    state={getTaskStatusState(task)}
                    label={getTaskStatusLabel(task)}
                    compact
                  />
                </View>
                <Text style={styles.taskTime}>{formatDateTime(task.createdAt)}</Text>
              </View>

              <Text style={styles.taskSummary}>{buildTaskSummary(task)}</Text>

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

              <View style={styles.taskMetaRow}>
                <View style={styles.microChip}>
                  <Text style={styles.microChipText}>已扫描 {task.counts.selected}</Text>
                </View>
                <View style={styles.microChip}>
                  <Text style={styles.microChipText}>新增 {task.counts.dedupedNew}</Text>
                </View>
                <View style={styles.microChip}>
                  <Text style={styles.microChipText}>去重 {task.counts.dedupedExisting}</Text>
                </View>
                {task.counts.failed > 0 ? (
                  <View style={[styles.microChip, styles.microChipDanger]}>
                    <Text style={styles.microChipTextDanger}>失败 {task.counts.failed}</Text>
                  </View>
                ) : null}
              </View>

              {task.status === 'failed' ? (
                <View style={styles.taskActionRow}>
                  <ActionButton
                    label="回到回忆"
                    tone="secondary"
                    onPress={() =>
                      router.push({
                        pathname: '/',
                        params: {
                          filter: 'all',
                          intentKey: String(Date.now()),
                        },
                      })
                    }
                    style={styles.taskActionButton}
                  />
                  <ActionButton
                    label="继续导入"
                    tone="secondary"
                    onPress={() =>
                      router.push({
                        pathname: '/',
                        params: {
                          filter: 'all',
                          importMode: 'manual',
                          intentKey: String(Date.now()),
                        },
                      })
                    }
                    style={styles.taskActionButton}
                  />
                </View>
              ) : null}
            </SurfaceCard>
          ))}
        </>
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
  taskCard: {
    gap: 14,
  },
  taskCardFocused: {
    borderColor: JourneyPalette.dangerBorder,
    borderWidth: 1,
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
  taskTime: {
    color: JourneyPalette.inkSoft,
    fontSize: 12,
  },
  taskSummary: {
    color: JourneyPalette.inkSoft,
    fontSize: 13,
    lineHeight: 20,
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
  taskMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  taskActionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  taskActionButton: {
    flex: 1,
  },
  microChip: {
    borderRadius: 999,
    backgroundColor: JourneyPalette.cardAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  microChipDanger: {
    backgroundColor: JourneyPalette.dangerSoft,
  },
  microChipText: {
    color: JourneyPalette.inkSoft,
    fontSize: 11,
    fontWeight: '800',
  },
  microChipTextDanger: {
    color: JourneyPalette.danger,
    fontSize: 11,
    fontWeight: '800',
  },
});
