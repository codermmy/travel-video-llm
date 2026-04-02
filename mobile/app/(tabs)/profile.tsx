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
import { eventApi } from '@/services/api/eventApi';
import { userApi, type UserProfile } from '@/services/api/userApi';
import { JourneyPalette } from '@/styles/colors';
import { formatFileSize } from '@/utils/imageUtils';

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

type LocalDataSummary = ImportCacheSummary;

export default function ProfileScreen() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [localData, setLocalData] = useState<LocalDataSummary | null>(null);
  const [enhancementData, setEnhancementData] = useState<{
    eventCount: number;
    assetCount: number;
    totalBytes: number;
    nextExpiresAt?: string | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      setLoading(true);
      const [profile, importSummary, enhancementSummary] = await Promise.all([
        userApi.getCurrentUser(),
        getImportCacheSummary(),
        eventApi.getEnhancementStorageSummary(),
      ]);

      setUser(profile);
      setLocalData(importSummary);
      setEnhancementData(enhancementSummary);
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

  const handleEnhancedUploadInfo = useCallback(() => {
    Alert.alert(
      '增强上传说明',
      '默认链路不会上传旅行照片。后续只有在你显式触发云端增强时，才会上传少量代表图，并提供单独的清理入口。',
    );
  }, []);

  const handleClearEnhancementAssets = useCallback(() => {
    Alert.alert(
      '清理增强素材',
      '会删除当前设备已上传的代表图缓存，并失去 7 天内直接重试增强的能力。已生成的故事不会被删除。',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '立即清理',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              try {
                setCleaning(true);
                await eventApi.clearEnhancementStorage();
                await loadSettings();
                Alert.alert('清理完成', '增强素材已清空。');
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
      ],
    );
  }, [loadSettings]);

  if (loading) {
    return (
      <View style={styles.centerState}>
        <LinearGradient colors={['#F8F1E7', '#ECF0E8']} style={styles.loadingOrb}>
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

  if (!user || !localData || !enhancementData || error) {
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
      <LinearGradient colors={['#FFF6EC', '#EEE6D8']} style={styles.heroCard}>
        <Text style={styles.eyebrow}>LOCAL & PRIVATE</Text>
        <View style={styles.heroTopRow}>
          {user.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
          ) : (
            <LinearGradient colors={['#255D58', '#5B7E78']} style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>{avatarLetter}</Text>
            </LinearGradient>
          )}

          <View style={styles.heroTextWrap}>
            <Text style={styles.heroTitle}>{user.nickname || '这台设备'}</Text>
            <Text style={styles.heroSubtitle}>
              当前应用按单设备、默认不上图的方式运行，设置页更像一张本机数据与隐私面板。
            </Text>
          </View>
        </View>

        <View style={styles.metaGrid}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>本机标识</Text>
            <Text style={styles.metaValue}>{maskValue(user.device_id || user.id)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>注册时间</Text>
            <Text style={styles.metaValue}>{formatDate(user.created_at)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>使用方式</Text>
            <Text style={styles.metaValue}>单设备闭环</Text>
          </View>
        </View>
      </LinearGradient>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{localData.assetCount}</Text>
          <Text style={styles.statLabel}>导入记录</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{enhancementData.assetCount}</Text>
          <Text style={styles.statLabel}>增强素材</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>默认关闭</Text>
          <Text style={styles.statLabel}>云端上图</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>产品原则</Text>
          <Text style={styles.sectionHint}>当前口径</Text>
        </View>

        <View style={styles.infoRow}>
          <View style={[styles.infoIconWrap, { backgroundColor: JourneyPalette.accentSoft }]}>
            <MaterialCommunityIcons name="cellphone-lock" size={18} color={JourneyPalette.accent} />
          </View>
          <View style={styles.infoBody}>
            <Text style={styles.infoTitle}>本机身份</Text>
            <Text style={styles.infoText}>
              首次打开会自动初始化设备身份，不再要求登录、注册或退出账号。
            </Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <View style={[styles.infoIconWrap, { backgroundColor: '#EEE7DB' }]}>
            <MaterialCommunityIcons name="cloud-off-outline" size={18} color={JourneyPalette.ink} />
          </View>
          <View style={styles.infoBody}>
            <Text style={styles.infoTitle}>默认不上图</Text>
            <Text style={styles.infoText}>
              默认故事生成只基于时间、地点和端侧结构化信息，不上传原图或公开 URL。
            </Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <View style={[styles.infoIconWrap, { backgroundColor: JourneyPalette.accentWarmSoft }]}>
            <MaterialCommunityIcons
              name="shield-check-outline"
              size={18}
              color={JourneyPalette.accentWarm}
            />
          </View>
          <View style={styles.infoBody}>
            <Text style={styles.infoTitle}>增强是显式行为</Text>
            <Text style={styles.infoText}>
              只有你主动触发云端增强时，才会上传少量代表图，并单独管理其保留与清理。
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>本地数据</Text>
          <Text style={styles.sectionHint}>导入与缓存</Text>
        </View>

        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>最近导入</Text>
          <Text style={styles.dataValue}>{formatDate(localData.lastRunAt)}</Text>
        </View>
        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>最近尝试</Text>
          <Text style={styles.dataValue}>{formatDate(localData.lastAttemptAt)}</Text>
        </View>
        <View style={styles.dataRow}>
          <Text style={styles.dataLabel}>入口方式</Text>
          <Text style={styles.dataValue}>
            {localData.lastMode === 'manual' ? '手动补导入' : '最近 200 张'}
          </Text>
        </View>

        <Pressable
          style={[styles.primaryButton, cleaning && styles.buttonDisabled]}
          onPress={handleClearLocalCache}
          disabled={cleaning}
        >
          {cleaning ? (
            <ActivityIndicator color="#FFF9F2" size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>清理导入记录</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>增强与管理</Text>
          <Text style={styles.sectionHint}>代表图缓存</Text>
        </View>

        <Pressable style={styles.menuItem} onPress={handleEnhancedUploadInfo}>
          <MaterialCommunityIcons
            name="cloud-upload-outline"
            size={20}
            color={JourneyPalette.accent}
          />
          <View style={styles.menuTextWrap}>
            <Text style={styles.menuText}>增强上传说明</Text>
            <Text style={styles.menuSubtext}>默认不上图，只有显式触发时才上传代表图。</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={JourneyPalette.muted} />
        </Pressable>

        <View style={styles.storageCard}>
          <View style={styles.storageHeader}>
            <View style={styles.menuTextWrap}>
              <Text style={styles.menuText}>增强素材保留</Text>
              <Text style={styles.menuSubtext}>
                当前保留 {enhancementData.assetCount} 张代表图，覆盖 {enhancementData.eventCount}{' '}
                个事件。
              </Text>
            </View>
            <MaterialCommunityIcons
              name="cloud-clock-outline"
              size={18}
              color={JourneyPalette.accent}
            />
          </View>

          <View style={styles.dataRow}>
            <Text style={styles.dataLabel}>素材体积</Text>
            <Text style={styles.dataValue}>{formatFileSize(enhancementData.totalBytes)}</Text>
          </View>
          <View style={styles.dataRow}>
            <Text style={styles.dataLabel}>最近到期</Text>
            <Text style={styles.dataValue}>{formatDate(enhancementData.nextExpiresAt)}</Text>
          </View>

          <Pressable
            style={[styles.secondaryButton, cleaning && styles.buttonDisabled]}
            onPress={handleClearEnhancementAssets}
            disabled={cleaning || enhancementData.assetCount === 0}
          >
            <Text style={styles.secondaryButtonText}>清理增强素材</Text>
          </Pressable>
        </View>

        <Pressable style={styles.menuItem} onPress={() => router.push('/profile/edit')}>
          <MaterialCommunityIcons
            name="account-edit-outline"
            size={20}
            color={JourneyPalette.accent}
          />
          <View style={styles.menuTextWrap}>
            <Text style={styles.menuText}>编辑本机资料</Text>
            <Text style={styles.menuSubtext}>可调整昵称等轻量本机展示信息。</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color={JourneyPalette.muted} />
        </Pressable>
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
    padding: 16,
    paddingBottom: 112,
    gap: 14,
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
  heroCard: {
    borderRadius: 30,
    padding: 20,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: JourneyPalette.muted,
  },
  heroTopRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  avatarImage: {
    width: 76,
    height: 76,
    borderRadius: 38,
  },
  avatarFallback: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: '#FFF9F2',
    fontSize: 28,
    fontWeight: '800',
  },
  heroTextWrap: {
    flex: 1,
    gap: 6,
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
  metaGrid: {
    marginTop: 18,
    gap: 10,
  },
  metaItem: {
    borderRadius: 20,
    backgroundColor: 'rgba(255,252,247,0.76)',
    padding: 14,
    gap: 6,
  },
  metaLabel: {
    fontSize: 11,
    color: JourneyPalette.muted,
  },
  metaValue: {
    fontSize: 14,
    fontWeight: '700',
    color: JourneyPalette.ink,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    borderRadius: 22,
    backgroundColor: JourneyPalette.card,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 10,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: JourneyPalette.ink,
    textAlign: 'center',
  },
  statLabel: {
    marginTop: 4,
    color: JourneyPalette.muted,
    fontSize: 11,
    textAlign: 'center',
  },
  card: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: JourneyPalette.line,
    backgroundColor: JourneyPalette.card,
    padding: 18,
    gap: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  sectionHint: {
    fontSize: 12,
    color: JourneyPalette.muted,
  },
  infoRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  infoIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBody: {
    flex: 1,
    gap: 4,
  },
  infoTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  infoText: {
    color: JourneyPalette.inkSoft,
    lineHeight: 20,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  dataLabel: {
    color: JourneyPalette.muted,
    fontSize: 13,
  },
  dataValue: {
    color: JourneyPalette.ink,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right',
    flex: 1,
  },
  primaryButton: {
    marginTop: 6,
    borderRadius: 999,
    backgroundColor: JourneyPalette.accent,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFF9F2',
    fontWeight: '800',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  menuTextWrap: {
    flex: 1,
    gap: 4,
  },
  menuText: {
    fontSize: 15,
    fontWeight: '800',
    color: JourneyPalette.ink,
  },
  menuSubtext: {
    color: JourneyPalette.inkSoft,
    lineHeight: 19,
  },
  storageCard: {
    borderRadius: 20,
    backgroundColor: JourneyPalette.cardAlt,
    padding: 14,
    gap: 10,
  },
  storageHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  secondaryButton: {
    marginTop: 6,
    borderRadius: 999,
    backgroundColor: '#EDE5D8',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: JourneyPalette.ink,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
