import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ProgressBar } from 'react-native-paper';

import {
  getImportTaskSourceLabel,
  loadImportTasks,
  subscribeImportTasks,
} from '@/services/import/importTaskService';
import { JourneyPalette } from '@/styles/colors';
import type { ImportTaskPhase, ImportTaskRecord, ImportTaskState } from '@/types/importTask';

const PHASE_ORDER = ['prepare', 'analysis', 'sync', 'story'] as const;

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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <LinearGradient colors={['#FFF6EC', '#EEE6D8']} style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          <Pressable style={styles.backButton} onPress={() => router.back()}>
            <MaterialCommunityIcons name="arrow-left" size={18} color="#FFF9F2" />
          </Pressable>
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>IMPORT TASKS</Text>
            <Text style={styles.heroTitle}>导入任务</Text>
            <Text style={styles.heroSubtitle}>
              这里会记录每次导入的阶段进度。顶部任务条关闭后，仍然可以在这里回看。
            </Text>
          </View>
        </View>

        <View style={styles.heroStats}>
          <View style={styles.heroStatCard}>
            <Text style={styles.heroStatValue}>{taskState.runningCount}</Text>
            <Text style={styles.heroStatLabel}>进行中</Text>
          </View>
          <View style={styles.heroStatCard}>
            <Text style={styles.heroStatValue}>{taskState.tasks.length}</Text>
            <Text style={styles.heroStatLabel}>历史任务</Text>
          </View>
          <View style={styles.heroStatCard}>
            <Text style={styles.heroStatValue}>
              {latestTask ? getImportTaskSourceLabel(latestTask.source) : '暂无'}
            </Text>
            <Text style={styles.heroStatLabel}>最近来源</Text>
          </View>
        </View>
      </LinearGradient>

      {taskState.tasks.length === 0 ? (
        <View style={styles.emptyCard}>
          <MaterialCommunityIcons
            name="timeline-clock-outline"
            size={26}
            color={JourneyPalette.muted}
          />
          <Text style={styles.emptyTitle}>还没有导入任务</Text>
          <Text style={styles.emptyBody}>
            第一次导入照片后，这里会显示每一轮任务的分析与同步进度。
          </Text>
        </View>
      ) : (
        taskState.tasks.map((task) => (
          <View key={task.id} style={styles.taskCard}>
            <View style={styles.taskHeader}>
              <View style={styles.taskHeaderCopy}>
                <View style={styles.taskBadges}>
                  <View style={styles.taskSourceBadge}>
                    <Text style={styles.taskSourceBadgeText}>
                      {getImportTaskSourceLabel(task.source)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.taskStatusBadge,
                      { backgroundColor: `${getTaskStatusColor(task)}18` },
                    ]}
                  >
                    <Text style={[styles.taskStatusText, { color: getTaskStatusColor(task) }]}>
                      {getTaskStatusLabel(task)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.taskTime}>{formatDateTime(task.createdAt)}</Text>
              </View>
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
                          phase.status === 'completed' && styles.phaseIndexBadgeDone,
                          phase.status === 'failed' && styles.phaseIndexBadgeFailed,
                        ]}
                      >
                        <Text style={styles.phaseIndexBadgeText}>{index + 1}</Text>
                      </View>
                      <View style={styles.phaseCopy}>
                        <Text style={styles.phaseLabel}>{phase.label}</Text>
                        <Text style={styles.phaseMeta}>{getPhaseStatusText(phase)}</Text>
                      </View>
                    </View>
                    <ProgressBar progress={getPhaseProgress(phase)} style={styles.phaseProgress} />
                    <Text style={styles.phaseDetail}>{phase.detail || '等待开始'}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: JourneyPalette.cardAlt,
  },
  content: {
    padding: 16,
    paddingBottom: 110,
    gap: 14,
  },
  heroCard: {
    borderRadius: 28,
    padding: 18,
    gap: 18,
  },
  heroTopRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.accent,
  },
  heroCopy: {
    flex: 1,
    gap: 6,
  },
  eyebrow: {
    color: JourneyPalette.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  heroSubtitle: {
    color: JourneyPalette.inkSoft,
    lineHeight: 20,
  },
  heroStats: {
    flexDirection: 'row',
    gap: 10,
  },
  heroStatCard: {
    flex: 1,
    borderRadius: 18,
    backgroundColor: 'rgba(255,252,247,0.72)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 4,
  },
  heroStatValue: {
    color: JourneyPalette.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  heroStatLabel: {
    color: JourneyPalette.inkSoft,
    fontSize: 12,
  },
  emptyCard: {
    borderRadius: 24,
    backgroundColor: JourneyPalette.card,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    padding: 22,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    color: JourneyPalette.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  emptyBody: {
    color: JourneyPalette.inkSoft,
    textAlign: 'center',
    lineHeight: 20,
  },
  taskCard: {
    borderRadius: 24,
    backgroundColor: JourneyPalette.card,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    padding: 16,
    gap: 14,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  taskHeaderCopy: {
    flex: 1,
    gap: 8,
  },
  taskBadges: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  taskSourceBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: JourneyPalette.accentSoft,
  },
  taskSourceBadgeText: {
    color: JourneyPalette.accent,
    fontSize: 11,
    fontWeight: '800',
  },
  taskStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  taskStatusText: {
    fontSize: 11,
    fontWeight: '800',
  },
  taskTime: {
    color: JourneyPalette.muted,
    fontSize: 12,
  },
  countRow: {
    flexDirection: 'row',
    gap: 10,
  },
  countItem: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: JourneyPalette.cardAlt,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 4,
  },
  countValue: {
    color: JourneyPalette.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  countLabel: {
    color: JourneyPalette.inkSoft,
    fontSize: 11,
  },
  phaseList: {
    gap: 10,
  },
  phaseCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: '#FFFDF9',
    padding: 12,
    gap: 8,
  },
  phaseTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  phaseIndexBadge: {
    width: 24,
    height: 24,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.cardAlt,
  },
  phaseIndexBadgeActive: {
    backgroundColor: JourneyPalette.accent,
  },
  phaseIndexBadgeDone: {
    backgroundColor: JourneyPalette.success,
  },
  phaseIndexBadgeFailed: {
    backgroundColor: JourneyPalette.danger,
  },
  phaseIndexBadgeText: {
    color: '#FFF9F2',
    fontSize: 11,
    fontWeight: '800',
  },
  phaseCopy: {
    flex: 1,
    gap: 2,
  },
  phaseLabel: {
    color: JourneyPalette.ink,
    fontSize: 14,
    fontWeight: '800',
  },
  phaseMeta: {
    color: JourneyPalette.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  phaseProgress: {
    height: 7,
    borderRadius: 999,
    backgroundColor: JourneyPalette.cardAlt,
  },
  phaseDetail: {
    color: JourneyPalette.inkSoft,
    fontSize: 12,
    lineHeight: 18,
  },
});
