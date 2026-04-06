import Constants from 'expo-constants';
import { Platform } from 'react-native';

const LOCALHOST_API = 'http://localhost:8000';
const ANDROID_EMULATOR_API = 'http://10.0.2.2:8000';
const IOS_SIMULATOR_API = 'http://127.0.0.1:8000';

type ExpoExtra = {
  apiBaseUrl?: string;
};

function getExpoExtraApiUrl(): string | null {
  const extra = (Constants.expoConfig?.extra ??
    (Constants as unknown as { manifest2?: { extra?: ExpoExtra } }).manifest2?.extra ??
    null) as ExpoExtra | null;
  return extra?.apiBaseUrl?.trim() || null;
}

// 优先使用环境变量（支持打包后的 App 配置 API 地址）
const ENV_API_URL = process.env.EXPO_PUBLIC_API_URL?.trim() || getExpoExtraApiUrl() || null;

function isPlausibleDevHost(host: string | null | undefined): host is string {
  if (!host) {
    return false;
  }

  const normalized = host.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  if (normalized === 'localhost' || normalized === '127.0.0.1') {
    return true;
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(normalized)) {
    return true;
  }

  if (normalized.includes('.')) {
    return true;
  }

  return false;
}

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
    const parsed = new URL(normalized);
    const directHost = parsed.hostname || null;
    if (isPlausibleDevHost(directHost)) {
      return directHost;
    }

    for (const key of ['url', 'uri', 'redirect_uri']) {
      const nestedValue = parsed.searchParams.get(key);
      const nestedHost = extractHost(nestedValue ? decodeURIComponent(nestedValue) : nestedValue);
      if (isPlausibleDevHost(nestedHost)) {
        return nestedHost;
      }
    }
  } catch {
    const withoutScheme = trimmed.replace(/^[a-z]+:\/\//i, '');
    const host = withoutScheme.split('/')[0]?.split(':')[0]?.trim();
    if (isPlausibleDevHost(host)) {
      return host;
    }
  }

  const embeddedUrlMatch = trimmed.match(/[?&](?:url|uri|redirect_uri)=([^&]+)/i);
  if (embeddedUrlMatch?.[1]) {
    const nestedHost = extractHost(decodeURIComponent(embeddedUrlMatch[1]));
    if (isPlausibleDevHost(nestedHost)) {
      return nestedHost;
    }
  }

  return null;
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

function uniqueUrls(items: (string | null | undefined)[]): string[] {
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
  API_BASE_URL_CANDIDATES[0] ?? (Platform.OS === 'android' ? ANDROID_EMULATOR_API : LOCALHOST_API);

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
    extraApiUrl: getExpoExtraApiUrl(),
    devServerHost: getDevServerHost(),
    executionEnvironment: Constants.executionEnvironment,
    linkingUri: Constants.linkingUri ?? null,
  };
}
