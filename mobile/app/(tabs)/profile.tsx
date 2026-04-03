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

import {
  clearImportCache,
  getImportCacheSummary,
  type ImportCacheSummary,
} from '@/services/album/photoImportService';
import { loadImportTasks, subscribeImportTasks } from '@/services/import/importTaskService';
import { userApi, type UserProfile } from '@/services/api/userApi';
import { JourneyPalette } from '@/styles/colors';

function buildImportSummary(localData: ImportCacheSummary): string {
  if (localData.assetCount <= 0) {
    return '还没有导入历史';
  }
  return `已记录 ${localData.assetCount} 条导入历史`;
}

type LocalDataSummary = ImportCacheSummary;

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
        <Text style={styles.pageSubtitle}>本机回忆、后台任务与隐私设置都从这里进入</Text>
      </View>

      <View style={styles.identityCard}>
        <View style={styles.identityRow}>
          {user.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
          ) : (
            <LinearGradient
              colors={[JourneyPalette.heroTop, JourneyPalette.heroBottom]}
              style={styles.avatarFallback}
            >
              <Text style={styles.avatarFallbackText}>{avatarLetter}</Text>
            </LinearGradient>
          )}

          <View style={styles.identityCopy}>
            <Text style={styles.identityTitle}>这台设备的回忆</Text>
            <Text style={styles.identitySubtitle}>
              {user.nickname?.trim()
                ? `${user.nickname} · 昵称、隐私承诺和后台任务入口都集中在这里。`
                : '昵称、隐私承诺和后台任务入口都集中在这里。'}
            </Text>
          </View>
          <View style={styles.deviceBadge}>
            <Text style={styles.deviceBadgeText}>本机</Text>
          </View>
        </View>

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
        <GroupHeader title="任务与导入" />
        <View style={styles.groupCard}>
          <ListRow
            icon="timeline-clock-outline"
            title="导入任务"
            subtitle={
              runningTaskCount > 0
                ? `${runningTaskCount} 个后台任务仍在运行，可在这里回看阶段与结果。`
                : buildImportSummary(localData)
            }
            value={runningTaskCount > 0 ? `${runningTaskCount} 任务` : '查看'}
            emphasizeValue
            onPress={() => router.push('/profile/import-tasks')}
          />
          <View style={styles.groupDivider} />
          <ListRow
            icon="image-plus"
            title="继续导入"
            subtitle="手动补导入保留为次级入口，不再抢主路径"
            value="入口"
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
          />
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <GroupHeader title="设备与隐私" />
        <View style={styles.groupCard}>
          <ListRow
            icon="shield-lock-outline"
            title="隐私承诺"
            subtitle="默认不上图，只同步 metadata 与端侧结构化结果"
            value="默认"
          />
          <View style={styles.groupDivider} />
          <ListRow
            icon="account-edit-outline"
            title="本机资料"
            subtitle="昵称等轻量展示信息都在这里维护"
            onPress={() => router.push('/profile/edit')}
          />
          <View style={styles.groupDivider} />
          <ListRow
            icon="account-circle-outline"
            title="头像来源"
            subtitle="相册、拍照和权限恢复都从同一条轻量流程进入"
            value="更新"
            onPress={() => router.push('/profile/avatar')}
          />
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <GroupHeader title="数据管理" />
        <View style={styles.groupCard}>
          <ListRow
            icon="trash-can-outline"
            title="清理导入记录"
            subtitle="危险操作单独分组，仅清理本机导入记录，不删除事件与故事"
            destructive
            loading={cleaning}
            onPress={handleClearLocalCache}
          />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: JourneyPalette.cardAlt,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 112,
    gap: 24,
  },
  pageHeader: {
    gap: 6,
    paddingHorizontal: 4,
  },
  pageTitle: {
    fontSize: 31,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  pageSubtitle: {
    color: JourneyPalette.inkSoft,
    fontSize: 13,
    lineHeight: 18,
  },
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: JourneyPalette.cardAlt,
    padding: 16,
  },
  loadingOrb: {
    width: 76,
    height: 76,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    backgroundColor: JourneyPalette.accentSoft,
  },
  errorText: {
    color: JourneyPalette.danger,
    marginBottom: 10,
  },
  retryButton: {
    borderRadius: 999,
    backgroundColor: JourneyPalette.accent,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  retryButtonText: {
    color: '#FFF9F2',
    fontWeight: '700',
  },
  identityCard: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: 'rgba(255,255,255,0.84)',
    paddingHorizontal: 20,
    paddingVertical: 18,
    gap: 18,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  avatarImage: {
    width: 70,
    height: 70,
    borderRadius: 35,
  },
  avatarFallback: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: '#FFF9F2',
    fontSize: 28,
    fontWeight: '800',
  },
  identityCopy: {
    flex: 1,
    gap: 5,
  },
  identityTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  identitySubtitle: {
    color: JourneyPalette.inkSoft,
    fontSize: 14,
    lineHeight: 20,
  },
  deviceBadge: {
    minHeight: 30,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: JourneyPalette.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceBadgeText: {
    color: JourneyPalette.accent,
    fontSize: 12,
    fontWeight: '800',
  },
  metricRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metricPill: {
    flex: 1,
    minHeight: 82,
    borderRadius: 20,
    backgroundColor: JourneyPalette.card,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'space-between',
  },
  metricValue: {
    color: JourneyPalette.ink,
    fontSize: 16,
    fontWeight: '800',
  },
  metricLabel: {
    color: JourneyPalette.inkSoft,
    fontSize: 12,
    lineHeight: 16,
  },
  sectionBlock: {
    gap: 12,
  },
  groupHeader: {
    paddingHorizontal: 4,
  },
  groupTitle: {
    color: JourneyPalette.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  groupCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: 'rgba(255,255,255,0.94)',
    overflow: 'hidden',
  },
  groupDivider: {
    marginLeft: 68,
    height: 1,
    backgroundColor: JourneyPalette.line,
  },
  listRow: {
    minHeight: 60,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  listRowStatic: {
    opacity: 1,
  },
  rowPressed: {
    backgroundColor: 'rgba(228, 236, 255, 0.5)',
  },
  rowIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowCopy: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    color: JourneyPalette.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  rowTitleDanger: {
    color: JourneyPalette.danger,
  },
  rowSubtitle: {
    color: JourneyPalette.inkSoft,
    fontSize: 13,
    lineHeight: 18,
  },
  rowTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
  },
  rowValue: {
    color: JourneyPalette.inkSoft,
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  rowValueEmphasized: {
    color: JourneyPalette.ink,
    fontSize: 14,
    fontWeight: '700',
  },
});
