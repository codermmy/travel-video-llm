/**
 * 日期格式化工具函数
 */

/**
 * 格式化日期范围
 * @param startTime - 开始时间 (ISO string)
 * @param endTime - 结束时间 (ISO string)
 * @returns 格式化的日期范围字符串
 */
export function formatDateRange(startTime: string, endTime: string): string {
  const start = new Date(startTime);
  const end = new Date(endTime);

  const startYear = start.getFullYear();
  const startMonth = start.getMonth() + 1;
  const startDay = start.getDate();
  const endYear = end.getFullYear();
  const endMonth = end.getMonth() + 1;
  const endDay = end.getDate();

  // 同年同月
  if (startYear === endYear && startMonth === endMonth) {
    return `${startYear}年${startMonth}月${startDay}日 - ${endDay}日`;
  }

  // 同年不同月
  if (startYear === endYear) {
    return `${startYear}年${startMonth}月${startDay}日 - ${endMonth}月${endDay}日`;
  }

  // 不同年
  return `${startYear}年${startMonth}月${startDay}日 - ${endYear}年${endMonth}月${endDay}日`;
}

/**
 * 格式化日期时间
 * @param dateTime - 日期时间 (ISO string)
 * @returns 格式化的日期时间字符串
 */
export function formatDateTime(dateTime: string): string {
  const date = new Date(dateTime);
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');

  return `${year}年${month}月${day}日 ${hours}:${minutes}`;
}

/**
 * 格式化时间（仅时分）
 * @param dateTime - 日期时间 (ISO string)
 * @returns 格式化的时间字符串
 */
export function formatTime(dateTime: string): string {
  const date = new Date(dateTime);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');

  return `${hours}:${minutes}`;
}

/**
 * 获取相对时间描述
 * @param dateTime - 日期时间 (ISO string)
 * @returns 相对时间字符串（如"2小时前"）
 */
export function getRelativeTime(dateTime: string): string {
  const date = new Date(dateTime);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) {
    return '刚刚';
  }
  if (diffMins < 60) {
    return `${diffMins}分钟前`;
  }
  if (diffHours < 24) {
    return `${diffHours}小时前`;
  }
  if (diffDays < 7) {
    return `${diffDays}天前`;
  }

  return formatDateTime(dateTime);
}
