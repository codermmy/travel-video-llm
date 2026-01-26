/**
 * 认证页面色彩常量
 * "Organic Explorer" - 温暖探索风格
 */

// 渐变色 - 日出效果
export const SUNRISE_START = '#FF8C42'; // 琥珀橙
export const SUNRISE_END = '#4A90D9'; // 晨空蓝

// 背景色
export const BACKGROUND = '#F8F6F3'; // 暖米白
export const CARD_BACKGROUND = '#FFFFFF';

// 文字颜色
export const TEXT_PRIMARY = '#2C3E50';
export const TEXT_SECONDARY = '#7F8C8D';
export const TEXT_TERTIARY = '#BDC3C7';

// 状态颜色
export const PRIMARY = '#4A90D9'; // 主按钮 - 晨空蓝
export const PRIMARY_PRESSED = '#3A7BC8';
export const SUCCESS = '#27AE60';
export const WARNING = '#F39C12';
export const ERROR = '#E57373'; // 柔和红
export const ERROR_LIGHT = '#FFCDD2';

// 输入框状态
export const INPUT_BORDER = '#E0E0E0';
export const INPUT_BORDER_FOCUSED = '#4A90D9';
export const INPUT_BORDER_ERROR = '#E57373';

// 密码强度指示器颜色
export const STRENGTH_WEAK = '#E74C3C';
export const STRENGTH_MEDIUM = '#F39C12';
export const STRENGTH_STRONG = '#27AE60';

// 分割线颜色
export const DIVIDER = '#E0E0E0';

// 遮罩层
export const OVERLAY = 'rgba(0, 0, 0, 0.4)';

export const AuthColors = {
  gradientStart: SUNRISE_START,
  gradientEnd: SUNRISE_END,
  background: BACKGROUND,
  cardBackground: CARD_BACKGROUND,
  textPrimary: TEXT_PRIMARY,
  textSecondary: TEXT_SECONDARY,
  textTertiary: TEXT_TERTIARY,
  primary: PRIMARY,
  primaryPressed: PRIMARY_PRESSED,
  success: SUCCESS,
  warning: WARNING,
  error: ERROR,
  errorLight: ERROR_LIGHT,
  inputBorder: INPUT_BORDER,
  inputBorderFocused: INPUT_BORDER_FOCUSED,
  inputBorderError: INPUT_BORDER_ERROR,
  divider: DIVIDER,
  overlay: OVERLAY,
} as const;
