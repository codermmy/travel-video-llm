import Constants from 'expo-constants';
import { Platform } from 'react-native';

const LOCALHOST_API = 'http://localhost:8000';
const ANDROID_EMULATOR_API = 'http://10.0.2.2:8000';
const IOS_SIMULATOR_API = 'http://127.0.0.1:8000';

// 优先使用环境变量（支持打包后的 App 配置 API 地址）
const ENV_API_URL = process.env.EXPO_PUBLIC_API_URL?.trim() || null;

function extractHost(input: string | null | undefined): string | null {
  if (!input) {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const normalized = trimmed.includes('://') ? trimmed : `http://${trimmed}`;
    return new URL(normalized).hostname || null;
  } catch {
    const withoutScheme = trimmed.replace(/^[a-z]+:\/\//i, '');
    const host = withoutScheme.split('/')[0]?.split(':')[0]?.trim();
    return host || null;
  }
}

function getDevServerHost(): string | null {
  const legacyManifest = Constants.manifest as { debuggerHost?: string; hostUri?: string } | null;
  return (
    extractHost(Constants.expoConfig?.hostUri) ??
    extractHost(Constants.expoGoConfig?.debuggerHost) ??
    extractHost(legacyManifest?.hostUri) ??
    extractHost(legacyManifest?.debuggerHost) ??
    extractHost(Constants.linkingUri) ??
    extractHost(Constants.experienceUrl)
  );
}

function buildApiUrl(host: string): string {
  return `http://${host}:8000`;
}

function uniqueUrls(items: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const value = item?.trim();
    if (!value || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }

  return result;
}

function resolveApiBaseCandidates(): string[] {
  const devHost = getDevServerHost();
  const devApiBase = devHost ? buildApiUrl(devHost) : null;

  return uniqueUrls([
    ENV_API_URL,
    devApiBase,
    Platform.OS === 'android' ? ANDROID_EMULATOR_API : null,
    Platform.OS === 'ios' ? IOS_SIMULATOR_API : null,
    LOCALHOST_API,
  ]);
}

export const API_BASE_URL_CANDIDATES = resolveApiBaseCandidates();

let activeApiBaseUrl =
  API_BASE_URL_CANDIDATES[0] ??
  (Platform.OS === 'android' ? ANDROID_EMULATOR_API : LOCALHOST_API);

// 优先级：环境变量 > Expo 开发服务器 > localhost
export function getApiBaseUrl(): string {
  return activeApiBaseUrl;
}

export function setApiBaseUrl(nextUrl: string): void {
  activeApiBaseUrl = nextUrl.trim();
}

export function getApiConnectionDebugInfo(): Record<string, unknown> {
  return {
    activeBaseUrl: activeApiBaseUrl,
    candidates: API_BASE_URL_CANDIDATES,
    envApiUrl: ENV_API_URL,
    devServerHost: getDevServerHost(),
    executionEnvironment: Constants.executionEnvironment,
    linkingUri: Constants.linkingUri ?? null,
  };
}
