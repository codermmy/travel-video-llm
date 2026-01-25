/**
 * 认证页面背景组件
 * 提供温暖的渐变背景
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { AuthColors } from '@/constants';

export interface AuthBackgroundProps {
  children: React.ReactNode;
  style?: object;
}

export const AuthBackground: React.FC<AuthBackgroundProps> = ({
  children,
  style,
}) => {
  return (
    <LinearGradient
      style={[styles.container, style]}
      colors={[AuthColors.gradientStart, AuthColors.gradientEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      {children}
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
