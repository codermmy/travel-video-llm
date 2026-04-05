import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Snackbar } from 'react-native-paper';

import { ImportProgressModal, type ImportProgress } from '@/components/import/ImportProgressModal';
import { PhotoLibraryPickerModal } from '@/components/photo/PhotoLibraryPickerModal';
import { UploadProgress } from '@/components/upload/UploadProgress';
import {
  clearImportCache,
  getImportCacheSummary,
  importSelectedLibraryAssets,
  type ImportResult,
  type ImportCacheSummary,
} from '@/services/album/photoImportService';
import { loadImportTasks, subscribeImportTasks } from '@/services/import/importTaskService';
import { userApi, type UserProfile } from '@/services/api/userApi';
import { JourneyPalette } from '@/styles/colors';
import { openAppSettings } from '@/utils/permissionUtils';

type LocalDataSummary = ImportCacheSummary;

function buildImportSummaryText(result: ImportResult, queued: boolean): string {
  const parts = [`已读取 ${result.selected} 张`, `新增 ${result.dedupedNew} 张`];

  if (result.dedupedExisting > 0) {
    parts.push(`去重 ${result.dedupedExisting} 张`);
  }
  if (result.failed > 0) {
    parts.push(`失败 ${result.failed} 张`);
  }
  if (result.queuedVision > 0) {
    parts.push(`后台分析 ${result.queuedVision} 张`);
  }

  return queued ? `${parts.join('，')}，正在生成回忆...` : parts.join('，');
}

type GroupHeaderProps = {
  title: string;
};

function GroupHeader({ title }: GroupHeaderProps) {
  return (
    <View style={styles.groupHeader}>
      <Text style={styles.groupTitle}>{title}</Text>
    </View>
  );
}

type ListRowProps = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
  destructive?: boolean;
  emphasizeValue?: boolean;
  loading?: boolean;
};

function ListRow({
  icon,
  title,
  subtitle,
  value,
  onPress,
  destructive = false,
  emphasizeValue = false,
  loading = false,
}: ListRowProps) {
  const tint = destructive ? JourneyPalette.danger : JourneyPalette.accent;
  const iconBackground = destructive ? JourneyPalette.dangerSoft : JourneyPalette.accentSoft;

  return (
    <Pressable
      disabled={!onPress || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.listRow,
        !onPress && styles.listRowStatic,
        pressed && onPress ? styles.rowPressed : null,
      ]}
    >
      <View style={[styles.rowIconWrap, { backgroundColor: iconBackground }]}>
        <MaterialCommunityIcons name={icon} size={18} color={tint} />
      </View>

      <View style={styles.rowCopy}>
        <Text style={[styles.rowTitle, destructive && styles.rowTitleDanger]}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>

      <View style={styles.rowTrailing}>
        {loading ? (
          <ActivityIndicator size="small" color={destructive ? JourneyPalette.danger : tint} />
        ) : value ? (
          <Text style={[styles.rowValue, emphasizeValue && styles.rowValueEmphasized]}>
            {value}
          </Text>
        ) : null}
        {onPress ? (
          <MaterialCommunityIcons name="chevron-right" size={18} color={JourneyPalette.muted} />
        ) : null}
      </View>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [localData, setLocalData] = useState<LocalDataSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runningTaskCount, setRunningTaskCount] = useState(0);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerSubmitting, setPickerSubmitting] = useState(false);
  const [importVisible, setImportVisible] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress>({ stage: 'idle' });
  const [taskProgressVisible, setTaskProgressVisible] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState('');

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const [profile, importSummary] = await Promise.all([
        userApi.getCurrentUser(),
        getImportCacheSummary(),
      ]);

      setUser(profile);
      setLocalData(importSummary);
      setError(null);
    } catch (loadError) {
      console.warn('load settings failed', loadError);
      setError(loadError instanceof Error ? loadError.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadSettings();
    }, [loadSettings]),
  );

  useEffect(() => {
    const unsubscribe = subscribeImportTasks((state) => {
      setRunningTaskCount(state.runningCount);
    });
    void loadImportTasks();
    return unsubscribe;
  }, []);

  const avatarLetter = useMemo(() => {
    const source = user?.nickname?.trim() || 'D';
    return source.slice(0, 1).toUpperCase();
  }, [user?.nickname]);

  const metricItems = useMemo(
    () => [
      {
        label: '导入记录',
        value: `${localData?.assetCount ?? 0} 条`,
      },
      {
        label: '后台任务',
        value: `${runningTaskCount} 个`,
      },
      {
        label: '隐私保护',
        value: '默认开启',
      },
    ],
    [localData?.assetCount, runningTaskCount],
  );

  const handleClearLocalCache = useCallback(() => {
    Alert.alert('清理导入记录', '会清理本机导入记录，不会删除已生成的事件与故事。', [
      { text: '取消', style: 'cancel' },
      {
        text: '立即清理',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              setCleaning(true);
              const removedImportAssets = await clearImportCache();
              await loadSettings();
              Alert.alert('清理完成', `已移除 ${removedImportAssets} 条导入记录。`);
            } catch (clearError) {
              Alert.alert(
                '清理失败',
                clearError instanceof Error ? clearError.message : '请稍后重试',
              );
            } finally {
              setCleaning(false);
            }
          })();
        },
      },
    ]);
  }, [loadSettings]);

  const openProfileEditor = useCallback(() => {
    router.push('/profile/edit');
  }, [router]);

  const executeLibraryImport = useCallback(
    async (assets: import('expo-media-library').Asset[]) => {
      setImportVisible(true);
      setImportProgress({
        stage: 'scanning',
        detail: '正在准备导入照片...',
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
          setSnackbar(buildImportSummaryText(result, true));
        } else {
          setSnackbar(buildImportSummaryText(result, false));
          await loadSettings();
        }
      } catch (importError) {
        const message = String(importError);
        if (message.includes('permission_denied')) {
          Alert.alert('需要相册权限', '请先在系统设置中开启相册权限。', [
            { text: '取消', style: 'cancel' },
            { text: '打开设置', onPress: openAppSettings },
          ]);
        } else {
          setSnackbar('导入失败，请稍后重试');
        }
      } finally {
        setImportVisible(false);
        setImportProgress({ stage: 'idle' });
        setPickerSubmitting(false);
        setPickerVisible(false);
        await loadSettings();
      }
    },
    [loadSettings],
  );

  const canShowImportProgress = useMemo(
    () => importVisible && importProgress.stage !== 'idle',
    [importProgress.stage, importVisible],
  );

  if (loading) {
    return (
      <View style={styles.centerState}>
        <LinearGradient colors={['#EEF4FF', '#F8FBFF']} style={styles.loadingOrb}>
          <MaterialCommunityIcons
            name="account-circle-outline"
            size={28}
            color={JourneyPalette.accent}
          />
        </LinearGradient>
        <ActivityIndicator size="large" color={JourneyPalette.accent} />
      </View>
    );
  }

  if (!user || !localData || error) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.errorText}>{error || '未加载到设置信息'}</Text>
        <Pressable style={styles.retryButton} onPress={() => void loadSettings()}>
          <Text style={styles.retryButtonText}>重试</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>我的</Text>
      </View>

      <View style={styles.identityCard}>
        <Pressable
          onPress={openProfileEditor}
          style={({ pressed }) => [styles.identityRow, pressed && styles.rowPressed]}
        >
          {user.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
          ) : (
            <LinearGradient
              colors={[JourneyPalette.ink, '#475569']}
              style={styles.avatarFallback}
            >
              <Text style={styles.avatarFallbackText}>{avatarLetter}</Text>
            </LinearGradient>
          )}

          <View style={styles.identityCopy}>
            <Text style={styles.identityTitle}>{user.nickname?.trim() || '这台设备'}</Text>
            <View style={{ flexDirection: 'row' }}>
              <View style={styles.deviceBadge}>
                <Text style={styles.deviceBadgeText}>本机设备 · 已加密</Text>
              </View>
            </View>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color={JourneyPalette.muted} />
        </Pressable>

        <View style={styles.metricRow}>
          {metricItems.map((item) => (
            <View key={item.label} style={styles.metricPill}>
              <Text numberOfLines={1} style={styles.metricValue}>
                {item.value}
              </Text>
              <Text style={styles.metricLabel}>{item.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <GroupHeader title="回忆中心" />
        <View style={styles.groupCard}>
          <ListRow
            icon="timeline-clock-outline"
            title="整理任务"
            subtitle="查看正在进行的 AI 分析与生成"
            value={runningTaskCount > 0 ? `${runningTaskCount} 个正在整理` : undefined}
            emphasizeValue
            onPress={() => router.push('/profile/import-tasks')}
          />
          <View style={styles.groupDivider} />
          <ListRow
            icon="image-plus"
            title="补导照片"
            subtitle="手动添加漏掉的精彩瞬间"
            onPress={() => setPickerVisible(true)}
          />
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <GroupHeader title="隐私与安全" />
        <View style={styles.groupCard}>
          <ListRow 
            icon="shield-check-outline" 
            title="端侧隐私保护" 
            subtitle="照片特征仅保留在本地设备"
            value="已开启" 
          />
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <GroupHeader title="实验性功能" />
        <View style={styles.groupCard}>
          <ListRow
            icon="delete-sweep-outline"
            title="清空导入缓存"
            subtitle="不影响已生成的事件和故事"
            destructive
            loading={cleaning}
            onPress={handleClearLocalCache}
          />
        </View>
      </View>

      <ImportProgressModal
        visible={canShowImportProgress}
        progress={importProgress}
        allowClose={false}
      />
      <PhotoLibraryPickerModal
        visible={pickerVisible}
        title="导入照片"
        hint="从系统相册选择照片"
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
          void loadSettings();
        }}
      />
      <Snackbar visible={Boolean(snackbar)} onDismiss={() => setSnackbar('')} duration={2500}>
        {snackbar}
      </Snackbar>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 120,
    gap: 32,
  },
  pageHeader: {
    paddingHorizontal: 0,
    marginBottom: 8,
  },
  pageTitle: {
    fontSize: 34,
    fontWeight: '900',
    color: JourneyPalette.ink,
    letterSpacing: -1.2,
  },
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 32,
  },
  loadingOrb: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    backgroundColor: JourneyPalette.cardSoft,
  },
  errorText: {
    color: JourneyPalette.danger,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    borderRadius: 999,
    backgroundColor: JourneyPalette.ink,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  identityCard: {
    gap: 32,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: JourneyPalette.surfaceVariant,
  },
  avatarFallback: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '900',
  },
  identityCopy: {
    flex: 1,
    gap: 4,
  },
  identityTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: JourneyPalette.ink,
    letterSpacing: -0.5,
  },
  identityTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  deviceBadge: {
    backgroundColor: JourneyPalette.surfaceVariant,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  deviceBadgeText: {
    color: JourneyPalette.muted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  metricRow: {
    flexDirection: 'row',
    gap: 12,
  },
  metricPill: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 24,
    backgroundColor: JourneyPalette.surfaceVariant,
    alignItems: 'center',
    gap: 4,
  },
  metricValue: {
    color: JourneyPalette.ink,
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  metricLabel: {
    color: JourneyPalette.muted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionBlock: {
    gap: 16,
  },
  groupHeader: {
    paddingHorizontal: 0,
  },
  groupTitle: {
    color: JourneyPalette.muted,
    fontSize: 13,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  groupCard: {
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  groupDivider: {
    marginLeft: 60,
    height: 1,
    backgroundColor: JourneyPalette.line,
  },
  listRow: {
    minHeight: 68,
    paddingHorizontal: 4,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  listRowStatic: {
    opacity: 1,
  },
  rowPressed: {
    opacity: 0.7,
  },
  rowIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.surfaceVariant,
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: JourneyPalette.ink,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  rowTitleDanger: {
    color: JourneyPalette.danger,
  },
  rowSubtitle: {
    color: JourneyPalette.muted,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
  rowTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowValue: {
    color: JourneyPalette.muted,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  rowValueEmphasized: {
    color: JourneyPalette.accent,
    fontSize: 14,
    fontWeight: '800',
  },
});
