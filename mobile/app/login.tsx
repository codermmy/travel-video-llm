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

import { useAuthStore } from '@/stores/authStore';

export default function LoginScreen() {
  const router = useRouter();
  const { loginWithEmail, isLoading, error, clearError, isAuthenticated } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const disabled = useMemo(() => !email || !password || isLoading, [email, isLoading, password]);

  const handleLogin = useCallback(async () => {
    clearError();
    const success = await loginWithEmail(email.trim(), password);
    if (success) {
      router.replace('/(tabs)');
    }
  }, [email, password, clearError, loginWithEmail, router]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']} testID="login-screen">
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => router.back()} style={styles.backButton} testID="login-back-button">
            <Text style={styles.backButtonText}>← 返回</Text>
          </Pressable>

          <Text style={styles.title}>欢迎回来</Text>
          <Text style={styles.subtitle}>使用邮箱密码登录</Text>

          <View style={styles.form}>
            <Text style={styles.label}>邮箱</Text>
            <View style={styles.inputWrap}>
              <MaterialCommunityIcons name="email-outline" size={18} color="#5E739F" />
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="请输入邮箱"
                autoCapitalize="none"
                keyboardType="email-address"
                placeholderTextColor="#8D9DBD"
                testID="email-input"
              />
            </View>

            <Text style={styles.label}>密码</Text>
            <View style={styles.inputWrap}>
              <MaterialCommunityIcons name="lock-outline" size={18} color="#5E739F" />
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder="请输入密码"
                secureTextEntry={!showPassword}
                placeholderTextColor="#8D9DBD"
                testID="password-input"
              />
              <Pressable onPress={() => setShowPassword((v) => !v)}>
                <MaterialCommunityIcons
                  name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  size={18}
                  color="#5E739F"
                />
              </Pressable>
            </View>

            <Pressable onPress={() => router.push('/forgot-password')} style={styles.forgotLinkWrap}>
              <Text style={styles.forgotLink}>忘记密码？</Text>
            </Pressable>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable
              onPress={handleLogin}
              style={({ pressed }) => [
                styles.submitButton,
                (disabled || pressed) && styles.submitButtonPressed,
                disabled && styles.submitButtonDisabled,
              ]}
              disabled={disabled}
              testID="login-submit-button"
            >
              <Text style={styles.submitButtonText}>{isLoading ? '登录中...' : '登 录'}</Text>
            </Pressable>
          </View>

          <Pressable onPress={() => router.push('/register')} style={styles.footer} testID="register-link">
            <Text style={styles.footerText}>
              还没有账号？<Text style={styles.link}>立即注册</Text>
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
    fontSize: 16,
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
  inputWrap: {
    backgroundColor: '#F8FAFF',
    borderWidth: 1,
    borderColor: '#D7E0F5',
    borderRadius: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    color: '#22355A',
    fontSize: 15,
  },
  forgotLinkWrap: {
    alignSelf: 'flex-end',
  },
  forgotLink: {
    color: '#2F6AF6',
    fontSize: 12,
    fontWeight: '700',
  },
  errorText: {
    color: '#E74C3C',
    fontSize: 13,
    textAlign: 'center',
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
  },
  submitButtonDisabled: {
    opacity: 0.6,
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
