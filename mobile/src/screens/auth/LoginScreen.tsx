/**
 * 登录页面
 * 支持邮箱密码登录
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AuthButton, AuthInput } from '@/components/auth';
import { AuthColors, AuthSpacing, AuthTypography } from '@/constants';
import { useAuthStore } from '@/stores/authStore';
import { getEmailError, getPasswordError } from '@/utils/validators';
import type { RootStackParamList } from '@/navigation/types';

export const LoginScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { loginWithEmail, isLoading, error, clearError, isAuthenticated } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // 登录成功后自动跳转
  useEffect(() => {
    if (isAuthenticated) {
      navigation.replace('Main');
    }
  }, [isAuthenticated, navigation]);

  // 清除全局错误
  useEffect(() => {
    return () => {
      clearError();
    };
  }, [clearError]);

  const validateForm = useCallback(() => {
    const emailErr = getEmailError(email);
    const passwordErr = getPasswordError(password);

    setEmailError(emailErr);
    setPasswordError(passwordErr);

    return !emailErr && !passwordErr;
  }, [email, password]);

  const handleLogin = useCallback(async () => {
    if (!validateForm()) {
      return;
    }

    await loginWithEmail(email, password);
  }, [email, password, validateForm, loginWithEmail]);

  const goToRegister = useCallback(() => {
    navigation.navigate('Register');
  }, [navigation]);

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Hero 区域 */}
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>欢迎回来</Text>
            <Text style={styles.heroSubtitle}>继续你的旅程</Text>
          </View>

          {/* 表单区域 */}
          <View style={styles.form}>
            <AuthInput
              label="邮箱"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              error={emailError}
            />

            <AuthInput
              label="密码"
              value={password}
              onChangeText={setPassword}
              isPassword
              error={passwordError}
              autoComplete="password"
              onSubmitEditing={handleLogin}
            />

            {/* 找回密码入口（预留） */}
            <Pressable style={styles.forgotPassword}>
              <Text style={styles.forgotPasswordText}>忘记密码？</Text>
            </Pressable>

            {/* 错误提示 */}
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* 登录按钮 */}
            <AuthButton
              title="登录"
              onPress={handleLogin}
              loading={isLoading}
              disabled={!email || !password}
              style={styles.loginButton}
            />
          </View>

          {/* 底部注册引导 */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>还没有账号？</Text>
            <Pressable onPress={goToRegister}>
              <Text style={styles.footerLink}>立即注册</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AuthColors.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: AuthSpacing.padding.screenHorizontal,
    paddingVertical: AuthSpacing.padding.screenVertical,
  },
  hero: {
    marginBottom: AuthSpacing.spacing.xxl,
  },
  heroTitle: {
    fontSize: AuthTypography.fontSize.heroTitle,
    fontWeight: AuthTypography.fontWeight.bold,
    color: AuthColors.textPrimary,
    marginBottom: AuthSpacing.spacing.xs,
  },
  heroSubtitle: {
    fontSize: AuthTypography.fontSize.heroSubtitle,
    color: AuthColors.textSecondary,
  },
  form: {
    marginBottom: AuthSpacing.spacing.xxl,
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginTop: -AuthSpacing.spacing.sm,
    marginBottom: AuthSpacing.spacing.lg,
  },
  forgotPasswordText: {
    fontSize: AuthTypography.fontSize.caption,
    color: AuthColors.primary,
  },
  errorContainer: {
    backgroundColor: AuthColors.errorLight,
    borderRadius: AuthSpacing.radius.sm,
    paddingHorizontal: AuthSpacing.padding.inputHorizontal,
    paddingVertical: AuthSpacing.spacing.sm,
    marginBottom: AuthSpacing.margin.buttonTop,
  },
  errorText: {
    fontSize: AuthTypography.fontSize.caption,
    color: AuthColors.error,
  },
  loginButton: {
    marginTop: AuthSpacing.margin.buttonTop,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 'auto',
  },
  footerText: {
    fontSize: AuthTypography.fontSize.body,
    color: AuthColors.textSecondary,
    marginRight: AuthSpacing.spacing.xs,
  },
  footerLink: {
    fontSize: AuthTypography.fontSize.body,
    fontWeight: AuthTypography.fontWeight.semibold,
    color: AuthColors.primary,
  },
});
