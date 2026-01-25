/**
 * 密码强度指示器组件
 * 显示密码强度进度条和提示
 */

import React from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';

import { getPasswordStrengthInfo } from '@/utils/password';
import { AuthColors, AuthSpacing, AuthTypography, AuthAnimations } from '@/constants';

export interface PasswordStrengthProps {
  password: string;
  style?: object;
}

export const PasswordStrength: React.FC<PasswordStrengthProps> = ({
  password,
  style,
}) => {
  const strengthInfo = getPasswordStrengthInfo(password);

  // 进度条宽度动画
  const progressAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: strengthInfo.score,
      duration: AuthAnimations.duration.normal,
      useNativeDriver: false,
    }).start();
  }, [strengthInfo.score, progressAnim]);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  // 没有输入时不显示
  if (!password) {
    return null;
  }

  return (
    <View style={[styles.container, style]}>
      <View style={styles.header}>
        <Text style={styles.label}>密码强度</Text>
        <Text style={[styles.label, { color: strengthInfo.color }]}>
          {strengthInfo.label}
        </Text>
      </View>
      <View style={styles.progressBar}>
        <View style={styles.progressBackground}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: progressWidth,
                backgroundColor: strengthInfo.color,
              },
            ]}
          />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginTop: AuthSpacing.spacing.sm,
    marginBottom: AuthSpacing.spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: AuthSpacing.spacing.xs,
  },
  label: {
    fontSize: AuthTypography.fontSize.caption,
    fontWeight: AuthTypography.fontWeight.medium,
    color: AuthColors.textSecondary,
  },
  progressBar: {
    height: 6,
  },
  progressBackground: {
    flex: 1,
    height: '100%',
    backgroundColor: AuthColors.textTertiary,
    borderRadius: AuthSpacing.radius.full,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: AuthSpacing.radius.full,
  },
});
