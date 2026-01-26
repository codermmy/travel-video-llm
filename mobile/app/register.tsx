import { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthStore } from '@/stores/authStore';

/**
 * 注册页面 - 邮箱密码注册
 */
export default function RegisterScreen() {
  const router = useRouter();
  const { registerWithEmail, isLoading, error, clearError, isAuthenticated } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  // 注册成功后自动跳转
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const handleRegister = useCallback(async () => {
    // 基础验证
    setLocalError(null);
    if (!email || !password || !confirmPassword) {
      setLocalError('请填写所有必填项');
      return;
    }
    if (!email.includes('@')) {
      setLocalError('请输入有效的邮箱地址');
      return;
    }
    if (password.length < 6) {
      setLocalError('密码至少需要6位');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('两次输入的密码不一致');
      return;
    }

    clearError();
    const success = await registerWithEmail(email, password, nickname || undefined);
    if (success) {
      router.replace('/(tabs)');
    }
  }, [email, password, confirmPassword, nickname, clearError, registerWithEmail, router]);

  const displayError = localError || error;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← 返回</Text>
          </Pressable>

          <Text style={styles.title}>创建账号</Text>
          <Text style={styles.subtitle}>开始你的旅行记录之旅</Text>

          <View style={styles.form}>
            <Text style={styles.label}>邮箱 *</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="请输入邮箱"
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={styles.label}>密码 *</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="至少6位密码"
              secureTextEntry
            />

            <Text style={styles.label}>确认密码 *</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="再次输入密码"
              secureTextEntry
            />

            <Text style={styles.label}>昵称（可选）</Text>
            <TextInput
              style={styles.input}
              value={nickname}
              onChangeText={setNickname}
              placeholder="给自己起个名字"
            />

            {displayError && <Text style={styles.errorText}>{displayError}</Text>}

            <Button
              mode="contained"
              onPress={handleRegister}
              loading={isLoading}
              disabled={!email || !password || !confirmPassword}
              style={styles.button}
            >
              注册
            </Button>
          </View>

          <Pressable onPress={() => router.back()} style={styles.footer}>
            <Text style={styles.footerText}>
              已有账号？<Text style={styles.link}>立即登录</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F6F3',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 16,
  },
  backButtonText: {
    fontSize: 16,
    color: '#7F8C8D',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#2C3E50',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#7F8C8D',
    marginBottom: 32,
  },
  form: {
    marginBottom: 24,
  },
  label: {
    fontSize: 14,
    color: '#2C3E50',
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  errorText: {
    color: '#E74C3C',
    fontSize: 14,
    marginBottom: 16,
    textAlign: 'center',
  },
  button: {
    marginTop: 8,
  },
  footer: {
    marginTop: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 16,
    color: '#7F8C8D',
  },
  link: {
    color: '#4A90D9',
    fontWeight: '600',
  },
});
