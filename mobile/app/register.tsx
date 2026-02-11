import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { sendEmailCode } from '@/services/api/authApi';
import { useAuthStore } from '@/stores/authStore';

const SEND_CODE_SECONDS = 60;

function isValidEmail(email: string): boolean {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
}

export default function RegisterScreen() {
  const router = useRouter();
  const { registerWithEmail, isLoading, error, clearError, isAuthenticated } = useAuthStore();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setCountdown((s) => (s > 0 ? s - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const handleSendCode = useCallback(async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      setLocalError('请输入有效邮箱后再发送验证码');
      return;
    }

    try {
      setSendingCode(true);
      setLocalError(null);
      clearError();
      await sendEmailCode(normalizedEmail, 'register');
      setCountdown(SEND_CODE_SECONDS);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : '验证码发送失败，请稍后重试');
    } finally {
      setSendingCode(false);
    }
  }, [clearError, email]);

  const handleRegister = useCallback(async () => {
    const normalizedEmail = email.trim().toLowerCase();

    setLocalError(null);
    if (!normalizedEmail || !password || !confirmPassword || !code) {
      setLocalError('请填写所有必填项');
      return;
    }
    if (!isValidEmail(normalizedEmail)) {
      setLocalError('请输入有效的邮箱地址');
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setLocalError('请输入 6 位数字验证码');
      return;
    }
    if (password.length < 8) {
      setLocalError('密码至少需要8位');
      return;
    }
    if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      setLocalError('密码必须包含字母和数字');
      return;
    }
    if (/\s/.test(password)) {
      setLocalError('密码不能包含空格');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('两次输入的密码不一致');
      return;
    }

    clearError();
    const success = await registerWithEmail(normalizedEmail, password, code, nickname || undefined);
    if (success) {
      router.replace('/(tabs)');
    }
  }, [email, password, confirmPassword, code, clearError, registerWithEmail, nickname, router]);

  const displayError = localError || error;
  const disableSendCode = useMemo(
    () => sendingCode || countdown > 0 || !isValidEmail(email.trim().toLowerCase()),
    [countdown, email, sendingCode],
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']} testID="register-screen">
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} style={styles.backButton} testID="register-back-button">
            <Text style={styles.backButtonText}>← 返回</Text>
          </Pressable>

          <Text style={styles.title}>创建账号</Text>
          <Text style={styles.subtitle}>邮箱验证后即可开启旅行故事</Text>

          <View style={styles.form}>
            <Text style={styles.label}>邮箱 *</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="请输入邮箱"
              autoCapitalize="none"
              keyboardType="email-address"
              placeholderTextColor="#8D9DBD"
              testID="register-email-input"
            />

            <Text style={styles.label}>验证码 *</Text>
            <View style={styles.codeRow}>
              <TextInput
                style={[styles.input, styles.codeInput]}
                value={code}
                onChangeText={setCode}
                placeholder="6位数字"
                keyboardType="number-pad"
                maxLength={6}
                placeholderTextColor="#8D9DBD"
                testID="register-code-input"
              />
              <Pressable
                onPress={handleSendCode}
                disabled={disableSendCode}
                style={({ pressed }) => [
                  styles.sendCodeButton,
                  (pressed || disableSendCode) && styles.sendCodeButtonDisabled,
                ]}
                testID="send-code-button"
              >
                <Text style={styles.sendCodeText}>
                  {countdown > 0 ? `${countdown}s` : sendingCode ? '发送中' : '发送验证码'}
                </Text>
              </Pressable>
            </View>

            <Text style={styles.label}>密码 *</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="至少8位，包含字母和数字"
              secureTextEntry
              placeholderTextColor="#8D9DBD"
              testID="register-password-input"
            />

            <Text style={styles.label}>确认密码 *</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="再次输入密码"
              secureTextEntry
              placeholderTextColor="#8D9DBD"
              testID="register-confirm-password-input"
            />

            <Text style={styles.label}>昵称（可选）</Text>
            <TextInput
              style={styles.input}
              value={nickname}
              onChangeText={setNickname}
              placeholder="给自己起个名字"
              placeholderTextColor="#8D9DBD"
              testID="register-nickname-input"
            />

            {displayError ? (
              <View style={styles.errorRow}>
                <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#E74C3C" />
                <Text style={styles.errorText}>{displayError}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleRegister}
              disabled={isLoading}
              style={({ pressed }) => [
                styles.submitButton,
                (pressed || isLoading) && styles.submitButtonPressed,
              ]}
              testID="register-submit-button"
            >
              <Text style={styles.submitButtonText}>{isLoading ? '注册中...' : '注 册'}</Text>
            </Pressable>
          </View>

          <Pressable onPress={() => router.push('/login')} style={styles.footer} testID="login-link">
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
    paddingVertical: 24,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  backButtonText: {
    fontSize: 14,
    color: '#6E7FA2',
    fontWeight: '600',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#2C3E50',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#7F8C8D',
    marginBottom: 28,
  },
  form: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F5',
    padding: 16,
    gap: 10,
  },
  label: {
    fontSize: 13,
    color: '#364A75',
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: '#D7E0F5',
    borderRadius: 12,
    backgroundColor: '#F8FAFF',
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 15,
    color: '#22355A',
  },
  codeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  codeInput: {
    flex: 1,
  },
  sendCodeButton: {
    borderRadius: 12,
    backgroundColor: '#2F6AF6',
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  sendCodeButtonDisabled: {
    opacity: 0.6,
  },
  sendCodeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  errorText: {
    color: '#E74C3C',
    fontSize: 13,
    flex: 1,
  },
  submitButton: {
    marginTop: 6,
    borderRadius: 12,
    backgroundColor: '#2F6AF6',
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitButtonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.86,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  footer: {
    marginTop: 22,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#7F8C8D',
  },
  link: {
    color: '#4A90D9',
    fontWeight: '700',
  },
});
