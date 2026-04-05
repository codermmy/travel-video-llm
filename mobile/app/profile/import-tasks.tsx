import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ProgressBar } from 'react-native-paper';

import { EmptyStateCard, PageContent } from '@/components/ui/revamp';
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
  getImportTaskStatusIcon,
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

function getTaskDisplayTitle(task: ImportTaskRecord | null): string {
  const title = task?.title?.trim();
  return title ? title : '未命名任务';
}

function getTaskDisplaySummary(task: ImportTaskRecord | null): string {
  if (!task) {
    return '正在准备整理内容';
  }

  const summary = buildImportTaskSummary(task, getImportTaskSourceLabel(task.source)).trim();
  return summary ? summary : '正在准备整理内容';
}

function getHistorySummary(task: ImportTaskRecord): string {
  const summary = buildImportTaskSummary(task, getImportTaskSourceLabel(task.source)).trim();
  return summary ? summary : '暂无摘要';
}

function getTaskTimeLabel(value: string | null | undefined): string {
  if (!value) {
    return '刚刚';
  }

  const label = formatImportTaskTime(value).trim();
  return label ? label : '刚刚';
}

function getTaskEtaLabel(task: ImportTaskRecord | null): string {
  if (!task) {
    return '片刻';
  }

  if (task.status === 'completed') {
    return '已完成';
  }

  if (task.status === 'failed') {
    return '处理中断';
  }

  const activePhase = task.phases[task.activePhase];
  if (activePhase.status === 'completed') {
    return '即将完成';
  }

  return '片刻';
}

function getHeroMeta(task: ImportTaskRecord | null): string {
  if (!task) {
    return '启动于 刚刚 · 预计还需 片刻';
  }

  return `启动于 ${getTaskTimeLabel(task.createdAt)} · 预计还需 ${getTaskEtaLabel(task)}`;
}

function getToneBackground(task: ImportTaskRecord): string {
  const tone = getImportTaskStatusTone(task);

  if (tone === 'failed') {
    return JourneyPalette.dangerSoft;
  }
  if (tone === 'ready') {
    return JourneyPalette.successSoft;
  }

  return JourneyPalette.surfaceVariant;
}

function getToneIconColor(task: ImportTaskRecord): string {
  const tone = getImportTaskStatusTone(task);

  if (tone === 'failed') {
    return JourneyPalette.danger;
  }
  if (tone === 'ready') {
    return JourneyPalette.success;
  }

  return JourneyPalette.accent;
}

function HistoryRow(props: { task: ImportTaskRecord; onPress: () => void; isLast: boolean }) {
  const summary = getHistorySummary(props.task);

  return (
    <View>
      <Pressable
        onPress={props.onPress}
        style={({ pressed }) => [styles.historyRow, pressed && styles.pressed]}
      >
        <View style={[styles.historyIcon, { backgroundColor: getToneBackground(props.task) }]}>
          <MaterialCommunityIcons
            name={getImportTaskStatusIcon(props.task)}
            size={20}
            color={getToneIconColor(props.task)}
          />
        </View>

        <View style={styles.historyCopy}>
          <Text numberOfLines={1} style={styles.historyTitle}>
            {getTaskDisplayTitle(props.task)}
          </Text>
          <Text numberOfLines={2} style={styles.historySummary}>
            {summary}
          </Text>
        </View>

        <Text style={styles.historyTime}>
          {getTaskTimeLabel(props.task.updatedAt || props.task.createdAt)}
        </Text>
      </Pressable>

      {!props.isLast ? <View style={styles.historyDivider} /> : null}
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
  const historyRows = useMemo(
    () => [...remainingRunningTasks, ...remainingFailedTasks, ...historyTasks],
    [historyTasks, remainingFailedTasks, remainingRunningTasks],
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
      <Text style={styles.pageTitle}>整理中心</Text>
      <Text style={styles.pageSubtitle}>AI 正在实验室中精心冲印</Text>

      {currentTask ? (
        <Pressable
          disabled={hasParallelRunningTasks}
          onPress={() => {
            if (!hasParallelRunningTasks) {
              openTaskDetail(currentTask.id);
            }
          }}
          style={({ pressed }) => [
            styles.heroCard,
            pressed && !hasParallelRunningTasks && styles.pressed,
          ]}
        >
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>Analyzing</Text>
          </View>

          <Text numberOfLines={2} style={styles.heroTitle}>
            {getTaskDisplayTitle(currentTask)}
          </Text>
          <Text numberOfLines={2} style={styles.heroBody}>
            {getTaskDisplaySummary(currentTask)}
          </Text>

          <View style={styles.progressContainer}>
            <ProgressBar
              progress={overviewProgress}
              color={JourneyPalette.accent}
              style={styles.progressBar}
            />
            <View style={styles.progressMeta}>
              <Text style={styles.progressLabel}>正在生成故事情节</Text>
              <Text style={styles.progressValue}>{`${Math.round(overviewProgress * 100)}%`}</Text>
            </View>
          </View>

          <Text style={styles.heroMeta}>{getHeroMeta(currentTask)}</Text>
        </Pressable>
      ) : (
        <EmptyStateCard
          icon="timeline-outline"
          title="实验室静候中"
          description="导入照片后，这里将展示 AI 分析、地点聚合和故事生成的每一个精准瞬间。"
          style={styles.emptyStateCard}
        />
      )}

      {historyRows.length > 0 ? (
        <>
          <View style={styles.historyLabelRow}>
            <Text style={styles.historyLabel}>历史记录</Text>
            {remainingCompletedTasks.length > HISTORY_PREVIEW_LIMIT ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setShowAllHistory((value) => !value)}
                style={({ pressed }) => [styles.historyToggle, pressed && styles.pressed]}
              >
                <MaterialCommunityIcons
                  name={showAllHistory ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={JourneyPalette.muted}
                />
              </Pressable>
            ) : null}
          </View>

          <View>
            {historyRows.map((task, index) => (
              <HistoryRow
                key={task.id}
                task={task}
                onPress={() => openTaskDetail(task.id)}
                isLast={index === historyRows.length - 1}
              />
            ))}
          </View>
        </>
      ) : null}
    </PageContent>
  );
}

const styles = StyleSheet.create({
  pageContent: {
    backgroundColor: JourneyPalette.background,
    gap: 0,
    paddingTop: 20,
    paddingHorizontal: 24,
    paddingBottom: 100,
  },
  pageTitle: {
    color: JourneyPalette.ink,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1.2,
    marginTop: 20,
    marginBottom: 4,
  },
  pageSubtitle: {
    color: JourneyPalette.inkSoft,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    marginBottom: 32,
  },
  heroCard: {
    backgroundColor: JourneyPalette.surfaceVariant,
    borderRadius: 32,
    padding: 28,
    marginBottom: 40,
  },
  emptyStateCard: {
    marginBottom: 40,
  },
  heroBadge: {
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginBottom: 16,
    borderRadius: 8,
    backgroundColor: JourneyPalette.accentSoft,
  },
  heroBadgeText: {
    color: JourneyPalette.accent,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  heroTitle: {
    color: JourneyPalette.ink,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  heroBody: {
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
    color: JourneyPalette.accent,
    fontSize: 14,
    fontWeight: '900',
  },
  heroMeta: {
    color: JourneyPalette.muted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  historyLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  historyLabel: {
    color: JourneyPalette.muted,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 2,
  },
  historyToggle: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 16,
  },
  historyIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyCopy: {
    flex: 1,
    gap: 4,
  },
  historyTitle: {
    color: JourneyPalette.ink,
    fontSize: 17,
    fontWeight: '800',
  },
  historySummary: {
    color: JourneyPalette.muted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
  },
  historyTime: {
    color: JourneyPalette.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  historyDivider: {
    height: 1,
    backgroundColor: JourneyPalette.cardSoft,
  },
  pressed: {
    opacity: 0.72,
  },
});
