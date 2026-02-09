import { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useAuthStore } from '@/stores';
import { openAppSettings, requestPhotoLibraryPermission } from '@/utils/permissionUtils';

const NICKNAME_MAX_LENGTH = 20;

function normalizeNickname(value: string): string {
  return value.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '').slice(0, NICKNAME_MAX_LENGTH);
}

export default function WelcomeScreen() {
  const router = useRouter();
  const { register, isLoading, error, clearError } = useAuthStore();

  const [nickname, setNickname] = useState('');
  const [statusText, setStatusText] = useState('');
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [canAskAgain, setCanAskAgain] = useState(true);

  const nicknameHint = useMemo(
    () => `${nickname.length}/${NICKNAME_MAX_LENGTH}（可选）`,
    [nickname.length],
  );

  const registerDevice = useCallback(async () => {
    clearError();
    setPermissionDenied(false);
    setStatusText('正在请求相册权限...');

    const permission = await requestPhotoLibraryPermission();
    if (!permission.granted) {
      setPermissionDenied(true);
      setCanAskAgain(permission.canAskAgain);
      setStatusText(
        permission.canAskAgain ? '需要相册权限以继续导入照片' : '请前往系统设置开启相册权限',
      );
      return;
    }

    setStatusText('正在注册设备...');
    const success = await register(nickname || undefined);
    if (success) {
      router.replace('/(tabs)');
      return;
    }

    setStatusText('注册失败，请稍后重试');
  }, [clearError, nickname, register, router]);

  return (
    <LinearGradient colors={['#EEF3FF', '#E6F3ED', '#F7FAFF']} style={styles.page}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.heroCard}>
            <View style={styles.brandMark}>
              <MaterialCommunityIcons name="map-marker-path" size={32} color="#FFFFFF" />
            </View>
            <Text style={styles.title}>Travel Album</Text>
            <Text style={styles.subtitle}>把散落的旅途照片，整理成可回放的故事。</Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.inputLabel}>你的昵称（可选）</Text>
            <TextInput
              style={styles.input}
              value={nickname}
              onChangeText={(v) => setNickname(normalizeNickname(v))}
              placeholder="例如：小圆的旅行日记"
              maxLength={NICKNAME_MAX_LENGTH}
            />
            <Text style={styles.inputHint}>{nicknameHint}</Text>

            <Button
              mode="contained"
              onPress={registerDevice}
              loading={isLoading}
              disabled={isLoading}
              style={styles.primaryButton}
              contentStyle={styles.primaryButtonContent}
            >
              开始使用
            </Button>

            <Text style={styles.termsText}>点击“开始使用”即表示你同意《服务条款》与《隐私政策》。</Text>

            {statusText ? <Text style={styles.statusText}>{statusText}</Text> : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {permissionDenied ? (
              <View style={styles.permissionCard}>
                <MaterialCommunityIcons name="shield-alert-outline" size={18} color="#C25E2F" />
                <Text style={styles.permissionText}>
                  没有相册权限时，无法完成照片导入和事件生成。
                </Text>
                <Button mode="text" onPress={openAppSettings}>
                  打开系统设置
                </Button>
                {canAskAgain ? (
                  <Text style={styles.permissionHint}>你也可以再次点击“开始使用”重新请求权限。</Text>
                ) : null}
              </View>
            ) : null}
          </View>

          <View style={styles.footerActions}>
            <Pressable onPress={() => router.push('/login')}>
              <Text style={styles.footerText}>已有账号？前往邮箱登录</Text>
            </Pressable>
            <Pressable onPress={() => router.push('/register')}>
              <Text style={styles.footerText}>没有账号？注册新账号</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
    gap: 14,
  },
  heroCard: {
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.86)',
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: '#E0E7F7',
    alignItems: 'center',
  },
  brandMark: {
    width: 58,
    height: 58,
    borderRadius: 999,
    backgroundColor: '#2F6AF6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1E2E53',
  },
  subtitle: {
    marginTop: 6,
    textAlign: 'center',
    color: '#5A6C93',
    fontSize: 14,
    lineHeight: 20,
  },
  formCard: {
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderWidth: 1,
    borderColor: '#E0E7F7',
  },
  inputLabel: {
    color: '#2A3D68',
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#D5DFF4',
    borderRadius: 12,
    backgroundColor: '#F8FAFF',
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: '#22355A',
  },
  inputHint: {
    marginTop: 6,
    fontSize: 11,
    color: '#7687AB',
  },
  primaryButton: {
    marginTop: 14,
    borderRadius: 12,
    backgroundColor: '#2F6AF6',
  },
  primaryButtonContent: {
    paddingVertical: 4,
  },
  termsText: {
    marginTop: 10,
    fontSize: 11,
    color: '#7789AE',
    lineHeight: 16,
  },
  statusText: {
    marginTop: 10,
    textAlign: 'center',
    color: '#4E608A',
    fontSize: 12,
  },
  errorText: {
    marginTop: 6,
    textAlign: 'center',
    color: '#D34B5A',
    fontSize: 12,
  },
  permissionCard: {
    marginTop: 12,
    borderRadius: 12,
    backgroundColor: '#FFF7F0',
    borderWidth: 1,
    borderColor: '#F3D9C5',
    padding: 10,
    alignItems: 'center',
    gap: 6,
  },
  permissionText: {
    textAlign: 'center',
    color: '#8D5535',
    fontSize: 12,
    lineHeight: 18,
  },
  permissionHint: {
    color: '#9A6A4D',
    fontSize: 11,
    textAlign: 'center',
  },
  footerActions: {
    gap: 10,
    alignItems: 'center',
  },
  footerText: {
    color: '#3D58A7',
    fontWeight: '600',
    fontSize: 13,
  },
});
