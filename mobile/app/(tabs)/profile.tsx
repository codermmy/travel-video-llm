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
import { MaterialCommunityIcons } from '@expo/vector-icons';

import {
  clearImportCache,
  getImportCacheSummary,
  type ImportCacheSummary,
} from '@/services/album/photoImportService';
import { eventApi } from '@/services/api/eventApi';
import { userApi, type UserProfile } from '@/services/api/userApi';
import { formatFileSize } from '@/utils/imageUtils';

function formatDate(value?: string | null): string {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return date.toLocaleDateString();
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
    } catch (e) {
      console.warn('load settings failed', e);
      setError(e instanceof Error ? e.message : '加载失败');
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
            } catch (e) {
              Alert.alert('清理失败', e instanceof Error ? e.message : '请稍后重试');
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
              } catch (e) {
                Alert.alert('清理失败', e instanceof Error ? e.message : '请稍后重试');
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
        <ActivityIndicator size="large" color="#3659A8" />
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
      <View style={styles.heroCard}>
        <View style={styles.heroTopRow}>
          {user.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>{avatarLetter}</Text>
            </View>
          )}

          <View style={styles.heroTextWrap}>
            <Text style={styles.heroEyebrow}>单设备模式</Text>
            <Text style={styles.heroTitle}>{user.nickname || '这台设备'}</Text>
            <Text style={styles.heroSubtitle}>默认不上图，旅行整理和缓存管理都以本机为主。</Text>
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
            <Text style={styles.metaValue}>本机使用</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>产品说明</Text>
          <Text style={styles.sectionHint}>对齐单设备总契约</Text>
        </View>

        <View style={styles.infoRow}>
          <View style={[styles.infoIconWrap, { backgroundColor: '#E9F4EE' }]}>
            <MaterialCommunityIcons name="cellphone-lock" size={18} color="#2D8A57" />
          </View>
          <View style={styles.infoBody}>
            <Text style={styles.infoTitle}>本机身份</Text>
            <Text style={styles.infoText}>
              首次打开会自动初始化设备身份，不再要求登录、注册或退出账号。
            </Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <View style={[styles.infoIconWrap, { backgroundColor: '#EEF3FF' }]}>
            <MaterialCommunityIcons name="cloud-off-outline" size={18} color="#355CB0" />
          </View>
          <View style={styles.infoBody}>
            <Text style={styles.infoTitle}>默认不上图</Text>
            <Text style={styles.infoText}>
              默认故事生成只基于时间、地点和端侧结构化信息，不上传原图或公开 URL。
            </Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <View style={[styles.infoIconWrap, { backgroundColor: '#FFF2E8' }]}>
            <MaterialCommunityIcons name="shield-check-outline" size={18} color="#C0692C" />
          </View>
          <View style={styles.infoBody}>
            <Text style={styles.infoTitle}>隐私与增强</Text>
            <Text style={styles.infoText}>
              只有你主动触发云端增强时，才会上传少量代表图，并单独管理其保留与清理。
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>本地数据管理</Text>
          <Text style={styles.sectionHint}>导入记录与时间</Text>
        </View>

        <View style={styles.storageGrid}>
          <View style={styles.storageItem}>
            <Text style={styles.storageValue}>{localData.assetCount}</Text>
            <Text style={styles.storageLabel}>导入记录</Text>
          </View>
        </View>

        <View style={styles.dataNote}>
          <Text style={styles.dataNoteLabel}>最近导入</Text>
          <Text style={styles.dataNoteValue}>{formatDate(localData.lastRunAt)}</Text>
        </View>
        <View style={styles.dataNote}>
          <Text style={styles.dataNoteLabel}>最近尝试</Text>
          <Text style={styles.dataNoteValue}>{formatDate(localData.lastAttemptAt)}</Text>
        </View>

        <Pressable
          style={[styles.primaryButton, cleaning && styles.buttonDisabled]}
          onPress={handleClearLocalCache}
          disabled={cleaning}
        >
          {cleaning ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <Text style={styles.primaryButtonText}>清理导入记录</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>增强与播放</Text>
          <Text style={styles.sectionHint}>按事件显式上传与清理</Text>
        </View>

        <Pressable style={styles.menuItem} onPress={handleEnhancedUploadInfo}>
          <MaterialCommunityIcons name="cloud-upload-outline" size={20} color="#3A518A" />
          <View style={styles.menuTextWrap}>
            <Text style={styles.menuText}>增强上传说明</Text>
            <Text style={styles.menuSubtext}>默认不上图，只有显式触发时才上传代表图。</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color="#8EA0C8" />
        </Pressable>

        <View style={styles.menuItemStatic}>
          <MaterialCommunityIcons name="play-circle-outline" size={20} color="#3A518A" />
          <View style={styles.menuTextWrap}>
            <Text style={styles.menuText}>播放与导出设置</Text>
            <Text style={styles.menuSubtext}>当前沿用系统与页面默认配置，后续统一收口到这里。</Text>
          </View>
        </View>

        <View style={styles.enhancementSummaryCard}>
          <View style={styles.enhancementSummaryHead}>
            <View style={styles.menuTextWrap}>
              <Text style={styles.menuText}>增强素材保留</Text>
              <Text style={styles.menuSubtext}>
                当前保留 {enhancementData.assetCount} 张代表图，覆盖 {enhancementData.eventCount}{' '}
                个事件。
              </Text>
            </View>
            <MaterialCommunityIcons name="cloud-clock-outline" size={18} color="#3A518A" />
          </View>

          <View style={styles.dataNote}>
            <Text style={styles.dataNoteLabel}>素材体积</Text>
            <Text style={styles.dataNoteValue}>{formatFileSize(enhancementData.totalBytes)}</Text>
          </View>
          <View style={styles.dataNote}>
            <Text style={styles.dataNoteLabel}>最近到期</Text>
            <Text style={styles.dataNoteValue}>{formatDate(enhancementData.nextExpiresAt)}</Text>
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
          <MaterialCommunityIcons name="account-edit-outline" size={20} color="#3A518A" />
          <View style={styles.menuTextWrap}>
            <Text style={styles.menuText}>编辑本机资料</Text>
            <Text style={styles.menuSubtext}>可调整昵称等轻量本机展示信息。</Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={20} color="#8EA0C8" />
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EEF3FF',
  },
  content: {
    padding: 16,
    gap: 14,
  },
  centerState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EEF3FF',
    padding: 16,
  },
  errorText: {
    color: '#9A3B50',
    marginBottom: 10,
  },
  retryButton: {
    borderRadius: 999,
    backgroundColor: '#3659A8',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  heroCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#D9E3FB',
    backgroundColor: '#FFFFFF',
    padding: 18,
    gap: 18,
  },
  heroTopRow: {
    flexDirection: 'row',
    gap: 14,
    alignItems: 'center',
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
  },
  avatarFallback: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#3159AE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
  },
  heroTextWrap: {
    flex: 1,
    gap: 4,
  },
  heroEyebrow: {
    color: '#3159AE',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#22335C',
  },
  heroSubtitle: {
    color: '#607297',
    lineHeight: 20,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metaItem: {
    minWidth: '30%',
    flex: 1,
    borderRadius: 16,
    backgroundColor: '#F6F9FF',
    padding: 12,
    gap: 6,
  },
  metaLabel: {
    fontSize: 11,
    color: '#7B8FB7',
  },
  metaValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#25365F',
  },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#D9E3FB',
    backgroundColor: '#FFFFFF',
    padding: 16,
    gap: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#24355E',
  },
  sectionHint: {
    fontSize: 12,
    color: '#7B8FB7',
  },
  infoRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  infoIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoBody: {
    flex: 1,
    gap: 4,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#26385F',
  },
  infoText: {
    color: '#617498',
    lineHeight: 20,
  },
  storageGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  storageItem: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: '#F6F9FF',
    padding: 14,
    gap: 6,
  },
  storageValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#22335C',
  },
  storageLabel: {
    color: '#7286AF',
    fontSize: 12,
  },
  dataNote: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: '#F9FBFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dataNoteLabel: {
    color: '#6C80A9',
    fontSize: 13,
  },
  dataNoteValue: {
    color: '#29406E',
    fontSize: 13,
    fontWeight: '700',
  },
  primaryButton: {
    height: 48,
    borderRadius: 14,
    backgroundColor: '#3659A8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#C8D6F5',
    backgroundColor: '#F8FAFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: '#355CB0',
    fontSize: 14,
    fontWeight: '800',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    backgroundColor: '#F8FAFF',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  menuItemStatic: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    backgroundColor: '#F8FAFF',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  enhancementSummaryCard: {
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#DCE6FB',
    backgroundColor: '#F7FAFF',
    padding: 14,
  },
  enhancementSummaryHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  menuTextWrap: {
    flex: 1,
    gap: 2,
  },
  menuText: {
    color: '#25365F',
    fontSize: 14,
    fontWeight: '700',
  },
  menuSubtext: {
    color: '#7386AE',
    fontSize: 12,
    lineHeight: 18,
  },
});
