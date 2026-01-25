/**
 * 认证页面按钮组件
 * 支持加载状态、禁用状态、按压动画
 */

import React, { useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  Animated,
  GestureResponderEvent,
} from 'react-native';

import { AuthColors, AuthSpacing, AuthTypography, AuthAnimations } from '@/constants';

export interface AuthButtonProps {
  title: string;
  onPress?: (e: GestureResponderEvent) => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'outline';
  fullWidth?: boolean;
  style?: object;
}

export const AuthButton: React.FC<AuthButtonProps> = ({
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = 'primary',
  fullWidth = true,
  style,
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (!disabled && !loading) {
      Animated.spring(scaleAnim, {
        toValue: 0.97,
        useNativeDriver: true,
        ...AuthAnimations.spring.gentle,
      }).start();
    }
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      ...AuthAnimations.spring.gentle,
    }).start();
  };

  const getBackgroundColor = () => {
    if (disabled || loading) {
      return variant === 'outline' ? 'transparent' : AuthColors.textTertiary;
    }
    return variant === 'outline' ? 'transparent' : AuthColors.primary;
  };

  const getTextColor = () => {
    if (variant === 'outline') {
      return disabled || loading ? AuthColors.textTertiary : AuthColors.primary;
    }
    return AuthColors.cardBackground;
  };

  const getBorderColor = () => {
    if (variant === 'outline') {
      return disabled || loading ? AuthColors.textTertiary : AuthColors.primary;
    }
    return 'transparent';
  };

  return (
    <Animated.View
      style={[
        styles.container,
        fullWidth && styles.fullWidth,
        { transform: [{ scale: scaleAnim }] },
        style,
      ]}
    >
      <Pressable
        style={[
          styles.button,
          {
            backgroundColor: getBackgroundColor(),
            borderColor: getBorderColor(),
          },
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
      >
        {loading ? (
          <ActivityIndicator
            size="small"
            color={getTextColor()}
            style={styles.indicator}
          />
        ) : (
          <Text style={[styles.text, { color: getTextColor() }]}>{title}</Text>
        )}
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignSelf: 'flex-start',
  },
  fullWidth: {
    width: '100%',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: AuthSpacing.padding.buttonHorizontal,
    paddingVertical: AuthSpacing.padding.buttonVertical,
    borderRadius: AuthSpacing.radius.lg,
    borderWidth: AuthSpacing.border.thin,
    minHeight: 50,
  },
  text: {
    fontSize: AuthTypography.fontSize.button,
    fontWeight: AuthTypography.fontWeight.semibold,
    textAlign: 'center',
  },
  indicator: {
    padding: 4,
  },
});
