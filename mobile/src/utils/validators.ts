/**
 * 通用验证工具函数
 */

/**
 * 验证邮箱格式
 * @param email 待验证的邮箱地址
 * @returns 是否有效
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
}

/**
 * 获取邮箱验证错误消息
 * @param email 待验证的邮箱地址
 * @returns 错误消息，无错误返回 null
 */
export function getEmailError(email: string): string | null {
  if (!email) {
    return '请输入邮箱地址';
  }
  if (!isValidEmail(email)) {
    return '邮箱格式不正确';
  }
  return null;
}

/**
 * 验证密码强度
 * @param password 待验证的密码
 * @returns 是否符合基本强度要求
 */
export function isValidPassword(password: string): boolean {
  if (!password || password.length < 8) {
    return false;
  }
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const noSpaces = !/\s/.test(password);
  return hasLetter && hasDigit && noSpaces;
}

/**
 * 获取密码验证错误消息
 * @param password 待验证的密码
 * @returns 错误消息，无错误返回 null
 */
export function getPasswordError(password: string): string | null {
  if (!password) {
    return '请输入密码';
  }
  if (password.length < 8) {
    return '密码至少需要 8 位';
  }
  if (!/[a-zA-Z]/.test(password)) {
    return '密码必须包含字母';
  }
  if (!/\d/.test(password)) {
    return '密码必须包含数字';
  }
  if (/\s/.test(password)) {
    return '密码不能包含空格';
  }
  return null;
}

/**
 * 验证两次密码是否一致
 * @param password 原密码
 * @param confirmPassword 确认密码
 * @returns 是否一致
 */
export function isPasswordMatch(password: string, confirmPassword: string): boolean {
  return password === confirmPassword && password.length > 0;
}

/**
 * 获取确认密码错误消息
 * @param password 原密码
 * @param confirmPassword 确认密码
 * @returns 错误消息，无错误返回 null
 */
export function getConfirmPasswordError(
  password: string,
  confirmPassword: string,
): string | null {
  if (!confirmPassword) {
    return '请再次输入密码';
  }
  if (!isPasswordMatch(password, confirmPassword)) {
    return '两次输入的密码不一致';
  }
  return null;
}
