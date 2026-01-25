/**
 * 密码强度计算工具
 */

export type PasswordStrength = 'weak' | 'medium' | 'strong';

export interface StrengthInfo {
  level: PasswordStrength;
  score: number; // 0-100
  label: string;
  color: string;
}

/**
 * 计算密码强度分数（0-100）
 * 评估标准：
 * - 长度：最多 30 分
 * - 字符类型：最多 40 分
 * - 复杂度：最多 30 分
 */
export function calculatePasswordStrength(password: string): number {
  if (!password) {
    return 0;
  }

  let score = 0;

  // 1. 长度评分（最多 30 分）
  const length = password.length;
  if (length >= 12) {
    score += 30;
  } else if (length >= 10) {
    score += 20;
  } else if (length >= 8) {
    score += 10;
  }

  // 2. 字符类型评分（最多 40 分）
  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);

  const typeCount = [hasLowercase, hasUppercase, hasDigit, hasSpecial].filter(Boolean).length;
  score += typeCount * 10;

  // 3. 复杂度评分（最多 30 分）
  // 检查是否有连续字符
  const hasSequentialChars = /(abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz|012|123|234|345|456|567|678|789|890)/i.test(
    password,
  );
  if (!hasSequentialChars) {
    score += 10;
  }

  // 检查是否有重复字符
  const hasRepeatedChars = /(.)\1{2,}/.test(password);
  if (!hasRepeatedChars) {
    score += 10;
  }

  // 长度大于等于 12 且包含多种字符类型
  if (length >= 12 && typeCount >= 3) {
    score += 10;
  }

  return Math.min(score, 100);
}

/**
 * 根据分数获取密码强度等级
 */
export function getStrengthLevel(score: number): PasswordStrength {
  if (score < 40) {
    return 'weak';
  }
  if (score < 70) {
    return 'medium';
  }
  return 'strong';
}

/**
 * 获取密码强度详情
 */
export function getPasswordStrengthInfo(password: string): StrengthInfo {
  const score = calculatePasswordStrength(password);
  const level = getStrengthLevel(score);

  const levelMap: Record<PasswordStrength, Omit<StrengthInfo, 'score' | 'level'>> = {
    weak: {
      label: '弱',
      color: '#E74C3C', // 红色
    },
    medium: {
      label: '中',
      color: '#F39C12', // 橙色
    },
    strong: {
      label: '强',
      color: '#27AE60', // 绿色
    },
  };

  return {
    level,
    score,
    ...levelMap[level],
  };
}

/**
 * 获取密码强度建议
 */
export function getPasswordSuggestions(password: string): string[] {
  const suggestions: string[] = [];

  if (!password) {
    return ['请输入密码'];
  }

  if (password.length < 8) {
    suggestions.push('密码至少需要 8 位');
  } else if (password.length < 12) {
    suggestions.push('建议密码长度至少 12 位');
  }

  const hasLowercase = /[a-z]/.test(password);
  const hasUppercase = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);

  if (!hasLowercase) {
    suggestions.push('添加小写字母');
  }
  if (!hasUppercase) {
    suggestions.push('添加大写字母');
  }
  if (!hasDigit) {
    suggestions.push('添加数字');
  }
  if (!hasSpecial) {
    suggestions.push('添加特殊字符');
  }

  // 检查连续字符
  if (/(abc|bcd|123|234)/i.test(password)) {
    suggestions.push('避免连续字符');
  }

  // 检查重复字符
  if (/(.)\1{2,}/.test(password)) {
    suggestions.push('避免重复字符');
  }

  return suggestions;
}
