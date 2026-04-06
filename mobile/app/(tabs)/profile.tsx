import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
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

import { PageHeader } from '@/components/ui/revamp';
import { eventApi } from '@/services/api/eventApi';
import {
  clearImportCache,
  getImportCacheSummary,
  type ImportCacheSummary,
} from '@/services/album/photoImportService';
import { loadImportTasks, subscribeImportTasks } from '@/services/import/importTaskService';
import { userApi, type UserProfile } from '@/services/api/userApi';
import { JourneyPalette } from '@/styles/colors';
import { consumePendingProfileImportMessage } from '@/utils/photoRouteResults';

type LocalDataSummary = ImportCacheSummary;

type GroupHeaderProps = {
  title: string;
};

function GroupHeader({ title }: GroupHeaderProps) {
  return (
    <View>
      <Text style={styles.groupTitle}>{title}</Text>
    </View>
  );
}

type IconActionButtonProps = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
  accessibilityLabel: string;
  loading?: boolean;
  tint?: string;
};

function IconActionButton({
  icon,
  onPress,
  accessibilityLabel,
  loading = false,
  tint = JourneyPalette.ink,
}: IconActionButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={loading}
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      style={({ pressed }) => [styles.iconActionButton, pressed && styles.rowPressed]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={tint} />
      ) : (
        <MaterialCommunityIcons name={icon} size={18} color={tint} />
      )}
    </Pressable>
  );
}

type ListRowProps = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  iconTint?: string;
  iconBackgroundColor?: string;
  rightSlot?: ReactNode;
  showChevron?: boolean;
};

function ListRow({
  icon,
  title,
  subtitle,
  onPress,
  iconTint = JourneyPalette.ink,
  iconBackgroundColor = JourneyPalette.surfaceVariant,
  rightSlot,
  showChevron = Boolean(onPress),
}: ListRowProps) {
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.listRow,
        !onPress && styles.listRowStatic,
        pressed && onPress ? styles.rowPressed : null,
      ]}
    >
      <View style={[styles.rowIconWrap, { backgroundColor: iconBackgroundColor }]}>
        <MaterialCommunityIcons name={icon} size={20} color={iconTint} />
      </View>

      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>

      {rightSlot || showChevron ? (
        <View style={styles.rowTrailing}>
          {rightSlot}
          {showChevron ? (
            <MaterialCommunityIcons
              name="chevron-right"
              size={20}
              color={JourneyPalette.cardMuted}
            />
          ) : null}
        </View>
      ) : null}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [localData, setLocalData] = useState<LocalDataSummary | null>(null);
  const [memoryCount, setMemoryCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [runningTaskCount, setRunningTaskCount] = useState(0);
  const [snackbar, setSnackbar] = useState('');

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const [profile, importSummary, events] = await Promise.all([
        userApi.getCurrentUser(),
        getImportCacheSummary(),
        eventApi.listAllEvents().catch((loadError) => {
          console.warn('load profile event summary failed', loadError);
          return [];
        }),
      ]);

      setUser(profile);
      setLocalData(importSummary);
      setMemoryCount(events.length);
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
      const pendingMessage = consumePendingProfileImportMessage();
      if (pendingMessage) {
        setSnackbar(pendingMessage);
      }
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
    const source = user?.nickname?.trim() || user?.device_id?.trim() || '这台设备';
    return source.slice(0, 1).toUpperCase();
  }, [user?.device_id, user?.nickname]);

  const identityName = useMemo(
    () => user?.nickname?.trim() || user?.device_id?.trim() || '这台设备',
    [user?.device_id, user?.nickname],
  );

  const statItems = useMemo(
    () => [
      {
        label: '回忆',
        value: String(memoryCount.toLocaleString('zh-CN')),
        onPress: () => router.push('/(tabs)'),
      },
      {
        label: '记录',
        value: String((localData?.assetCount ?? 0).toLocaleString('zh-CN')),
        onPress: () => router.push('/profile/import-tasks'),
      },
      {
        label: '任务',
        value: String(runningTaskCount.toLocaleString('zh-CN')),
        onPress: () => router.push('/profile/import-tasks'),
      },
    ],
    [localData?.assetCount, memoryCount, router, runningTaskCount],
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
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
      >
        <PageHeader title="我的" topInset style={styles.pageHeader} />

        <Pressable
          onPress={openProfileEditor}
          style={({ pressed }) => [styles.identityRow, pressed && styles.rowPressed]}
        >
          {user.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>{avatarLetter}</Text>
            </View>
          )}

          <View style={styles.identityCopy}>
            <Text numberOfLines={1} ellipsizeMode="tail" style={styles.identityTitle}>
              {identityName}
            </Text>
            <View style={styles.deviceBadge}>
              <Text style={styles.deviceBadgeText}>本机加密 · 安全</Text>
            </View>
          </View>

          <MaterialCommunityIcons name="chevron-right" size={24} color={JourneyPalette.cardMuted} />
        </Pressable>

        <View style={styles.statRow}>
          {statItems.map((item) => (
            <Pressable
              key={item.label}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              onPress={item.onPress}
              style={({ pressed }) => [styles.statCard, pressed && styles.rowPressed]}
            >
              <Text numberOfLines={1} style={styles.statValue}>
                {item.value}
              </Text>
              <Text style={styles.statLabel}>{item.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.sectionBlock}>
          <GroupHeader title="实验室" />
          <ListRow
            icon="timeline-clock-outline"
            iconTint={JourneyPalette.ink}
            iconBackgroundColor={JourneyPalette.surfaceVariant}
            title="整理任务"
            subtitle="管理 AI 故事生成"
            onPress={() => router.push('/profile/import-tasks')}
          />
          <ListRow
            icon="image-plus"
            iconTint={JourneyPalette.ink}
            iconBackgroundColor={JourneyPalette.surfaceVariant}
            title="添加照片"
            onPress={() => router.push('/profile/import')}
          />
        </View>

        <View style={[styles.sectionBlock, styles.sectionBlockSpaced]}>
          <GroupHeader title="通用" />
          <ListRow
            icon="shield-check-outline"
            iconTint={JourneyPalette.success}
            iconBackgroundColor={JourneyPalette.surfaceVariant}
            title="隐私保护"
            subtitle="照片仅在本机分析"
            showChevron={false}
            rightSlot={
              <IconActionButton
                icon="delete-sweep-outline"
                accessibilityLabel="清空导入缓存"
                loading={cleaning}
                onPress={handleClearLocalCache}
                tint={JourneyPalette.danger}
              />
            }
          />
        </View>
      </ScrollView>

      <Snackbar visible={Boolean(snackbar)} onDismiss={() => setSnackbar('')} duration={2500}>
        {snackbar}
      </Snackbar>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 0,
    paddingBottom: 100,
  },
  pageHeader: {
    marginBottom: 32,
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
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    marginBottom: 40,
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: JourneyPalette.surfaceVariant,
  },
  avatarFallback: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.ink,
  },
  avatarFallbackText: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '900',
  },
  identityCopy: {
    flex: 1,
  },
  identityTitle: {
    fontSize: 26,
    fontWeight: '900',
    color: JourneyPalette.ink,
    letterSpacing: -0.5,
  },
  deviceBadge: {
    backgroundColor: JourneyPalette.surfaceVariant,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  deviceBadgeText: {
    color: JourneyPalette.muted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  statRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 40,
  },
  statCard: {
    flex: 1,
    paddingVertical: 20,
    paddingHorizontal: 12,
    borderRadius: 24,
    backgroundColor: JourneyPalette.surfaceVariant,
    alignItems: 'center',
  },
  statValue: {
    color: JourneyPalette.ink,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.3,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    color: JourneyPalette.muted,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 4,
  },
  sectionBlock: {
    gap: 16,
  },
  groupTitle: {
    color: JourneyPalette.muted,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 2,
  },
  sectionBlockSpaced: {
    marginTop: 40,
  },
  listRow: {
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  listRowStatic: {
    opacity: 1,
  },
  rowPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.97 }],
  },
  rowIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.surfaceVariant,
  },
  rowCopy: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    color: JourneyPalette.ink,
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  rowSubtitle: {
    color: JourneyPalette.muted,
    fontSize: 13,
    fontWeight: '500',
  },
  rowTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconActionButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: JourneyPalette.surfaceVariant,
  },
});
