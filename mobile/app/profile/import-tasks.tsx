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
  const tone = getImportTaskStatusTone(props.task);

  return (
    <View>
      <Pressable
        onPress={props.onPress}
        style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      >
        <View style={styles.rowLead}>
          <View style={[
            styles.rowIconWrap,
            tone === 'failed' && styles.rowIconWrapFailed,
            tone === 'analyzing' && styles.rowIconWrapRunning,
            tone === 'ready' && styles.rowIconWrapReady,
          ]}>
            <MaterialCommunityIcons
              name={getImportTaskStatusIcon(props.task)}
              size={20}
              color={
                tone === 'failed'
                  ? JourneyPalette.danger
                  : tone === 'ready'
                    ? JourneyPalette.success
                    : JourneyPalette.accent
              }
            />
          </View>

          <View style={styles.rowCopy}>
            <Text numberOfLines={1} style={styles.rowTitle}>
              {getImportTaskSourceLabel(props.task.source)}
            </Text>
            <Text numberOfLines={1} style={styles.rowSummary}>
              {summary}
            </Text>
          </View>
        </View>

        <View style={styles.rowMeta}>
          <Text style={styles.rowTime}>{formatImportTaskTime(props.task.createdAt)}</Text>
          <MaterialCommunityIcons name="chevron-right" size={16} color={JourneyPalette.muted} />
        </View>
      </Pressable>
      {!props.isLast ? <View style={styles.rowDivider} /> : null}
    </View>
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
      <View style={styles.groupCard}>
        {props.tasks.map((task, index) => (
          <TaskListRow
            key={task.id}
            task={task}
            onPress={() => props.onPressTask(task.id)}
            isLast={index === props.tasks.length - 1}
          />
        ))}
      </View>
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
        eyebrow="PROCESSING"
        title="整理中心"
        subtitle={
          hasParallelRunningTasks
            ? '多批次并行处理，请稍候。'
            : '静候佳音，系统正在为你精选瞬间。'
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
          <View style={styles.currentCard}>
            <View style={styles.currentHeader}>
              <StatusPill
                label={
                  hasParallelRunningTasks
                    ? `${runningTasks.length} 个进行中`
                    : getImportTaskStatusLabel(currentTask)
                }
                tone={hasParallelRunningTasks ? 'analyzing' : getImportTaskStatusTone(currentTask)}
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
                  ? '平均进度'
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
          </View>
        </Pressable>
      ) : (
        <EmptyStateCard
          icon="timeline-outline"
          title="实验室静候中"
          description="导入照片后，这里将展示 AI 分析、地点聚合和故事生成的每一个精准瞬间。"
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
    gap: 32,
    backgroundColor: '#FFFFFF',
    paddingBottom: 60,
  },
  currentCardWrap: {
    borderRadius: 32,
    overflow: 'hidden',
  },
  currentCard: {
    padding: 24,
    gap: 20,
    backgroundColor: JourneyPalette.surfaceVariant,
  },
  currentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  currentTime: {
    color: JourneyPalette.muted,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  currentTitle: {
    color: JourneyPalette.ink,
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
    letterSpacing: -0.8,
  },
  currentBody: {
    color: JourneyPalette.inkSoft,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
  },
  currentProgressMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: -8,
  },
  currentProgressLabel: {
    color: JourneyPalette.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  currentProgressValue: {
    color: JourneyPalette.accent,
    fontSize: 16,
    fontWeight: '900',
  },
  currentProgressBar: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  currentMetaText: {
    color: JourneyPalette.muted,
    fontSize: 13,
    fontWeight: '700',
  },
  sectionBlock: {
    gap: 16,
  },
  groupCard: {
    padding: 0,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  row: {
    paddingVertical: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  rowLead: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  rowIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.surfaceVariant,
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
    gap: 4,
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowTitle: {
    color: JourneyPalette.ink,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  rowSummary: {
    color: JourneyPalette.muted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
  },
  rowMeta: {
    alignItems: 'flex-end',
    gap: 6,
  },
  rowTime: {
    color: JourneyPalette.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  rowDivider: {
    height: 1,
    backgroundColor: JourneyPalette.line,
    marginTop: 20,
  },
  historyToggle: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  historyToggleText: {
    color: JourneyPalette.accent,
    fontSize: 13,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.7,
  },
});
