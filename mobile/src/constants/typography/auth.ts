/**
 * 认证页面排版常量
 */

// 字体大小
export const FONT_SIZE = {
  heroTitle: 32,
  heroSubtitle: 16,
  title: 24,
  subtitle: 14,
  body: 16,
  caption: 12,
  label: 14,
  input: 16,
  button: 16,
  error: 12,
} as const;

// 字重
export const FONT_WEIGHT = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
} as const;

// 行高
export const LINE_HEIGHT = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.8,
} as const;

// 字母间距
export const LETTER_SPACING = {
  tight: -0.5,
  normal: 0,
  wide: 0.5,
} as const;

export const AuthTypography = {
  fontSize: FONT_SIZE,
  fontWeight: FONT_WEIGHT,
  lineHeight: LINE_HEIGHT,
  letterSpacing: LETTER_SPACING,
} as const;
