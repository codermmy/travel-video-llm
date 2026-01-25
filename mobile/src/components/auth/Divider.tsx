/**
 * 分割线组件
 * 用于登录/注册页面的"或"分割
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { AuthColors, AuthSpacing, AuthTypography } from '@/constants';

export interface DividerProps {
  text?: string;
  style?: object;
}

export const Divider: React.FC<DividerProps> = ({
  text = '或',
  style,
}) => {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.line} />
      <Text style={styles.text}>{text}</Text>
      <View style={styles.line} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: AuthSpacing.margin.section,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: AuthColors.divider,
  },
  text: {
    marginHorizontal: AuthSpacing.spacing.lg,
    fontSize: AuthTypography.fontSize.body,
    color: AuthColors.textTertiary,
  },
});
