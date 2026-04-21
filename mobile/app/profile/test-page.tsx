import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import {
  ActionButton,
  HeaderIconButton,
  InlineBanner,
  MetricPill,
  PageHeader,
  SectionLabel,
  StatusPill,
  SurfaceCard,
  type StatusTone,
} from '@/components/ui/revamp';
import { JourneyPalette } from '@/styles/colors';

const STATUS_SEQUENCE: StatusTone[] = ['ready', 'analyzing', 'importing', 'failed'];

export default function TestPageScreen() {
  const router = useRouter();
  const [statusIndex, setStatusIndex] = useState(0);
  const [enabled, setEnabled] = useState(true);
  const [successCount, setSuccessCount] = useState(12);
  const [failedCount, setFailedCount] = useState(2);

  const activeTone = STATUS_SEQUENCE[statusIndex] ?? 'ready';
  const summaryText = useMemo(() => {
    if (activeTone === 'ready') {
      return '当前页面处于可用状态，适合验证基础样式和交互。';
    }
    if (activeTone === 'analyzing') {
      return '正在模拟后台分析，适合检查状态标签、按钮禁用和文案变化。';
    }
    if (activeTone === 'importing') {
      return '正在模拟导入过程，适合验证卡片与统计数字的视觉稳定性。';
    }
    return '已切换到失败态，适合验收告警信息、重试按钮和极端文案。';
  }, [activeTone]);

  const advanceStatus = () => {
    setStatusIndex((current) => (current + 1) % STATUS_SEQUENCE.length);
  };

  const resetState = () => {
    setStatusIndex(0);
    setEnabled(true);
    setSuccessCount(12);
    setFailedCount(2);
  };

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <PageHeader
        title="测试页面"
        subtitle="集中验证内部组件、状态切换和基础交互。"
        eyebrow="LAB"
        topInset
        rightSlot={
          <HeaderIconButton
            icon="close"
            onPress={() => router.back()}
            accessibilityLabel="关闭测试页面"
          />
        }
      />

      <InlineBanner
        icon="flask-outline"
        title="内部调试入口"
        body="这里不会影响正式流程，用来快速检查当前构建里的 UI 与交互是否正常。"
        tone="accent"
      />

      <SurfaceCard style={styles.heroCard}>
        <View style={styles.heroRow}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>当前模式</Text>
            <Text selectable style={styles.heroTitle}>
              {activeTone === 'failed' ? '失败回放' : '交互演示'}
            </Text>
            <Text selectable style={styles.heroBody}>
              {summaryText}
            </Text>
          </View>
          <StatusPill
            label={
              activeTone === 'ready'
                ? '就绪'
                : activeTone === 'analyzing'
                  ? '分析中'
                  : activeTone === 'importing'
                    ? '导入中'
                    : '失败'
            }
            tone={activeTone}
            icon={
              activeTone === 'ready'
                ? 'check-circle-outline'
                : activeTone === 'failed'
                  ? 'alert-circle-outline'
                  : 'progress-clock'
            }
          />
        </View>

        <View style={styles.metricRow}>
          <MetricPill value={String(successCount)} label="成功项目" tone="ready" />
          <MetricPill value={String(failedCount)} label="失败项目" tone="failed" />
          <MetricPill value={enabled ? 'ON' : 'OFF'} label="交互开关" tone="neutral" />
        </View>

        <View style={styles.actionGrid}>
          <ActionButton
            label="切换状态"
            onPress={advanceStatus}
            icon="shuffle-variant"
            fullWidth={false}
            style={styles.actionButton}
          />
          <ActionButton
            label="成功 +1"
            onPress={() => setSuccessCount((current) => current + 1)}
            tone="secondary"
            icon="plus"
            fullWidth={false}
            style={styles.actionButton}
          />
          <ActionButton
            label="失败 +1"
            onPress={() => setFailedCount((current) => current + 1)}
            tone="danger"
            icon="alert-outline"
            fullWidth={false}
            style={styles.actionButton}
          />
          <ActionButton
            label="重置"
            onPress={resetState}
            tone="secondary"
            icon="restore"
            fullWidth={false}
            style={styles.actionButton}
          />
        </View>
      </SurfaceCard>

      <SectionLabel title="状态样本" />
      <SurfaceCard style={styles.sectionCard}>
        <View style={styles.pillRow}>
          <StatusPill label="就绪" tone="ready" icon="check-circle-outline" />
          <StatusPill label="分析中" tone="analyzing" icon="brain" />
          <StatusPill label="导入中" tone="importing" icon="tray-arrow-down" />
          <StatusPill label="失败" tone="failed" icon="alert-circle-outline" />
        </View>
      </SurfaceCard>

      <SectionLabel title="基础交互" />
      <SurfaceCard style={styles.sectionCard}>
        <View style={styles.toggleRow}>
          <View style={styles.toggleCopy}>
            <Text selectable style={styles.toggleTitle}>
              启用交互
            </Text>
            <Text selectable style={styles.toggleBody}>
              关闭后保留页面内容，但可以检查静态禁用态是否符合预期。
            </Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={setEnabled}
            trackColor={{ false: JourneyPalette.cardMuted, true: JourneyPalette.accentSoft }}
            thumbColor={enabled ? JourneyPalette.accent : '#FFFFFF'}
          />
        </View>

        <Pressable
          disabled={!enabled}
          onPress={advanceStatus}
          style={({ pressed }) => [
            styles.demoPressable,
            !enabled && styles.demoPressableDisabled,
            pressed && enabled ? styles.demoPressablePressed : null,
          ]}
        >
          <View style={styles.demoPressableIcon}>
            <MaterialCommunityIcons
              name={enabled ? 'gesture-tap-button' : 'gesture-tap-hold'}
              size={18}
              color={JourneyPalette.white}
            />
          </View>
          <View style={styles.demoPressableCopy}>
            <Text selectable style={styles.demoPressableTitle}>
              触发一次页面状态切换
            </Text>
            <Text selectable style={styles.demoPressableBody}>
              当前点击会把测试页切到下一种状态，用于检查动态文案和卡片刷新。
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={18} color={JourneyPalette.muted} />
        </Pressable>
      </SurfaceCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: JourneyPalette.cardAlt,
  },
  content: {
    paddingHorizontal: 18,
    paddingBottom: 120,
    gap: 18,
  },
  heroCard: {
    gap: 18,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  heroCopy: {
    flex: 1,
    gap: 6,
  },
  heroEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: JourneyPalette.muted,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.6,
    color: JourneyPalette.ink,
  },
  heroBody: {
    fontSize: 14,
    lineHeight: 21,
    color: JourneyPalette.inkSoft,
  },
  metricRow: {
    flexDirection: 'row',
    gap: 12,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionButton: {
    minWidth: 132,
  },
  sectionCard: {
    gap: 16,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  toggleCopy: {
    flex: 1,
    gap: 4,
  },
  toggleTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  toggleBody: {
    fontSize: 13,
    lineHeight: 20,
    color: JourneyPalette.inkSoft,
  },
  demoPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.background,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  demoPressableDisabled: {
    opacity: 0.45,
  },
  demoPressablePressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.92,
  },
  demoPressableIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.accent,
  },
  demoPressableCopy: {
    flex: 1,
    gap: 2,
  },
  demoPressableTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  demoPressableBody: {
    fontSize: 13,
    lineHeight: 19,
    color: JourneyPalette.inkSoft,
  },
});
