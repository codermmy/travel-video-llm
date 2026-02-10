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

import { resetPassword, sendEmailCode } from '@/services/api/authApi';

const SEND_CODE_SECONDS = 60;

function isValidEmail(email: string): boolean {
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
}

export default function ForgotPasswordScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (countdown <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setCountdown((s) => (s > 0 ? s - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown]);

  const handleSendCode = useCallback(async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!isValidEmail(normalizedEmail)) {
      setError('请输入有效邮箱后再发送验证码');
      return;
    }

    try {
      setSendingCode(true);
      setError(null);
      setMessage(null);
      const res = await sendEmailCode(normalizedEmail, 'reset_password');
      setMessage(res.data?.message || '如果邮箱存在，验证码已发送');
      setCountdown(SEND_CODE_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : '验证码发送失败');
    } finally {
      setSendingCode(false);
    }
  }, [email]);

  const handleResetPassword = useCallback(async () => {
    const normalizedEmail = email.trim().toLowerCase();
    setError(null);
    setMessage(null);

    if (!normalizedEmail || !code || !newPassword || !confirmPassword) {
      setError('请填写所有必填项');
      return;
    }
    if (!isValidEmail(normalizedEmail)) {
      setError('请输入有效邮箱地址');
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError('请输入 6 位数字验证码');
      return;
    }
    if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/\d/.test(newPassword)) {
      setError('新密码至少8位，且包含字母和数字');
      return;
    }
    if (/\s/.test(newPassword)) {
      setError('新密码不能包含空格');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的新密码不一致');
      return;
    }

    try {
      setSubmitting(true);
      await resetPassword(normalizedEmail, code, newPassword);
      setMessage('密码已重置，请返回登录');
      setTimeout(() => {
        router.replace('/login');
      }, 900);
    } catch (err) {
      setError(err instanceof Error ? err.message : '重置失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }, [code, confirmPassword, email, newPassword, router]);

  const sendCodeDisabled = useMemo(
    () => sendingCode || countdown > 0 || !isValidEmail(email.trim().toLowerCase()),
    [countdown, email, sendingCode],
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← 返回</Text>
          </Pressable>

          <Text style={styles.title}>重置密码</Text>
          <Text style={styles.subtitle}>验证码有效期 10 分钟，请及时完成操作</Text>

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
              />
              <Pressable
                onPress={handleSendCode}
                disabled={sendCodeDisabled}
                style={({ pressed }) => [
                  styles.sendCodeButton,
                  (pressed || sendCodeDisabled) && styles.sendCodeButtonDisabled,
                ]}
              >
                <Text style={styles.sendCodeText}>
                  {countdown > 0 ? `${countdown}s` : sendingCode ? '发送中' : '发送验证码'}
                </Text>
              </Pressable>
            </View>

            <Text style={styles.label}>新密码 *</Text>
            <TextInput
              style={styles.input}
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="至少8位，包含字母和数字"
              secureTextEntry
              placeholderTextColor="#8D9DBD"
            />

            <Text style={styles.label}>确认新密码 *</Text>
            <TextInput
              style={styles.input}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="再次输入新密码"
              secureTextEntry
              placeholderTextColor="#8D9DBD"
            />

            {message ? (
              <View style={styles.messageRow}>
                <MaterialCommunityIcons name="check-circle-outline" size={16} color="#0B8D68" />
                <Text style={styles.messageText}>{message}</Text>
              </View>
            ) : null}

            {error ? (
              <View style={styles.errorRow}>
                <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#E74C3C" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              onPress={handleResetPassword}
              disabled={submitting}
              style={({ pressed }) => [
                styles.submitButton,
                (pressed || submitting) && styles.submitButtonPressed,
              ]}
            >
              <Text style={styles.submitButtonText}>{submitting ? '提交中...' : '确认重置'}</Text>
            </Pressable>
          </View>
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
    fontSize: 14,
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
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  messageText: {
    color: '#0B8D68',
    fontSize: 13,
    flex: 1,
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
});
