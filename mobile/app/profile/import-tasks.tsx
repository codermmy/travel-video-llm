import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ProgressBar } from 'react-native-paper';

import {
  EmptyStateCard,
  PageContent,
  PageHeader,
  SectionLabel,
  StatusPill,
  SurfaceCard,
} from '@/components/ui/revamp';
import { ImportTaskDetailScreen } from '@/screens/import-task-detail-screen';
import {
  getImportTaskSourceLabel,
  loadImportTasks,
  subscribeImportTasks,
} from '@/services/import/importTaskService';
import { JourneyPalette } from '@/styles/colors';
import type { ImportTaskRecord, ImportTaskState } from '@/types/importTask';
import {
  buildImportTaskSummary,
  formatImportTaskTime,
  getImportTaskOverallProgress,
  getImportTaskProgressColor,
  getImportTaskStatusIcon,
  getImportTaskStatusLabel,
  getImportTaskStatusTone,
} from '@/utils/importTaskPresentation';

const HISTORY_PREVIEW_LIMIT = 5;

function sortTasksWithFocus(tasks: ImportTaskRecord[], focusedTaskId: string | null) {
  if (!focusedTaskId) {
    return tasks;
  }

  return [...tasks].sort((left, right) => {
    if (left.id === focusedTaskId) {
      return -1;
    }
    if (right.id === focusedTaskId) {
      return 1;
    }
    return 0;
  });
}

function TaskListRow(props: { task: ImportTaskRecord; onPress: () => void; isLast: boolean }) {
  const summary = buildImportTaskSummary(props.task, getImportTaskSourceLabel(props.task.source));

  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.rowLead}>
        <View
          style={[
            styles.rowIconWrap,
            props.task.status === 'failed'
              ? styles.rowIconWrapFailed
              : props.task.status === 'completed'
                ? styles.rowIconWrapReady
                : styles.rowIconWrapRunning,
          ]}
        >
          <MaterialCommunityIcons
            name={getImportTaskStatusIcon(props.task)}
            size={17}
            color={
              props.task.status === 'failed'
                ? JourneyPalette.danger
                : props.task.status === 'completed'
                  ? JourneyPalette.success
                  : JourneyPalette.accent
            }
          />
        </View>

        <View style={styles.rowCopy}>
          <View style={styles.rowTitleLine}>
            <Text numberOfLines={1} style={styles.rowTitle}>
              {getImportTaskSourceLabel(props.task.source)}
            </Text>
            <StatusPill
              label={getImportTaskStatusLabel(props.task)}
              tone={getImportTaskStatusTone(props.task)}
            />
          </View>
          <Text numberOfLines={2} style={styles.rowSummary}>
            {summary}
          </Text>
        </View>
      </View>

      <View style={styles.rowMeta}>
        <Text style={styles.rowTime}>{formatImportTaskTime(props.task.createdAt)}</Text>
        <MaterialCommunityIcons name="chevron-right" size={18} color={JourneyPalette.muted} />
      </View>

      {!props.isLast ? <View style={styles.rowDivider} /> : null}
    </Pressable>
  );
}

function buildOverviewTitle(params: {
  runningTasks: ImportTaskRecord[];
  failedTasks: ImportTaskRecord[];
  completedTasks: ImportTaskRecord[];
}) {
  if (params.runningTasks.length > 1) {
    return `${params.runningTasks.length} 个批次正在并行整理`;
  }
  if (params.runningTasks.length === 1) {
    return `${getImportTaskSourceLabel(params.runningTasks[0].source)}正在整理`;
  }
  if (params.failedTasks.length > 1) {
    return `${params.failedTasks.length} 个批次需要处理`;
  }
  if (params.failedTasks.length === 1) {
    return `${getImportTaskSourceLabel(params.failedTasks[0].source)}需要处理`;
  }
  if (params.completedTasks.length > 0) {
    return `最近一轮${getImportTaskSourceLabel(params.completedTasks[0].source)}已完成`;
  }
  return '还没有导入记录';
}

function buildOverviewBody(params: {
  runningTasks: ImportTaskRecord[];
  failedTasks: ImportTaskRecord[];
  completedTasks: ImportTaskRecord[];
}) {
  if (params.runningTasks.length > 1) {
    return '新的导入会追加成独立批次继续处理，不会覆盖上一批。先看“进行中”列表即可。';
  }
  if (params.runningTasks.length === 1) {
    return buildImportTaskSummary(
      params.runningTasks[0],
      getImportTaskSourceLabel(params.runningTasks[0].source),
    );
  }
  if (params.failedTasks.length > 1) {
    return '失败批次会单独保留，互不影响。逐个进入详情查看中断阶段即可。';
  }
  if (params.failedTasks.length === 1) {
    return buildImportTaskSummary(
      params.failedTasks[0],
      getImportTaskSourceLabel(params.failedTasks[0].source),
    );
  }
  if (params.completedTasks.length > 0) {
    return buildImportTaskSummary(
      params.completedTasks[0],
      getImportTaskSourceLabel(params.completedTasks[0].source),
    );
  }
  return '导入从别的入口发起，这里只负责回看状态、失败和历史记录。';
}

function buildOverviewMeta(params: {
  runningTasks: ImportTaskRecord[];
  failedTasks: ImportTaskRecord[];
  completedTasks: ImportTaskRecord[];
}) {
  if (params.runningTasks.length > 1) {
    return `当前有 ${params.runningTasks.length} 个批次同时在跑`;
  }
  if (params.runningTasks.length === 1) {
    return `启动于 ${formatImportTaskTime(params.runningTasks[0].createdAt)}`;
  }
  if (params.failedTasks.length > 0) {
    return `待处理 ${params.failedTasks.length} 个批次`;
  }
  if (params.completedTasks.length > 0) {
    return `最近完成于 ${formatImportTaskTime(params.completedTasks[0].updatedAt)}`;
  }
  return '等待从别处发起新的导入';
}

function TaskGroup(props: {
  title: string;
  tasks: ImportTaskRecord[];
  onPressTask: (taskId: string) => void;
  action?: ReactNode;
}) {
  if (props.tasks.length === 0) {
    return null;
  }

  return (
    <View style={styles.sectionBlock}>
      <SectionLabel title={props.title} action={props.action} />
      <SurfaceCard style={styles.groupCard}>
        {props.tasks.map((task, index) => (
          <TaskListRow
            key={task.id}
            task={task}
            onPress={() => props.onPressTask(task.id)}
            isLast={index === props.tasks.length - 1}
          />
        ))}
      </SurfaceCard>
    </View>
  );
}

export default function ImportTasksScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    focusTaskId?: string | string[];
    taskId?: string | string[];
  }>();
  const [taskState, setTaskState] = useState<ImportTaskState>({
    tasks: [],
    latestVisibleTask: null,
    runningCount: 0,
  });
  const [showAllHistory, setShowAllHistory] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeImportTasks((state) => {
      setTaskState(state);
    });
    void loadImportTasks();
    return unsubscribe;
  }, []);

  const focusedTaskId = useMemo(
    () => (Array.isArray(params.focusTaskId) ? params.focusTaskId[0] : params.focusTaskId) ?? null,
    [params.focusTaskId],
  );
  const detailTaskId = useMemo(
    () => (Array.isArray(params.taskId) ? params.taskId[0] : params.taskId) ?? null,
    [params.taskId],
  );

  const runningTasks = useMemo(
    () =>
      sortTasksWithFocus(
        taskState.tasks.filter((task) => task.status === 'running'),
        focusedTaskId,
      ),
    [focusedTaskId, taskState.tasks],
  );
  const failedTasks = useMemo(
    () =>
      sortTasksWithFocus(
        taskState.tasks.filter((task) => task.status === 'failed'),
        focusedTaskId,
      ),
    [focusedTaskId, taskState.tasks],
  );
  const completedTasks = useMemo(
    () =>
      sortTasksWithFocus(
        taskState.tasks.filter((task) => task.status === 'completed'),
        focusedTaskId,
      ),
    [focusedTaskId, taskState.tasks],
  );

  const currentTask = useMemo(
    () => runningTasks[0] ?? failedTasks[0] ?? completedTasks[0] ?? null,
    [completedTasks, failedTasks, runningTasks],
  );
  const hasParallelRunningTasks = runningTasks.length > 1;
  const overviewProgress = useMemo(() => {
    if (runningTasks.length === 0) {
      return currentTask ? getImportTaskOverallProgress(currentTask) : 0;
    }
    return (
      runningTasks.reduce((sum, task) => sum + getImportTaskOverallProgress(task), 0) /
      runningTasks.length
    );
  }, [currentTask, runningTasks]);

  const remainingRunningTasks = useMemo(
    () =>
      hasParallelRunningTasks
        ? runningTasks
        : runningTasks.filter((task) => task.id !== currentTask?.id),
    [currentTask?.id, hasParallelRunningTasks, runningTasks],
  );
  const remainingFailedTasks = useMemo(
    () => failedTasks.filter((task) => task.id !== currentTask?.id),
    [currentTask?.id, failedTasks],
  );
  const remainingCompletedTasks = useMemo(
    () => completedTasks.filter((task) => task.id !== currentTask?.id),
    [currentTask?.id, completedTasks],
  );
  const historyTasks = useMemo(
    () =>
      showAllHistory
        ? remainingCompletedTasks
        : remainingCompletedTasks.slice(0, HISTORY_PREVIEW_LIMIT),
    [remainingCompletedTasks, showAllHistory],
  );

  const openTaskDetail = useCallback(
    (nextTaskId: string) => {
      router.push({
        pathname: '/profile/import-tasks',
        params: { taskId: nextTaskId },
      });
    },
    [router],
  );

  if (detailTaskId) {
    return <ImportTaskDetailScreen taskId={detailTaskId} />;
  }

  return (
    <PageContent style={styles.pageContent}>
      <PageHeader
        eyebrow="IMPORT"
        title="导入中心"
        subtitle={
          hasParallelRunningTasks
            ? '多批次会并行处理，这里按批次分别回看。'
            : '只看状态，不在这里发起导入。'
        }
      />

      {currentTask ? (
        <Pressable
          disabled={hasParallelRunningTasks}
          onPress={() => {
            if (!hasParallelRunningTasks) {
              openTaskDetail(currentTask.id);
            }
          }}
          style={({ pressed }) => [
            styles.currentCardWrap,
            !hasParallelRunningTasks && pressed && styles.pressed,
          ]}
        >
          <LinearGradient colors={['#FBFDFF', '#F2F7FF']} style={styles.currentCard}>
            <View style={styles.currentHeader}>
              <StatusPill
                label={
                  hasParallelRunningTasks
                    ? `${runningTasks.length} 个进行中`
                    : getImportTaskStatusLabel(currentTask)
                }
                tone={hasParallelRunningTasks ? 'analyzing' : getImportTaskStatusTone(currentTask)}
                icon={
                  hasParallelRunningTasks ? 'progress-clock' : getImportTaskStatusIcon(currentTask)
                }
              />
              <Text style={styles.currentTime}>
                {hasParallelRunningTasks
                  ? `${runningTasks.length} 批次`
                  : formatImportTaskTime(currentTask.createdAt)}
              </Text>
            </View>

            <Text style={styles.currentTitle}>
              {buildOverviewTitle({ runningTasks, failedTasks, completedTasks })}
            </Text>
            <Text style={styles.currentBody}>
              {buildOverviewBody({ runningTasks, failedTasks, completedTasks })}
            </Text>

            <View style={styles.currentProgressMeta}>
              <Text style={styles.currentProgressLabel}>
                {hasParallelRunningTasks
                  ? '并行批次平均进度'
                  : currentTask.phases[currentTask.activePhase].label}
              </Text>
              <Text style={styles.currentProgressValue}>{Math.round(overviewProgress * 100)}%</Text>
            </View>
            <ProgressBar
              progress={overviewProgress}
              color={
                hasParallelRunningTasks
                  ? JourneyPalette.accent
                  : getImportTaskProgressColor(currentTask)
              }
              style={styles.currentProgressBar}
            />

            <Text style={styles.currentMetaText}>
              {hasParallelRunningTasks
                ? buildOverviewMeta({ runningTasks, failedTasks, completedTasks })
                : `轻触进入详情 · ${buildOverviewMeta({
                    runningTasks,
                    failedTasks,
                    completedTasks,
                  })}`}
            </Text>
          </LinearGradient>
        </Pressable>
      ) : (
        <EmptyStateCard
          icon="timeline-outline"
          title="第一轮导入还没开始"
          description="导入从别的入口发起，这里只保留当前状态、失败提醒和最近记录。"
        />
      )}

      <TaskGroup title="进行中" tasks={remainingRunningTasks} onPressTask={openTaskDetail} />
      <TaskGroup title="需要处理" tasks={remainingFailedTasks} onPressTask={openTaskDetail} />
      <TaskGroup
        title="最近记录"
        tasks={historyTasks}
        onPressTask={openTaskDetail}
        action={
          remainingCompletedTasks.length > HISTORY_PREVIEW_LIMIT ? (
            <Pressable
              onPress={() => setShowAllHistory((value) => !value)}
              style={({ pressed }) => [styles.historyToggle, pressed && styles.pressed]}
            >
              <Text style={styles.historyToggleText}>{showAllHistory ? '收起' : '更多'}</Text>
            </Pressable>
          ) : undefined
        }
      />
    </PageContent>
  );
}

const styles = StyleSheet.create({
  pageContent: {
    gap: 20,
  },
  currentCardWrap: {
    borderRadius: 28,
  },
  currentCard: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#DCE6F7',
    padding: 18,
    gap: 14,
    boxShadow: '0 12px 30px rgba(15, 23, 42, 0.06)',
  },
  currentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  currentTime: {
    color: JourneyPalette.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  currentTitle: {
    color: JourneyPalette.ink,
    fontSize: 24,
    fontWeight: '900',
    lineHeight: 30,
  },
  currentBody: {
    color: JourneyPalette.inkSoft,
    fontSize: 14,
    lineHeight: 21,
  },
  currentProgressMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  currentProgressLabel: {
    color: JourneyPalette.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  currentProgressValue: {
    color: JourneyPalette.inkSoft,
    fontSize: 12,
    fontWeight: '800',
  },
  currentProgressBar: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
  },
  currentMetaText: {
    color: JourneyPalette.mutedStrong,
    fontSize: 12,
    fontWeight: '700',
  },
  sectionBlock: {
    gap: 10,
  },
  groupCard: {
    padding: 0,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: JourneyPalette.line,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingRight: 68,
  },
  rowIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconWrapRunning: {
    backgroundColor: JourneyPalette.accentSoft,
  },
  rowIconWrapReady: {
    backgroundColor: JourneyPalette.successSoft,
  },
  rowIconWrapFailed: {
    backgroundColor: JourneyPalette.dangerSoft,
  },
  rowCopy: {
    flex: 1,
    gap: 6,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  rowTitle: {
    color: JourneyPalette.ink,
    fontSize: 15,
    fontWeight: '900',
  },
  rowSummary: {
    color: JourneyPalette.inkSoft,
    fontSize: 13,
    lineHeight: 19,
  },
  rowMeta: {
    position: 'absolute',
    top: 14,
    right: 16,
    alignItems: 'flex-end',
    gap: 6,
  },
  rowTime: {
    color: JourneyPalette.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  rowDivider: {
    position: 'absolute',
    left: 62,
    right: 16,
    bottom: 0,
    height: 1,
    backgroundColor: JourneyPalette.line,
  },
  historyToggle: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: JourneyPalette.card,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
  },
  historyToggleText: {
    color: JourneyPalette.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.92,
  },
});
