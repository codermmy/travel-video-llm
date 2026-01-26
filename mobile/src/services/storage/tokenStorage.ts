/**
 * Token 存储服务 - 平台兼容实现
 * Web 环境使用 localStorage，原生环境使用 AsyncStorage
 */

import { Platform } from 'react-native';

// 延迟加载 AsyncStorage，避免 Web 环境初始化问题
let AsyncStorage: typeof import('@react-native-async-storage/async-storage').default | null = null;

const TOKEN_KEY = 'auth_token';
const TOKEN_SAVED_AT_KEY = 'auth_token_saved_at';
const USER_ID_KEY = 'user_id';
const DEVICE_ID_KEY = 'device_id';
const EMAIL_KEY = 'user_email';

// Web 环境使用 localStorage
const webStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      return localStorage.getItem(key) || null;
    } catch {
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn('Failed to save to localStorage:', e);
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.warn('Failed to remove from localStorage:', e);
    }
  },
};

// 获取正确的 storage 实现
async function getStorage() {
  if (Platform.OS === 'web') {
    return webStorage;
  }
  // 原生环境延迟加载 AsyncStorage
  if (!AsyncStorage) {
    const module = await import('@react-native-async-storage/async-storage');
    AsyncStorage = module.default;
  }
  return AsyncStorage;
}

export const tokenStorage = {
  async saveToken(token: string): Promise<void> {
    const storage = await getStorage();
    await Promise.all([
      storage.setItem(TOKEN_KEY, token),
      storage.setItem(TOKEN_SAVED_AT_KEY, String(Date.now())),
    ]);
  },
  async getToken(): Promise<string | null> {
    const storage = await getStorage();
    return storage.getItem(TOKEN_KEY);
  },
  async getTokenSavedAt(): Promise<number | null> {
    const storage = await getStorage();
    const raw = await storage.getItem(TOKEN_SAVED_AT_KEY);
    if (!raw) {
      return null;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  },
  async touchTokenSavedAt(): Promise<void> {
    const storage = await getStorage();
    await storage.setItem(TOKEN_SAVED_AT_KEY, String(Date.now()));
  },
  async removeToken(): Promise<void> {
    const storage = await getStorage();
    await Promise.all([
      storage.removeItem(TOKEN_KEY),
      storage.removeItem(TOKEN_SAVED_AT_KEY),
    ]);
  },
  async saveUserId(userId: string): Promise<void> {
    const storage = await getStorage();
    await storage.setItem(USER_ID_KEY, userId);
  },
  async getUserId(): Promise<string | null> {
    const storage = await getStorage();
    return storage.getItem(USER_ID_KEY);
  },
  async removeUserId(): Promise<void> {
    const storage = await getStorage();
    await storage.removeItem(USER_ID_KEY);
  },
  async saveDeviceId(deviceId: string): Promise<void> {
    const storage = await getStorage();
    await storage.setItem(DEVICE_ID_KEY, deviceId);
  },
  async getDeviceId(): Promise<string | null> {
    const storage = await getStorage();
    return storage.getItem(DEVICE_ID_KEY);
  },
  async removeDeviceId(): Promise<void> {
    const storage = await getStorage();
    await storage.removeItem(DEVICE_ID_KEY);
  },
  async saveEmail(email: string): Promise<void> {
    const storage = await getStorage();
    await storage.setItem(EMAIL_KEY, email);
  },
  async getEmail(): Promise<string | null> {
    const storage = await getStorage();
    return storage.getItem(EMAIL_KEY);
  },
  async removeEmail(): Promise<void> {
    const storage = await getStorage();
    await storage.removeItem(EMAIL_KEY);
  },
  async clearAll(): Promise<void> {
    const storage = await getStorage();
    await Promise.all([
      storage.removeItem(TOKEN_KEY),
      storage.removeItem(TOKEN_SAVED_AT_KEY),
      storage.removeItem(USER_ID_KEY),
      storage.removeItem(DEVICE_ID_KEY),
      storage.removeItem(EMAIL_KEY),
    ]);
  },
};
