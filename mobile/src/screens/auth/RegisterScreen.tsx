/**
 * 注册页面
 * 支持邮箱密码注册，含密码强度指示
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
import { ArrowLeft } from 'lucide-react-native';

import { AuthButton, AuthInput, PasswordStrength } from '@/components/auth';
import { AuthColors, AuthSpacing, AuthTypography } from '@/constants';
import { useAuthStore } from '@/stores/authStore';
import { getEmailError, getPasswordError, getConfirmPasswordError } from '@/utils/validators';
import type { RootStackParamList } from '@/navigation/types';

export const RegisterScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const { registerWithEmail, isLoading, error, clearError, isAuthenticated } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [nickname, setNickname] = useState('');

  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);

  // 清除 store 错误
  useEffect(() => {
    return () => {
      clearError();
    };
  }, [clearError]);

  // 注册成功后自动跳转
  useEffect(() => {
    if (isAuthenticated) {
      navigation.replace('Main');
    }
  }, [isAuthenticated, navigation]);

  // 实时验证邮箱
  useEffect(() => {
    if (email.length > 0) {
      setEmailError(getEmailError(email));
    } else {
      setEmailError(null);
    }
  }, [email]);

  // 实时验证密码
  useEffect(() => {
    if (password.length > 0) {
      setPasswordError(getPasswordError(password));
      // 如果确认密码已输入，重新验证确认密码
      if (confirmPassword.length > 0) {
        setConfirmPasswordError(getConfirmPasswordError(password, confirmPassword));
      }
    } else {
      setPasswordError(null);
    }
  }, [password, confirmPassword]);

  // 实时验证确认密码
  useEffect(() => {
    if (confirmPassword.length > 0) {
      setConfirmPasswordError(getConfirmPasswordError(password, confirmPassword));
    } else {
      setConfirmPasswordError(null);
    }
  }, [confirmPassword, password]);

  const validateForm = useCallback((): boolean => {
    const emailErr = getEmailError(email);
    const passwordErr = getPasswordError(password);
    const confirmErr = getConfirmPasswordError(password, confirmPassword);

    setEmailError(emailErr);
    setPasswordError(passwordErr);
    setConfirmPasswordError(confirmErr);

    return !emailErr && !passwordErr && !confirmErr;
  }, [email, password, confirmPassword]);

  const handleRegister = useCallback(async () => {
    if (!validateForm()) {
      return;
    }

    const success = await registerWithEmail(email, password, nickname || undefined);

    if (success) {
      // 注册成功后自动登录，导航由 app.tsx 处理
    }
  }, [email, password, nickname, validateForm, registerWithEmail]);

  const goBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const isFormValid =
    !emailError &&
    !passwordError &&
    !confirmPasswordError &&
    email.length > 0 &&
    password.length > 0 &&
    confirmPassword.length > 0;

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
          {/* 导航栏 */}
          <Pressable style={styles.backButton} onPress={goBack}>
            <ArrowLeft size={24} color={AuthColors.textPrimary} />
          </Pressable>

          {/* Hero 区域 */}
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>创建账号</Text>
            <Text style={styles.heroSubtitle}>开始你的旅行记录之旅</Text>
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
              autoComplete="password-new"
            />

            {/* 密码强度指示器 */}
            <PasswordStrength password={password} />

            <AuthInput
              label="确认密码"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              isPassword
              error={confirmPasswordError}
              autoComplete="password-new"
            />

            <AuthInput
              label="昵称（可选）"
              value={nickname}
              onChangeText={setNickname}
              autoComplete="nickname"
            />

            {/* 错误提示 */}
            {error && (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* 注册按钮 */}
            <AuthButton
              title="注册"
              onPress={handleRegister}
              loading={isLoading}
              disabled={!isFormValid}
              style={styles.registerButton}
            />
          </View>

          {/* 底部登录引导 */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>已有账号？</Text>
            <Pressable onPress={goBack}>
              <Text style={styles.footerLink}>立即登录</Text>
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
  backButton: {
    alignSelf: 'flex-start',
    padding: AuthSpacing.spacing.sm,
    marginLeft: -AuthSpacing.spacing.sm,
    marginBottom: AuthSpacing.spacing.md,
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
  registerButton: {
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
