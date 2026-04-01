import { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAuthStore } from '@/stores/authStore';
import { appTheme } from '@/styles/theme';
import { authDebug } from '@/utils/authDebug';

/**
 * 根布局 - 自动恢复或初始化单设备会话
 */
export default function RootLayout() {
  const { isAuthenticated, isLoading, error, bootstrapDeviceSession } = useAuthStore();
  const hasBootstrapped = useRef(false);

  useEffect(() => {
    if (!hasBootstrapped.current) {
      hasBootstrapped.current = true;
      authDebug('RootLayout bootstrap device session');
      void bootstrapDeviceSession();
    }
  }, [bootstrapDeviceSession]);

  if (isLoading || (!isAuthenticated && !error)) {
    return (
      <PaperProvider theme={appTheme}>
        <LinearGradient colors={['#EEF3FF', '#E8F3EE', '#F8FAFF']} style={styles.centerState}>
          <View style={styles.loadingCard}>
            <View style={styles.loadingIcon}>
              <MaterialCommunityIcons name="cellphone-cog" size={28} color="#FFFFFF" />
            </View>
            <Text style={styles.loadingTitle}>正在准备这台设备</Text>
            <Text style={styles.loadingBody}>
              App 会自动恢复本机身份，不再进入登录或同步账号流程。
            </Text>
            <ActivityIndicator size="large" color="#2F64D8" />
          </View>
        </LinearGradient>
      </PaperProvider>
    );
  }

  if (!isAuthenticated) {
    return (
      <PaperProvider theme={appTheme}>
        <LinearGradient colors={['#EEF3FF', '#F7FAFF']} style={styles.centerState}>
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>设备初始化失败</Text>
            <Text style={styles.errorBody}>{error || '请检查网络后重试。'}</Text>
            <Pressable style={styles.retryButton} onPress={() => void bootstrapDeviceSession()}>
              <Text style={styles.retryButtonText}>重新初始化</Text>
            </Pressable>
          </View>
        </LinearGradient>
      </PaperProvider>
    );
  }

  return (
    <PaperProvider theme={appTheme}>
      <Stack initialRouteName="(tabs)" screenOptions={{ headerShown: false }}>
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
    </PaperProvider>
  );
}

const styles = StyleSheet.create({
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#D9E3FB',
    backgroundColor: 'rgba(255,255,255,0.9)',
    padding: 22,
    alignItems: 'center',
    gap: 14,
  },
  loadingIcon: {
    width: 58,
    height: 58,
    borderRadius: 999,
    backgroundColor: '#2F64D8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#22335C',
  },
  loadingBody: {
    textAlign: 'center',
    color: '#607297',
    lineHeight: 20,
  },
  errorCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E8C8D0',
    backgroundColor: '#FFFFFF',
    padding: 22,
    gap: 12,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#9A3349',
  },
  errorBody: {
    color: '#6E4B56',
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 4,
    borderRadius: 14,
    backgroundColor: '#2F64D8',
    paddingVertical: 12,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
