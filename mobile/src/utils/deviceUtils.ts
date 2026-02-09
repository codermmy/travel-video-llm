/**
 * 设备工具 - 平台兼容实现
 * Web 环境使用 localStorage，原生环境使用 FileSystem(文本文件)
 */

import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';

// 延迟加载 FileSystem，避免 Web 环境初始化问题
let FileSystem: typeof import('expo-file-system/legacy') | null = null;

const DEVICE_ID_KEY = 'travel_album_device_id';

const NATIVE_STORAGE_DIR = 'app-storage';
const NATIVE_DEVICE_ID_FILE = 'device-id.txt';

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
};

async function getFileSystem() {
  if (!FileSystem) {
    const module = await import('expo-file-system/legacy');
    FileSystem = module;
  }
  return FileSystem;
}

let nativePaths: { dir: string; path: string } | null = null;
let cachedDeviceId: string | null | undefined = undefined;
let inFlight: Promise<string> | null = null;

async function getNativePaths(): Promise<{ dir: string; path: string }> {
  if (nativePaths) {
    return nativePaths;
  }
  const fs = await getFileSystem();
  const baseDir = fs.documentDirectory ?? fs.cacheDirectory;
  if (!baseDir) {
    throw new Error('No FileSystem base directory available for device id');
  }
  const dir = `${baseDir}${NATIVE_STORAGE_DIR}/`;
  const path = `${dir}${NATIVE_DEVICE_ID_FILE}`;
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

async function readNativeDeviceId(): Promise<string | null> {
  try {
    const fs = await getFileSystem();
    await ensureNativeDir();
    const { path } = await getNativePaths();
    const info = await fs.getInfoAsync(path);
    if (!info.exists) {
      return null;
    }
    const raw = await fs.readAsStringAsync(path);
    const value = (raw ?? '').trim();
    return value.length > 0 ? value : null;
  } catch (e) {
    console.warn('Failed to read device id:', e);
    return null;
  }
}

async function writeNativeDeviceId(value: string): Promise<void> {
  try {
    const fs = await getFileSystem();
    await ensureNativeDir();
    const { path } = await getNativePaths();
    await fs.writeAsStringAsync(path, value);
  } catch (e) {
    console.warn('Failed to write device id:', e);
  }
}

export async function getDeviceId(): Promise<string> {
  if (Platform.OS === 'web') {
    const existing = await webStorage.getItem(DEVICE_ID_KEY);
    if (existing) {
      return existing;
    }
    const newId = Crypto.randomUUID();
    await webStorage.setItem(DEVICE_ID_KEY, newId);
    return newId;
  }

  if (cachedDeviceId) {
    return cachedDeviceId;
  }
  if (inFlight) {
    return inFlight;
  }

  inFlight = (async () => {
    if (cachedDeviceId) {
      return cachedDeviceId;
    }

    const existing = await readNativeDeviceId();
    if (existing) {
      cachedDeviceId = existing;
      return existing;
    }

    const newId = Crypto.randomUUID();
    await writeNativeDeviceId(newId);
    cachedDeviceId = newId;
    return newId;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
}

export type DeviceInfo = {
  deviceName: string;
  deviceType: string;
  osName: string;
  osVersion: string;
  modelName: string | null;
};

export async function getDeviceInfo(): Promise<DeviceInfo> {
  return {
    deviceName: Device.deviceName ?? 'Unknown',
    deviceType: Device.deviceType ? String(Device.deviceType) : 'unknown',
    osName: Device.osName ?? 'unknown',
    osVersion: Device.osVersion ?? 'unknown',
    modelName: Device.modelName ?? null,
  };
}
