import { useCallback, useMemo, useState } from 'react';
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
import { userApi, type UserProfile } from '@/services/api/userApi';
import { JourneyPalette } from '@/styles/colors';

function formatDate(value?: string | null): string {
  if (!value) {
    return '暂无';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '暂无';
  }
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
}

function maskValue(value?: string | null): string {
  if (!value) {
    return '-';
  }
  if (value.length <= 12) {
    return value;
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

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

  const avatarLetter = useMemo(() => {
    const source = user?.nickname?.trim() || 'D';
    return source.slice(0, 1).toUpperCase();
  }, [user?.nickname]);

  const metricItems = useMemo(
    () => [
      {
        label: '导入记录',
        value: localData ? String(localData.assetCount) : '0',
      },
      {
        label: '最近导入',
        value: localData?.lastRunAt ? formatDate(localData.lastRunAt) : '暂无',
      },
      {
        label: '隐私保护',
        value: '默认开启',
      },
    ],
    [localData],
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>我的</Text>
        <Text style={styles.pageSubtitle}>这台设备上的资料与导入记录</Text>
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
            <Text style={styles.identityTitle}>{user.nickname || '这台设备'}</Text>
            <Text style={styles.identitySubtitle}>这台设备上的旅行记忆</Text>
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
            subtitle={buildImportSummary(localData)}
            value="查看"
            emphasizeValue
            onPress={() => router.push('/profile/import-tasks')}
          />
          <View style={styles.groupDivider} />
          <ListRow
            icon="image-plus"
            title="继续导入"
            subtitle="手动补导入保留为次级入口，不再抢主路径"
            value="入口"
            onPress={() => router.push('/')}
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
            title="编辑本机资料"
            subtitle="可调整昵称等轻量展示信息"
            onPress={() => router.push('/profile/edit')}
          />
          <View style={styles.groupDivider} />
          <ListRow
            icon="cellphone-key"
            title="本机标识"
            value={maskValue(user.device_id || user.id)}
          />
          <View style={styles.groupDivider} />
          <ListRow icon="calendar-outline" title="注册时间" value={formatDate(user.created_at)} />
        </View>
      </View>

      <View style={styles.sectionBlock}>
        <GroupHeader title="本地清理" />
        <View style={styles.groupCard}>
          <ListRow
            icon="trash-can-outline"
            title="清理导入记录"
            subtitle="仅清理本机导入记录，不删除事件与故事"
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
    fontSize: 28,
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
