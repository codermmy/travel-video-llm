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

import { userApi, type UserProfile } from '@/services/api/userApi';
import { syncService, type SyncStatus } from '@/services/sync/syncService';
import { useAuthStore } from '@/stores/authStore';

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

function maskUserId(userId: string): string {
  if (userId.length <= 10) {
    return userId;
  }
  return `${userId.slice(0, 6)}...${userId.slice(-4)}`;
}

export default function ProfileScreen() {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncLoading, setSyncLoading] = useState(false);

  const loadProfile = useCallback(async () => {
    try {
      setLoading(true);
      const [profile, status] = await Promise.all([
        userApi.getCurrentUser(),
        syncService.getStatus().catch(() => null),
      ]);
      setUser(profile);
      setSyncStatus(status);
      setError(null);
    } catch (e) {
      console.warn('load profile failed', e);
      setError(e instanceof Error ? e.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile]),
  );

  const avatarLetter = useMemo(() => {
    const source = user?.nickname?.trim() || user?.email?.trim() || 'U';
    return source.slice(0, 1).toUpperCase();
  }, [user?.email, user?.nickname]);

  const onLogout = useCallback(() => {
    Alert.alert('退出登录', '确定退出当前账号？', [
      { text: '取消', style: 'cancel' },
      {
        text: '退出',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await logout();
            router.replace('/(auth)');
          })();
        },
      },
    ]);
  }, [logout, router]);

  const syncLabel = useMemo(() => {
    if (!syncStatus) {
      return '未知';
    }
    if (syncLoading) {
      return '同步中';
    }
    if (syncStatus.needsSync) {
      return '需要同步';
    }
    return '已同步';
  }, [syncLoading, syncStatus]);

  const runSync = useCallback(async () => {
    if (!user) {
      return;
    }
    try {
      setSyncLoading(true);
      await syncService.runMetadataSync(user.id);
      const latest = await syncService.getStatus();
      setSyncStatus(latest);
    } catch (e) {
      Alert.alert('同步失败', e instanceof Error ? e.message : '请稍后重试');
    } finally {
      setSyncLoading(false);
    }
  }, [user]);

  if (loading) {
    return (
      <View style={styles.centerState}>
        <ActivityIndicator size="large" color="#3659A8" />
      </View>
    );
  }

  if (!user || error) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.errorText}>{error || '未加载到用户信息'}</Text>
        <Pressable style={styles.retryButton} onPress={() => void loadProfile()}>
          <Text style={styles.retryButtonText}>重试</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.heroCard}>
        <Pressable onPress={() => router.push('/profile/avatar')} style={styles.avatarWrap}>
          {user.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarFallbackText}>{avatarLetter}</Text>
            </View>
          )}
          <View style={styles.avatarEditBadge}>
            <MaterialCommunityIcons name="camera" color="#FFFFFF" size={14} />
          </View>
        </Pressable>

        <Text style={styles.nicknameText}>{user.nickname || '未设置昵称'}</Text>
        <Text style={styles.emailText}>{user.email || '未绑定邮箱'}</Text>

        <View style={styles.metaGrid}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>用户ID</Text>
            <Text style={styles.metaValue}>{maskUserId(user.id)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>认证方式</Text>
            <Text style={styles.metaValue}>{user.auth_type === 'email' ? '邮箱' : '设备ID'}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>注册时间</Text>
            <Text style={styles.metaValue}>{formatDate(user.created_at)}</Text>
          </View>
        </View>
      </View>

      <View style={styles.menuCard}>
        <View style={styles.syncCard}>
          <View style={styles.syncHeader}>
            <Text style={styles.syncTitle}>多设备同步</Text>
            <Text style={styles.syncStateText}>{syncLabel}</Text>
          </View>
          {user.auth_type === 'device' ? (
            <Text style={styles.syncHintText}>当前为本机账号，跨设备同步需绑定邮箱账号。</Text>
          ) : (
            <>
              <Text style={styles.syncHintText}>
                云端事件 {syncStatus?.cloud.eventCount ?? 0} 个，本机上次同步：
                {syncStatus?.device.lastPullAt ? formatDate(syncStatus.device.lastPullAt) : '未同步'}
              </Text>
              <Pressable
                style={[styles.syncButton, syncLoading && styles.syncButtonDisabled]}
                onPress={() => void runSync()}
                disabled={syncLoading}
              >
                {syncLoading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.syncButtonText}>立即同步</Text>
                )}
              </Pressable>
            </>
          )}
        </View>

        <Pressable style={styles.menuItem} onPress={() => router.push('/profile/edit')}>
          <MaterialCommunityIcons name="account-edit-outline" size={20} color="#3A518A" />
          <Text style={styles.menuText}>编辑资料</Text>
          <MaterialCommunityIcons name="chevron-right" size={20} color="#8EA0C8" />
        </Pressable>

        <Pressable style={styles.menuItem} onPress={() => router.push('/profile/avatar')}>
          <MaterialCommunityIcons name="image-edit-outline" size={20} color="#3A518A" />
          <Text style={styles.menuText}>更换头像</Text>
          <MaterialCommunityIcons name="chevron-right" size={20} color="#8EA0C8" />
        </Pressable>

        <Pressable style={[styles.menuItem, styles.menuItemDanger]} onPress={onLogout}>
          <MaterialCommunityIcons name="logout" size={20} color="#B13C53" />
          <Text style={styles.menuTextDanger}>退出登录</Text>
          <MaterialCommunityIcons name="chevron-right" size={20} color="#D18A99" />
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
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D9E3FB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    paddingVertical: 20,
    alignItems: 'center',
  },
  avatarWrap: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'visible',
  },
  avatarImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#EDF2FF',
  },
  avatarFallback: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    borderColor: '#EDF2FF',
    backgroundColor: '#4E67A8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: '#FFFFFF',
    fontSize: 44,
    fontWeight: '700',
  },
  avatarEditBadge: {
    position: 'absolute',
    right: 0,
    bottom: 4,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#3659A8',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nicknameText: {
    marginTop: 14,
    fontSize: 24,
    fontWeight: '800',
    color: '#24345D',
  },
  emailText: {
    marginTop: 4,
    fontSize: 13,
    color: '#5F739F',
  },
  metaGrid: {
    marginTop: 14,
    width: '100%',
    gap: 8,
  },
  metaItem: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5ECFC',
    backgroundColor: '#F8FAFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  metaLabel: {
    fontSize: 11,
    color: '#7A8FB7',
  },
  metaValue: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
    color: '#2D406E',
  },
  menuCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D9E3FB',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  syncCard: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E9EEFC',
    backgroundColor: '#F8FAFF',
  },
  syncHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  syncTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2F4476',
  },
  syncStateText: {
    fontSize: 12,
    color: '#4A5F95',
    fontWeight: '700',
  },
  syncHintText: {
    marginTop: 8,
    fontSize: 12,
    color: '#667CA8',
    lineHeight: 18,
  },
  syncButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    backgroundColor: '#3659A8',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 88,
    alignItems: 'center',
  },
  syncButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  syncButtonDisabled: {
    opacity: 0.75,
  },
  menuItem: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E9EEFC',
    gap: 10,
  },
  menuText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#2F4476',
  },
  menuItemDanger: {
    borderBottomWidth: 0,
    backgroundColor: '#FFF6F8',
  },
  menuTextDanger: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#B13C53',
  },
});
