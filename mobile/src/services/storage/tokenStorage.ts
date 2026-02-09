/**
 * Token 存储服务 - 平台兼容实现
 * Web 环境使用 localStorage，原生环境使用 FileSystem(JSON 文件)
 */

import { Platform } from 'react-native';

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

async function getFileSystem() {
  if (!FileSystem) {
    const module = await import('expo-file-system/legacy');
    FileSystem = module;
  }
  return FileSystem;
}

type NativeKv = Record<string, string>;

let nativeKvCache: NativeKv | null = null;
let nativeKvLoadPromise: Promise<NativeKv> | null = null;
let nativeKvWriteChain: Promise<void> = Promise.resolve();
let nativePaths: { dir: string; path: string } | null = null;

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
  return nativePaths;
}

async function ensureNativeDir(): Promise<void> {
  const fs = await getFileSystem();
  const { dir } = await getNativePaths();
  const info = await fs.getInfoAsync(dir);
  if (!info.exists) {
    await fs.makeDirectoryAsync(dir, { intermediates: true });
  }
}

async function loadNativeKv(): Promise<NativeKv> {
  try {
    const fs = await getFileSystem();
    await ensureNativeDir();
    const { path } = await getNativePaths();
    const info = await fs.getInfoAsync(path);
    if (!info.exists) {
      return {};
    }
    const raw = await fs.readAsStringAsync(path);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    const obj = parsed as Record<string, unknown>;
    const kv: NativeKv = {};
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string') {
        kv[k] = v;
      }
    }
    return kv;
  } catch (e) {
    console.warn('Failed to load token storage file:', e);
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

function queueNativeWrite(): Promise<void> {
  nativeKvWriteChain = nativeKvWriteChain
    .catch(() => undefined)
    .then(async () => {
      try {
        const fs = await getFileSystem();
        await ensureNativeDir();
        const { path } = await getNativePaths();
        const data = JSON.stringify(nativeKvCache ?? {});
        await fs.writeAsStringAsync(path, data);
      } catch (e) {
        console.warn('Failed to persist token storage file:', e);
      }
    });
  return nativeKvWriteChain;
}

const nativeStorage: StorageLike = {
  async getItem(key: string): Promise<string | null> {
    const kv = await ensureNativeKvCache();
    const value = kv[key];
    return typeof value === 'string' ? value : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    const kv = await ensureNativeKvCache();
    kv[key] = String(value);
    nativeKvCache = kv;
    await queueNativeWrite();
  },
  async removeItem(key: string): Promise<void> {
    const kv = await ensureNativeKvCache();
    delete kv[key];
    nativeKvCache = kv;
    await queueNativeWrite();
  },
};

function getStorage(): StorageLike {
  return Platform.OS === 'web' ? (webStorage as StorageLike) : nativeStorage;
}

export const tokenStorage = {
  async saveToken(token: string): Promise<void> {
    const storage = await getStorage();
    await storage.setItem(TOKEN_KEY, token);
    await storage.setItem(TOKEN_SAVED_AT_KEY, String(Date.now()));
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
    await storage.removeItem(TOKEN_KEY);
    await storage.removeItem(TOKEN_SAVED_AT_KEY);
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
    await storage.removeItem(TOKEN_KEY);
    await storage.removeItem(TOKEN_SAVED_AT_KEY);
    await storage.removeItem(USER_ID_KEY);
    await storage.removeItem(DEVICE_ID_KEY);
    await storage.removeItem(EMAIL_KEY);
  },
};
