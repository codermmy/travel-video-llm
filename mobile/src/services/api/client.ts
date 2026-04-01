import axios, { AxiosHeaders } from 'axios';

import { API_BASE_URL_CANDIDATES, getApiBaseUrl, getApiConnectionDebugInfo, setApiBaseUrl } from '@/constants/api';
import { tokenStorage } from '@/services/storage/tokenStorage';
import { authDebug, authWarn } from '@/utils/authDebug';
import { getDeviceId } from '@/utils/deviceUtils';

type UnauthorizedHandler = () => void;
type RetryableRequestConfig = {
  __apiBaseCandidateIndex?: number;
  baseURL?: string;
  url?: string;
};

let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

export async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  baseDelayMs = 600,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i <= maxRetries; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, baseDelayMs * (i + 1)));
      }
    }
  }
  throw lastError;
}

function isAuthEndpoint(url: string): boolean {
  return url.includes('/api/v1/auth/');
}

export const apiClient = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 15_000,
});

authDebug('apiClient init', getApiConnectionDebugInfo());

function isRecoverableNetworkError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const value = error as { response?: unknown; code?: unknown; message?: unknown };
  if (value.response) {
    return false;
  }

  return (
    value.code === 'ERR_NETWORK' ||
    value.code === 'ECONNREFUSED' ||
    value.message === 'Network Error'
  );
}

apiClient.interceptors.request.use(async (config) => {
  const currentBaseUrl = config.baseURL ?? getApiBaseUrl();
  config.baseURL = currentBaseUrl;

  const retryConfig = config as typeof config & RetryableRequestConfig;
  if (typeof retryConfig.__apiBaseCandidateIndex !== 'number') {
    const candidateIndex = API_BASE_URL_CANDIDATES.indexOf(currentBaseUrl);
    retryConfig.__apiBaseCandidateIndex = candidateIndex >= 0 ? candidateIndex : 0;
  }

  try {
    const deviceId = await getDeviceId();
    if (deviceId) {
      const headers = config.headers;
      if (!headers) {
        config.headers = new AxiosHeaders({ 'X-Device-Id': deviceId });
      } else if (
        headers instanceof AxiosHeaders ||
        ('set' in headers && typeof (headers as { set?: unknown }).set === 'function')
      ) {
        (headers as AxiosHeaders).set('X-Device-Id', deviceId);
      } else {
        (headers as Record<string, unknown>)['X-Device-Id'] = deviceId;
      }
    }
  } catch (error) {
    authWarn('apiClient failed to attach device id', { error: String(error) });
  }

  const token = await tokenStorage.getToken();
  if (token) {
    const headers = config.headers;

    if (!headers) {
      config.headers = new AxiosHeaders({ Authorization: `Bearer ${token}` });
      return config;
    }

    if (
      headers instanceof AxiosHeaders ||
      ('set' in headers && typeof (headers as { set?: unknown }).set === 'function')
    ) {
      (headers as AxiosHeaders).set('Authorization', `Bearer ${token}`);
      return config;
    }

    (headers as Record<string, unknown>)['Authorization'] = `Bearer ${token}`;
  }

  if (typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine) {
    throw new Error('网络连接失败，请检查网络设置');
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (__DEV__ && isRecoverableNetworkError(error)) {
      const config = error?.config as RetryableRequestConfig | undefined;
      const currentIndex =
        typeof config?.__apiBaseCandidateIndex === 'number' ? config.__apiBaseCandidateIndex : 0;
      const nextIndex = currentIndex + 1;

      if (config && nextIndex < API_BASE_URL_CANDIDATES.length) {
        const nextBaseUrl = API_BASE_URL_CANDIDATES[nextIndex];
        setApiBaseUrl(nextBaseUrl);
        apiClient.defaults.baseURL = nextBaseUrl;
        config.baseURL = nextBaseUrl;
        config.__apiBaseCandidateIndex = nextIndex;

        authWarn('apiClient retry with fallback base URL', {
          failedBaseUrl: API_BASE_URL_CANDIDATES[currentIndex] ?? getApiBaseUrl(),
          nextBaseUrl,
          request: `${String(error?.config?.method ?? 'GET').toUpperCase()} ${String(config.url ?? '')}`,
        });

        return apiClient.request(config);
      }
    }

    if (error?.response?.status === 401) {
      const url = String(error?.config?.url ?? 'unknown');
      const method = String(error?.config?.method ?? 'GET').toUpperCase();
      const hasToken = Boolean(await tokenStorage.getToken());

      authWarn('apiClient received 401', {
        request: `${method} ${url}`,
        hasToken,
        responseDetail: error?.response?.data?.detail ?? null,
      });

      if (hasToken && !isAuthEndpoint(url)) {
        await tokenStorage.clearAll();
        unauthorizedHandler?.();
        return Promise.reject(new Error('设备身份已失效，正在重新初始化，请稍后重试'));
      }

      authDebug('apiClient skip forced logout for 401', {
        request: `${method} ${url}`,
        reason: !hasToken ? 'no_local_token' : 'auth_endpoint',
      });
      return Promise.reject(error);
    }

    if (error?.response?.status === 500) {
      return Promise.reject(new Error('服务器开小差了，请稍后重试'));
    }

    if (error?.code === 'ECONNABORTED') {
      return Promise.reject(new Error('请求超时，请检查网络后重试'));
    }

    return Promise.reject(error);
  },
);
