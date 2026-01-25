/**
 * OAuth 登录按钮组件
 * 预留用于未来的第三方登录（微信、Apple 等）
 */

import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  GestureResponderEvent,
} from 'react-native';

import { AuthColors, AuthSpacing, AuthTypography } from '@/constants';

export interface OAuthButtonProps {
  icon: React.ReactNode;
  title: string;
  onPress?: (e: GestureResponderEvent) => void;
  disabled?: boolean;
  style?: object;
}

export const OAuthButton: React.FC<OAuthButtonProps> = ({
  icon,
  title,
  onPress,
  disabled = false,
  style,
}) => {
  return (
    <Pressable
      style={[styles.container, disabled && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled}
    >
      <View style={styles.iconContainer}>{icon}</View>
      <Text style={styles.text}>{title}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: AuthSpacing.padding.buttonHorizontal,
    paddingVertical: AuthSpacing.padding.buttonVertical,
    borderRadius: AuthSpacing.radius.lg,
    borderWidth: AuthSpacing.border.thin,
    borderColor: AuthColors.divider,
    backgroundColor: AuthColors.cardBackground,
    minHeight: 50,
  },
  disabled: {
    opacity: 0.5,
  },
  iconContainer: {
    marginRight: AuthSpacing.spacing.sm,
  },
  text: {
    fontSize: AuthTypography.fontSize.button,
    fontWeight: AuthTypography.fontWeight.medium,
    color: AuthColors.textPrimary,
  },
});
