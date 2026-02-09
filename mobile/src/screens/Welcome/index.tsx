import { useCallback, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from 'react-native-paper';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '@/navigation/types';
import { useAuthStore } from '@/stores';
import { openAppSettings, requestPhotoLibraryPermission } from '@/utils/permissionUtils';

type Props = NativeStackScreenProps<RootStackParamList, 'Welcome'>;

const NICKNAME_MAX_LENGTH = 20;

function normalizeNickname(value: string): string {
  return value.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').slice(0, NICKNAME_MAX_LENGTH);
}

export function WelcomeScreen({ navigation }: Props) {
  const { register, isLoading, error, clearError } = useAuthStore();

  const [nickname, setNickname] = useState('');
  const [statusText, setStatusText] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const nicknameHint = useMemo(
    () => `${nickname.length}/${NICKNAME_MAX_LENGTH}（可选）`,
    [nickname.length],
  );

  const handleStart = useCallback(async () => {
    clearError();
    setShowSettings(false);
    setStatusText('正在请求相册权限...');

    const permission = await requestPhotoLibraryPermission();
    if (!permission.granted) {
      setStatusText('未获得权限，请前往系统设置开启');
      setShowSettings(!permission.canAskAgain);
      return;
    }

    setStatusText('正在注册设备...');
    const success = await register(nickname || undefined);
    if (success) {
      navigation.replace('Main');
      return;
    }
    setStatusText('注册失败，请稍后重试');
  }, [clearError, navigation, nickname, register]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Travel Album</Text>
      <Text style={styles.subtitle}>记录你的旅程故事</Text>

      <Text style={styles.label}>昵称（可选）</Text>
      <TextInput
        value={nickname}
        onChangeText={(v) => setNickname(normalizeNickname(v))}
        placeholder="输入你的昵称"
        style={styles.input}
      />
      <Text style={styles.hint}>{nicknameHint}</Text>

      <Button mode="contained" onPress={handleStart} loading={isLoading} disabled={isLoading}>
        开始使用
      </Button>

      {statusText ? <Text style={styles.status}>{statusText}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable onPress={() => navigation.navigate('Login')}>
        <Text style={styles.link}>已有账号？前往登录</Text>
      </Pressable>

      <Pressable onPress={() => navigation.navigate('Register')}>
        <Text style={styles.link}>没有账号？立即注册</Text>
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
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#F3F6FB',
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#213154',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    color: '#607094',
    textAlign: 'center',
    marginBottom: 24,
  },
  label: {
    color: '#32446E',
    fontWeight: '700',
    fontSize: 13,
  },
  input: {
    marginTop: 8,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: '#D5DDF2',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  hint: {
    marginBottom: 14,
    color: '#7888AB',
    fontSize: 11,
  },
  status: {
    marginTop: 10,
    color: '#5A6F9B',
    textAlign: 'center',
  },
  error: {
    marginTop: 6,
    color: '#D34B5A',
    textAlign: 'center',
  },
  link: {
    marginTop: 12,
    textAlign: 'center',
    color: '#3D58A7',
    fontWeight: '600',
  },
});
