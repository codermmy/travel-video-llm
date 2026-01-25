/**
 * 认证页面输入框组件
 * 支持浮动标签、密码可见性切换、错误提示
 */

import React, { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  Animated,
  Text,
} from 'react-native';
import { Eye, EyeOff } from 'lucide-react-native';

import { AuthColors, AuthSpacing, AuthTypography } from '@/constants';

// 图标尺寸常量
const ICON_SIZE = { md: 24 } as const;

export interface AuthInputProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | null;
  isPassword?: boolean;
  containerStyle?: object;
}

export const AuthInput: React.FC<AuthInputProps> = ({
  label,
  error,
  isPassword = false,
  containerStyle,
  value,
  onFocus,
  onBlur,
  ...textInputProps
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [hasValue, setHasValue] = useState(Boolean(value));

  // 浮动标签动画
  const labelAnim = React.useRef(
    new Animated.Value(hasValue || isFocused ? 1 : 0),
  ).current;

  const isPasswordField = isPassword;

  const togglePasswordVisibility = () => {
    setIsPasswordVisible((prev) => !prev);
  };

  const handleFocus = (e: any) => {
    setIsFocused(true);
    onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    setIsFocused(false);
    onBlur?.(e);
  };

  const handleChange = (text: string) => {
    const newValue = text.length > 0;
    if (newValue !== hasValue) {
      setHasValue(newValue);
    }
  };

  React.useEffect(() => {
    Animated.timing(labelAnim, {
      toValue: hasValue || isFocused ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [hasValue, isFocused, labelAnim]);

  const labelTop = labelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [AuthSpacing.padding.inputVertical, -8],
  });

  const labelFontSize = labelAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [AuthTypography.fontSize.input, AuthTypography.fontSize.caption],
  });

  const labelColor = error
    ? AuthColors.inputBorderError
    : isFocused
      ? AuthColors.inputBorderFocused
      : AuthColors.textTertiary;

  const borderColor = error
    ? AuthColors.inputBorderError
    : isFocused
      ? AuthColors.inputBorderFocused
      : AuthColors.inputBorder;

  return (
    <View style={[styles.container, containerStyle]}>
      <View
        style={[
          styles.inputWrapper,
          { borderColor },
        ]}
      >
        <View style={styles.inputContainer}>
          <Animated.Text
            style={[
              styles.label,
              {
                top: labelTop,
                fontSize: labelFontSize,
                color: labelColor,
              },
            ]}
          >
            {label}
          </Animated.Text>
          <TextInput
            style={[
              styles.input,
              isPasswordField && styles.inputWithPadding,
              { color: AuthColors.textPrimary },
            ]}
            value={value}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onChangeText={handleChange}
            secureTextEntry={isPasswordField && !isPasswordVisible}
            placeholder=""
            placeholderTextColor={AuthColors.textTertiary}
            selectionColor={AuthColors.primary}
            {...textInputProps}
          />
        </View>
        {isPasswordField && (
          <Pressable
            style={styles.eyeIcon}
            onPress={togglePasswordVisibility}
            hitSlop={8}
          >
            {isPasswordVisible ? (
              <EyeOff size={ICON_SIZE.md} color={AuthColors.textSecondary} />
            ) : (
              <Eye size={ICON_SIZE.md} color={AuthColors.textSecondary} />
            )}
          </Pressable>
        )}
      </View>
      {error && (
        <Animated.Text style={styles.errorText}>
          {error}
        </Animated.Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: AuthSpacing.margin.inputBottom,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: AuthSpacing.border.thin,
    borderRadius: AuthSpacing.radius.md,
    paddingHorizontal: AuthSpacing.padding.inputHorizontal,
    minHeight: 52,
  },
  inputContainer: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
  },
  label: {
    position: 'absolute',
    left: 0,
    backgroundColor: AuthColors.cardBackground,
    paddingHorizontal: 4,
    fontWeight: '500',
  },
  input: {
    fontSize: AuthTypography.fontSize.input,
    paddingTop: AuthSpacing.padding.inputVertical + 4,
    paddingBottom: AuthSpacing.padding.inputVertical,
    minHeight: 52,
  },
  inputWithPadding: {
    paddingRight: 36,
  },
  eyeIcon: {
    padding: 8,
    position: 'absolute',
    right: 4,
  },
  errorText: {
    fontSize: AuthTypography.fontSize.error,
    color: AuthColors.error,
    marginTop: AuthSpacing.margin.errorTop,
    marginLeft: 4,
  },
});
