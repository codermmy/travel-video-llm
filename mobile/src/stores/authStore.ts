/**
 * 设备会话状态管理
 *
 * 当前产品模式：单设备、本机使用、默认不上图。
 * App 启动时会自动恢复本地设备会话；若本地无有效会话，则自动完成设备引导。
 */
import { create } from 'zustand';

import { setUnauthorizedHandler } from '@/services/api/client';
import {
  bootstrapDeviceSession as bootstrapDeviceSessionApi,
  getLocalUserInfo,
  isApiError,
} from '@/services/api/authApi';
import { tokenStorage } from '@/services/storage/tokenStorage';
import { authDebug, authWarn } from '@/utils/authDebug';
import { getDeviceId } from '@/utils/deviceUtils';

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type AuthState = {
  token: string | null;
  userId: string | null;
  deviceId: string | null;
  isNewUser: boolean;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  bootstrapDeviceSession: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
};

type DeviceSessionPayload = {
  token: string;
  user_id: string;
  device_id: string | null;
  is_new_user: boolean;
};

const EMPTY_AUTH_STATE = {
  token: null,
  userId: null,
  deviceId: null,
  isNewUser: false,
  isAuthenticated: false,
};

export const useAuthStore = create<AuthState>((set, get) => {
  const applyDeviceSession = (payload: DeviceSessionPayload): void => {
    set({
      token: payload.token,
      userId: payload.user_id,
      deviceId: payload.device_id,
      isNewUser: payload.is_new_user,
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
  };

  const initializeDeviceSession = async (nickname?: string): Promise<boolean> => {
    try {
      authDebug('authStore.initializeDeviceSession start');
      const res = await bootstrapDeviceSessionApi(nickname);
      if (!res.data) {
        authWarn('authStore.initializeDeviceSession empty response');
        set({ ...EMPTY_AUTH_STATE, isLoading: false, error: 'device_bootstrap_failed' });
        return false;
      }

      authDebug('authStore.initializeDeviceSession success', {
        userId: res.data.user_id,
        hasToken: Boolean(res.data.token),
      });
      applyDeviceSession(res.data);
      return true;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      authWarn('authStore.initializeDeviceSession failed', { error: errorMessage });
      set({ ...EMPTY_AUTH_STATE, isLoading: false, error: errorMessage });
      return false;
    }
  };

  return {
    token: null,
    userId: null,
    deviceId: null,
    isNewUser: false,
    isAuthenticated: false,
    isLoading: true,
    error: null,

    bootstrapDeviceSession: async () => {
      set({ isLoading: true, error: null });
      authDebug('authStore.bootstrapDeviceSession start');

      try {
        const [info, token, tokenSavedAt, currentDeviceId] = await Promise.all([
          getLocalUserInfo(),
          tokenStorage.getToken(),
          tokenStorage.getTokenSavedAt(),
          getDeviceId(),
        ]);

        authDebug('authStore.bootstrapDeviceSession snapshot', {
          hasToken: Boolean(token),
          hasUserId: Boolean(info.userId),
          tokenSavedAt,
          hasStoredDeviceId: Boolean(info.deviceId),
          currentDeviceId,
        });

        if (token) {
          const now = Date.now();
          const tokenAge = tokenSavedAt ? now - tokenSavedAt : 0;
          const isExpired = tokenSavedAt !== null && tokenAge > TOKEN_TTL_MS;
          const deviceIdMismatch = !info.deviceId || info.deviceId !== currentDeviceId;

          authDebug('authStore.bootstrapDeviceSession tokenMeta', {
            tokenAge,
            isExpired,
            deviceIdMismatch,
            ttlMs: TOKEN_TTL_MS,
          });

          if (isExpired) {
            authWarn('authStore.bootstrapDeviceSession token expired, clearing local auth');
            await tokenStorage.clearAll();
          } else if (deviceIdMismatch || !info.userId) {
            authDebug('authStore.bootstrapDeviceSession refresh device bootstrap', {
              reason: !info.userId ? 'missing_user_id' : 'device_id_mismatch',
            });
            await initializeDeviceSession();
            return;
          } else {
            if (tokenSavedAt === null) {
              authDebug('authStore.bootstrapDeviceSession tokenSavedAt missing, touching value');
              await tokenStorage.touchTokenSavedAt();
            }

            set({
              token,
              userId: info.userId,
              deviceId: info.deviceId,
              isNewUser: false,
              isAuthenticated: true,
              isLoading: false,
              error: null,
            });
            authDebug('authStore.bootstrapDeviceSession restored local session');
            return;
          }
        }

        authDebug('authStore.bootstrapDeviceSession bootstrap fresh device session');
        await initializeDeviceSession();
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        authWarn('authStore.bootstrapDeviceSession failed', { error: errorMessage });
        set({ ...EMPTY_AUTH_STATE, isLoading: false, error: errorMessage });
      }
    },

    checkAuth: async () => {
      await get().bootstrapDeviceSession();
    },

    clearError: () => {
      set({ error: null });
    },
  };
});

function getErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    const detail = error.response?.data?.detail;
    if (typeof detail === 'string') {
      return detail;
    }
    if (typeof detail === 'object' && detail?.message) {
      return detail.message;
    }
    if (error.response?.status === 401) {
      return '设备身份校验失败，请稍后重试';
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return '操作失败，请稍后重试';
}

setUnauthorizedHandler(() => {
  authWarn('authStore.unauthorizedHandler triggered');
  void useAuthStore.getState().bootstrapDeviceSession();
});

tokenStorage.setErrorCallback((error) => {
  authWarn('tokenStorage error callback', { error: error.message });
  useAuthStore.setState({ error: error.message });
});
