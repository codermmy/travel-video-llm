/**
 * 认证页面间距常量
 */

// 基础间距单位
export const UNIT = 4;

// 间距值
export const SPACING = {
  xs: UNIT * 1,      // 4
  sm: UNIT * 2,      // 8
  md: UNIT * 3,      // 12
  lg: UNIT * 4,      // 16
  xl: UNIT * 6,      // 24
  xxl: UNIT * 8,     // 32
  xxxl: UNIT * 10,   // 40
} as const;

// 组件内边距
export const PADDING = {
  inputHorizontal: 16,
  inputVertical: 14,
  buttonHorizontal: 24,
  buttonVertical: 14,
  screenHorizontal: 24,
  screenVertical: 32,
  card: 24,
} as const;

// 组件外边距
export const MARGIN = {
  inputBottom: 16,
  buttonTop: 8,
  buttonBottom: 16,
  section: 24,
  errorTop: 6,
} as const;

// 圆角
export const RADIUS = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  full: 9999,
} as const;

// 边框
export const BORDER = {
  thin: 1,
  medium: 2,
  thick: 3,
} as const;

// 图标尺寸
export const ICON_SIZE = {
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
} as const;

export const AuthSpacing = {
  unit: UNIT,
  spacing: SPACING,
  padding: PADDING,
  margin: MARGIN,
  radius: RADIUS,
  border: BORDER,
  iconSize: ICON_SIZE,
} as const;
