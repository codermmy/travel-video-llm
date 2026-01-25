export const THUMBNAIL_CONFIG = {
  WIDTH: 1080,
  QUALITY: 0.8,
  FORMAT: 'jpeg' as const,
  MAX_SIZE: 300 * 1024,
  TARGET_SIZE: 200 * 1024,
} as const;

export const FILE_SIZE_UNITS = {
  KB: 1024,
  MB: 1024 * 1024,
  GB: 1024 * 1024 * 1024,
} as const;

export const API_CONFIG = {
  BASE_URL: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000',
  TIMEOUT: 30000,
} as const;

export const UPLOAD_LIMITS = {
  MAX_BATCH_SIZE: 50,
  MAX_HASH_CHECK: 1000,
  MAX_FILE_SIZE: 10 * 1024 * 1024,
} as const;
