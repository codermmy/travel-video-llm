import { useState, useCallback, useEffect } from 'react';
import { StyleSheet, View, Text, Pressable, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Button } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuthStore } from '@/stores/authStore';

/**
 * 登录页面 - 邮箱密码登录
 */
export default function LoginScreen() {
  const router = useRouter();
  const { loginWithEmail, isLoading, error, clearError, isAuthenticated } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // 登录成功后自动跳转
  useEffect(() => {
    if (isAuthenticated) {
      router.replace('/(tabs)');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const handleLogin = useCallback(async () => {
    clearError();
    const success = await loginWithEmail(email, password);
    if (success) {
      router.replace('/(tabs)');
    }
  }, [email, password, clearError, loginWithEmail, router]);

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
          <Text style={styles.title}>欢迎回来</Text>
          <Text style={styles.subtitle}>使用邮箱密码登录</Text>

          <View style={styles.form}>
            <Text style={styles.label}>邮箱</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="请输入邮箱"
              autoCapitalize="none"
              keyboardType="email-address"
            />

            <Text style={styles.label}>密码</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="请输入密码"
              secureTextEntry
            />

            {error && (
              <Text style={styles.errorText}>{error}</Text>
            )}

            <Button
              mode="contained"
              onPress={handleLogin}
              loading={isLoading}
              disabled={!email || !password}
              style={styles.button}
            >
              登录
            </Button>
          </View>

          <Pressable onPress={() => router.push('/register')} style={styles.footer}>
            <Text style={styles.footerText}>还没有账号？<Text style={styles.link}>立即注册</Text></Text>
          </Pressable>

          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← 返回</Text>
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
  backButton: {
    marginTop: 24,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 16,
    color: '#7F8C8D',
  },
});
