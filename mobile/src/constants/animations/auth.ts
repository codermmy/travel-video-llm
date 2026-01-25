/**
 * 认证页面动画常量
 */

import { Easing } from 'react-native';

// 动画时长（毫秒）
export const DURATION = {
  instant: 0,
  fast: 150,
  normal: 250,
  slow: 350,
  slower: 500,
} as const;

// 缓动函数
export const EASING = {
  ease: Easing.ease,
  in: Easing.in(Easing.ease),
  out: Easing.out(Easing.ease),
  inOut: Easing.inOut(Easing.ease),
  bounce: Easing.out(Easing.bounce),
} as const;

// 弹簧配置
export const SPRING = {
  gentle: {
    damping: 12,
    mass: 1,
    stiffness: 200,
  },
  bouncy: {
    damping: 8,
    mass: 1,
    stiffness: 400,
  },
  firm: {
    damping: 20,
    mass: 1,
    stiffness: 300,
  },
} as const;

export const AuthAnimations = {
  duration: DURATION,
  easing: EASING,
  spring: SPRING,
} as const;
