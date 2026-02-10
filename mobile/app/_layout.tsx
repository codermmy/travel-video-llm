import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { PaperProvider } from 'react-native-paper';

import { syncService, type SyncStatus } from '@/services/sync/syncService';
import { useAuthStore } from '@/stores/authStore';
import { appTheme } from '@/styles/theme';
import { authDebug } from '@/utils/authDebug';

const AUTH_ROUTE_ROOTS = new Set(['(auth)', 'login', 'register', 'forgot-password']);

/**
 * 根布局 - 认证检查与路由分流
 */
export default function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, isLoading, checkAuth, userId } = useAuthStore();
  const hasCheckedAuth = useRef(false);
  const syncCheckedUserRef = useRef<string | null>(null);

  const [syncPromptVisible, setSyncPromptVisible] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasCheckedAuth.current) {
      hasCheckedAuth.current = true;
      authDebug('RootLayout run checkAuth once');
      void checkAuth();
    }
  }, [checkAuth]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    const segmentRoot = segments[0] ?? '(auth)';
    const inAuthRoutes = AUTH_ROUTE_ROOTS.has(segmentRoot);

    authDebug('RootLayout auth gate', {
      isAuthenticated,
      isLoading,
      segmentRoot,
      inAuthRoutes,
    });

    if (isAuthenticated && inAuthRoutes) {
      authDebug('RootLayout redirect authenticated user to tabs');
      router.replace('/(tabs)');
      return;
    }

    if (!isAuthenticated && !inAuthRoutes) {
      authDebug('RootLayout redirect unauthenticated user to auth');
      router.replace('/(auth)');
    }
  }, [isAuthenticated, isLoading, router, segments]);

  useEffect(() => {
    if (!isAuthenticated || !userId) {
      syncCheckedUserRef.current = null;
      syncService.setBootstrapActive(false);
      setSyncPromptVisible(false);
      setSyncStatus(null);
      setSyncError(null);
      return;
    }

    if (syncCheckedUserRef.current === userId) {
      return;
    }
    syncCheckedUserRef.current = userId;

    let cancelled = false;
    const checkSync = async () => {
      try {
        const status = await syncService.getStatus();
        if (cancelled) {
          return;
        }
        setSyncStatus(status);
        if (status.needsSync || status.isFirstSyncOnDevice) {
          syncService.setBootstrapActive(true);
          setSyncPromptVisible(true);
        } else {
          syncService.setBootstrapActive(false);
          await syncService.markSynced(userId, status.device.lastPullCursor || status.cloud.cursor || null);
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        setSyncError(error instanceof Error ? error.message : '同步状态获取失败');
        syncService.setBootstrapActive(false);
      }
    };

    void checkSync();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, userId]);

  const closeSyncPrompt = useCallback(() => {
    syncService.setBootstrapActive(false);
    setSyncPromptVisible(false);
  }, []);

  const runSyncNow = useCallback(async () => {
    if (!userId) {
      closeSyncPrompt();
      return;
    }

    try {
      setSyncing(true);
      setSyncError(null);
      await syncService.runMetadataSync(userId);
      const latest = await syncService.getStatus();
      setSyncStatus(latest);
      closeSyncPrompt();
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : '同步失败');
    } finally {
      setSyncing(false);
      syncService.setBootstrapActive(false);
    }
  }, [closeSyncPrompt, userId]);

  if (isLoading) {
    return (
      <PaperProvider theme={appTheme}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" />
        </View>
      </PaperProvider>
    );
  }

  if (isAuthenticated) {
    return (
      <PaperProvider theme={appTheme}>
        <View style={styles.authContainer}>
          <Stack key="auth-yes" screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="photo-viewer"
              options={{ headerShown: false, presentation: 'fullScreenModal' }}
            />
            <Stack.Screen
              name="slideshow"
              options={{ headerShown: false, presentation: 'fullScreenModal' }}
            />
            <Stack.Screen name="events/[eventId]" options={{ headerShown: false }} />
            <Stack.Screen name="profile/edit" options={{ headerShown: false }} />
            <Stack.Screen name="profile/avatar" options={{ headerShown: false }} />
          </Stack>

          {syncPromptVisible && syncStatus ? (
            <View style={styles.syncMask}>
              <View style={styles.syncCard}>
                <Text style={styles.syncTitle}>发现云端旅行记录</Text>
                <Text style={styles.syncBody}>
                  你在其他设备上已生成 {syncStatus.cloud.eventCount} 个事件，是否立即同步到本机？
                </Text>
                {syncError ? <Text style={styles.syncError}>{syncError}</Text> : null}

                <View style={styles.syncActions}>
                  <Pressable style={styles.syncLaterBtn} onPress={closeSyncPrompt} disabled={syncing}>
                    <Text style={styles.syncLaterText}>稍后</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.syncNowBtn, syncing && styles.syncBtnDisabled]}
                    onPress={() => void runSyncNow()}
                    disabled={syncing}
                  >
                    {syncing ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.syncNowText}>立即同步</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </PaperProvider>
    );
  }

  return (
    <PaperProvider theme={appTheme}>
      <Stack key="auth-no" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="register" options={{ headerShown: false }} />
        <Stack.Screen name="forgot-password" options={{ headerShown: false }} />
      </Stack>
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  authContainer: {
    flex: 1,
  },
  syncMask: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8,17,38,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  syncCard: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DBE5FB',
    padding: 16,
    gap: 10,
  },
  syncTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#25365F',
  },
  syncBody: {
    fontSize: 13,
    lineHeight: 20,
    color: '#5A6C96',
  },
  syncError: {
    fontSize: 12,
    color: '#B2445A',
  },
  syncActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  syncLaterBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C8D5F1',
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#FFFFFF',
  },
  syncLaterText: {
    color: '#3A518A',
    fontWeight: '700',
  },
  syncNowBtn: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#3258AB',
    minWidth: 96,
    alignItems: 'center',
  },
  syncNowText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  syncBtnDisabled: {
    opacity: 0.75,
  },
});
