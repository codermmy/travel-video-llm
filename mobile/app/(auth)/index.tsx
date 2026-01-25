import { useCallback, useState } from 'react';
import { StyleSheet, View, Pressable, Text } from 'react-native';
import { Button } from 'react-native-paper';
import { useRouter } from 'expo-router';

import { useAuthStore } from '@/stores';
import { openAppSettings, requestPhotoLibraryPermission } from '@/utils/permissionUtils';

/**
 * 欢迎页 / 认证入口页
 * 显示应用介绍和注册/登录入口
 * 注意：checkAuth 已在 _layout.tsx 中调用，这里不需要重复调用
 */
export default function WelcomeScreen() {
  const router = useRouter();
  const [statusText, setStatusText] = useState<string>('');
  const [showSettings, setShowSettings] = useState(false);
  const { register, isLoading, error, clearError } = useAuthStore();

  const registerDevice = useCallback(async () => {
    clearError();
    setShowSettings(false);
    setStatusText('requesting permission...');
    const permission = await requestPhotoLibraryPermission();
    if (!permission.granted) {
      setStatusText('permission denied');
      setShowSettings(!permission.canAskAgain);
      return;
    }
    setStatusText('registering...');
    const success = await register();
    setStatusText(success ? 'registered' : 'register failed');
    if (success) {
      router.replace('/(tabs)');
    }
  }, [clearError, register, router]);

  const goToLogin = useCallback(() => {
    router.push('/login');
  }, [router]);

  const goToRegister = useCallback(() => {
    router.push('/register');
  }, [router]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Travel Album</Text>
      <Text style={styles.subtitle}>记录你的旅程故事</Text>

      {statusText ? <Text style={styles.mono}>{statusText}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.buttonGroup}>
        <Button
          mode="contained"
          onPress={registerDevice}
          loading={isLoading}
          disabled={isLoading}
          style={styles.button}
        >
          设备登录
        </Button>
        <Button
          mode="outlined"
          onPress={goToLogin}
          disabled={isLoading}
          style={styles.button}
        >
          邮箱登录
        </Button>
      </View>

      <Pressable onPress={goToRegister}>
        <Text style={styles.registerLink}>没有账号？立即注册</Text>
      </Pressable>

      {showSettings ? (
        <Button mode="text" onPress={openAppSettings}>
          打开系统设置
        </Button>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 12,
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
  },
  title: {
    textAlign: 'center',
    fontSize: 32,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  buttonGroup: {
    gap: 12,
    marginTop: 12,
  },
  button: {
    marginBottom: 4,
  },
  registerLink: {
    textAlign: 'center',
    marginTop: 16,
    color: '#4A90D9',
    fontSize: 14,
  },
  mono: {
    fontFamily: 'Courier',
    fontSize: 12,
    textAlign: 'center',
  },
  error: {
    color: '#b00020',
    textAlign: 'center',
  },
});
