/**
 * Token 存储服务 - 平台兼容实现
 * Web 环境使用 localStorage，原生环境使用 FileSystem(JSON 文件)
 */

import { Platform } from 'react-native';

import { authDebug, authWarn } from '@/utils/authDebug';

// 延迟加载 FileSystem，避免 Web 环境初始化问题
let FileSystem: typeof import('expo-file-system/legacy') | null = null;

type StorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

const TOKEN_KEY = 'auth_token';
const TOKEN_SAVED_AT_KEY = 'auth_token_saved_at';
const USER_ID_KEY = 'user_id';
const DEVICE_ID_KEY = 'device_id';
const EMAIL_KEY = 'user_email';

const NATIVE_STORAGE_DIR = 'app-storage';
const NATIVE_STORAGE_FILE = 'token-storage.json';

function sanitizeValue(key: string, value: string | null): string {
  if (value === null) {
    return 'null';
  }
  if (key === TOKEN_KEY) {
    return `token(len=${value.length})`;
  }
  if (key === TOKEN_SAVED_AT_KEY) {
    return value;
  }
  return `set(len=${value.length})`;
}

// Web 环境使用 localStorage
const webStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const value = localStorage.getItem(key) || null;
      authDebug('webStorage.getItem', { key, value: sanitizeValue(key, value) });
      return value;
    } catch (error) {
      authWarn('webStorage.getItem failed', { key, error: String(error) });
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      localStorage.setItem(key, value);
      authDebug('webStorage.setItem', { key, value: sanitizeValue(key, value) });
    } catch (error) {
      authWarn('webStorage.setItem failed', { key, error: String(error) });
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      localStorage.removeItem(key);
      authDebug('webStorage.removeItem', { key });
    } catch (error) {
      authWarn('webStorage.removeItem failed', { key, error: String(error) });
    }
  },
};

async function getFileSystem() {
  if (!FileSystem) {
    const module = await import('expo-file-system/legacy');
    FileSystem = module;
  }
  return FileSystem;
}

type NativeKv = Record<string, string>;

type ErrorCallback = (error: Error) => void;

let nativeKvCache: NativeKv | null = null;
let nativeKvLoadPromise: Promise<NativeKv> | null = null;
let nativeKvWriteChain: Promise<void> = Promise.resolve();
let nativePaths: { dir: string; path: string } | null = null;
let errorCallback: ErrorCallback | null = null;

async function getNativePaths(): Promise<{ dir: string; path: string }> {
  if (nativePaths) {
    return nativePaths;
  }
  const fs = await getFileSystem();
  const baseDir = fs.documentDirectory ?? fs.cacheDirectory;
  if (!baseDir) {
    throw new Error('No FileSystem base directory available for token storage');
  }
  const dir = `${baseDir}${NATIVE_STORAGE_DIR}/`;
  const path = `${dir}${NATIVE_STORAGE_FILE}`;
  nativePaths = { dir, path };
  authDebug('nativeStorage.paths', { dir, path });
  return nativePaths;
}

async function ensureNativeDir(): Promise<void> {
  const fs = await getFileSystem();
  const { dir } = await getNativePaths();
  const info = await fs.getInfoAsync(dir);
  if (!info.exists) {
    await fs.makeDirectoryAsync(dir, { intermediates: true });
    authDebug('nativeStorage.ensureDir created', { dir });
  }
}

async function loadNativeKv(): Promise<NativeKv> {
  try {
    const fs = await getFileSystem();
    await ensureNativeDir();
    const { path } = await getNativePaths();
    const info = await fs.getInfoAsync(path);
    if (!info.exists) {
      authDebug('nativeStorage.load file missing', { path });
      return {};
    }
    const raw = await fs.readAsStringAsync(path);
    if (!raw) {
      authDebug('nativeStorage.load empty file', { path });
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      authWarn('nativeStorage.load invalid json shape', { path });
      return {};
    }
    const obj = parsed as Record<string, unknown>;
    const kv: NativeKv = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string') {
        kv[k] = v;
      }
    }
    authDebug('nativeStorage.load success', { keys: Object.keys(kv) });
    return kv;
  } catch (error) {
    authWarn('nativeStorage.load failed', { error: String(error) });
    return {};
  }
}

async function ensureNativeKvCache(): Promise<NativeKv> {
  if (nativeKvCache) {
    return nativeKvCache;
  }
  if (nativeKvLoadPromise) {
    return nativeKvLoadPromise;
  }
  nativeKvLoadPromise = (async () => {
    const kv = await loadNativeKv();
    nativeKvCache = kv;
    nativeKvLoadPromise = null;
    return kv;
  })();
  return nativeKvLoadPromise;
}

async function writeNativeKvFile(kv: NativeKv): Promise<void> {
  const fs = await getFileSystem();
  const { path } = await getNativePaths();

  let retries = 3;
  let lastError: unknown = null;

  while (retries > 0) {
    try {
      await ensureNativeDir();
      const data = JSON.stringify(kv);
      await fs.writeAsStringAsync(path, data);
      authDebug('nativeStorage.write success', { path, keys: Object.keys(kv) });
      return;
    } catch (error) {
      lastError = error;
      retries -= 1;
      authWarn('nativeStorage.write retry', { retriesLeft: retries, error: String(error) });
      if (retries > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
  }

  const error = new Error(
    `[TokenStorage] failed to persist token after retries: ${String(lastError)}`,
  );
  if (errorCallback) {
    errorCallback(error);
  }
  throw error;
}

function queueNativeWrite(): Promise<void> {
  nativeKvWriteChain = nativeKvWriteChain
    .catch(() => undefined)
    .then(async () => {
      if (!nativeKvCache) {
        return;
      }
      await writeNativeKvFile(nativeKvCache);
    });
  return nativeKvWriteChain;
}

const nativeStorage: StorageLike = {
  async getItem(key: string): Promise<string | null> {
    const kv = await ensureNativeKvCache();
    const value = kv[key];
    const normalizedValue = typeof value === 'string' ? value : null;
    authDebug('nativeStorage.getItem', { key, value: sanitizeValue(key, normalizedValue) });
    return normalizedValue;
  },
  async setItem(key: string, value: string): Promise<void> {
    const kv = await ensureNativeKvCache();
    kv[key] = String(value);
    nativeKvCache = kv;
    authDebug('nativeStorage.setItem', { key, value: sanitizeValue(key, value) });
    await queueNativeWrite();
  },
  async removeItem(key: string): Promise<void> {
    const kv = await ensureNativeKvCache();
    delete kv[key];
    nativeKvCache = kv;
    authDebug('nativeStorage.removeItem', { key });
    await queueNativeWrite();
  },
};

function getStorage(): StorageLike {
  return Platform.OS === 'web' ? (webStorage as StorageLike) : nativeStorage;
}

export const tokenStorage = {
  setErrorCallback(callback: ErrorCallback | null): void {
    errorCallback = callback;
  },
  async saveToken(token: string): Promise<void> {
    const storage = await getStorage();
    authDebug('tokenStorage.saveToken start', { tokenLength: token.length });
    await storage.setItem(TOKEN_KEY, token);
    await storage.setItem(TOKEN_SAVED_AT_KEY, String(Date.now()));
    authDebug('tokenStorage.saveToken done');
  },
  async getToken(): Promise<string | null> {
    const storage = await getStorage();
    const token = await storage.getItem(TOKEN_KEY);
    authDebug('tokenStorage.getToken', { hasToken: Boolean(token) });
    return token;
  },
  async getTokenSavedAt(): Promise<number | null> {
    const storage = await getStorage();
    const raw = await storage.getItem(TOKEN_SAVED_AT_KEY);
    if (!raw) {
      authDebug('tokenStorage.getTokenSavedAt', { raw: null, parsed: null });
      return null;
    }
    const parsed = Number(raw);
    const value = Number.isFinite(parsed) ? parsed : null;
    authDebug('tokenStorage.getTokenSavedAt', { raw, parsed: value });
    return value;
  },
  async touchTokenSavedAt(): Promise<void> {
    const token = await this.getToken();
    if (!token) {
      authDebug('tokenStorage.touchTokenSavedAt skipped', { reason: 'no_token' });
      return;
    }
    const storage = await getStorage();
    await storage.setItem(TOKEN_SAVED_AT_KEY, String(Date.now()));
    authDebug('tokenStorage.touchTokenSavedAt updated');
  },
  async removeToken(): Promise<void> {
    const storage = await getStorage();
    await storage.removeItem(TOKEN_KEY);
    await storage.removeItem(TOKEN_SAVED_AT_KEY);
    authDebug('tokenStorage.removeToken done');
  },
  async saveUserId(userId: string): Promise<void> {
    const storage = await getStorage();
    await storage.setItem(USER_ID_KEY, userId);
    authDebug('tokenStorage.saveUserId', { hasUserId: Boolean(userId) });
  },
  async getUserId(): Promise<string | null> {
    const storage = await getStorage();
    const userId = await storage.getItem(USER_ID_KEY);
    authDebug('tokenStorage.getUserId', { hasUserId: Boolean(userId) });
    return userId;
  },
  async removeUserId(): Promise<void> {
    const storage = await getStorage();
    await storage.removeItem(USER_ID_KEY);
    authDebug('tokenStorage.removeUserId done');
  },
  async saveDeviceId(deviceId: string): Promise<void> {
    const storage = await getStorage();
    await storage.setItem(DEVICE_ID_KEY, deviceId);
    authDebug('tokenStorage.saveDeviceId', { hasDeviceId: Boolean(deviceId) });
  },
  async getDeviceId(): Promise<string | null> {
    const storage = await getStorage();
    const deviceId = await storage.getItem(DEVICE_ID_KEY);
    authDebug('tokenStorage.getDeviceId', { hasDeviceId: Boolean(deviceId) });
    return deviceId;
  },
  async removeDeviceId(): Promise<void> {
    const storage = await getStorage();
    await storage.removeItem(DEVICE_ID_KEY);
    authDebug('tokenStorage.removeDeviceId done');
  },
  async saveEmail(email: string): Promise<void> {
    const storage = await getStorage();
    await storage.setItem(EMAIL_KEY, email);
    authDebug('tokenStorage.saveEmail', { hasEmail: Boolean(email) });
  },
  async getEmail(): Promise<string | null> {
    const storage = await getStorage();
    const email = await storage.getItem(EMAIL_KEY);
    authDebug('tokenStorage.getEmail', { hasEmail: Boolean(email) });
    return email;
  },
  async removeEmail(): Promise<void> {
    const storage = await getStorage();
    await storage.removeItem(EMAIL_KEY);
    authDebug('tokenStorage.removeEmail done');
  },
  async clearAll(): Promise<void> {
    const storage = await getStorage();
    await storage.removeItem(TOKEN_KEY);
    await storage.removeItem(TOKEN_SAVED_AT_KEY);
    await storage.removeItem(USER_ID_KEY);
    await storage.removeItem(DEVICE_ID_KEY);
    await storage.removeItem(EMAIL_KEY);
    authDebug('tokenStorage.clearAll done');
  },
};
