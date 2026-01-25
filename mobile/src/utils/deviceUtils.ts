/**
 * 设备工具 - 平台兼容实现
 * Web 环境使用 localStorage，原生环境使用 AsyncStorage
 */

import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as Device from 'expo-device';

// 延迟加载 AsyncStorage
let AsyncStorage: typeof import('@react-native-async-storage/async-storage').default | null = null;

const DEVICE_ID_KEY = 'travel_album_device_id';

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

// 获取正确的 storage 实现
async function getStorage() {
  if (Platform.OS === 'web') {
    return webStorage;
  }
  if (!AsyncStorage) {
    const module = await import('@react-native-async-storage/async-storage');
    AsyncStorage = module.default;
  }
  return AsyncStorage;
}

export async function getDeviceId(): Promise<string> {
  const storage = await getStorage();
  const existing = await storage.getItem(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }
  const newId = Crypto.randomUUID();
  await storage.setItem(DEVICE_ID_KEY, newId);
  return newId;
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
