/**
 * 设备会话状态管理
 *
 * 当前产品模式：单设备、本机使用、默认不上图。
 * App 启动时会自动恢复本地设备会话；若本地无有效会话，则自动完成设备注册。
 */
import { create } from 'zustand';

import { setUnauthorizedHandler } from '@/services/api/client';
import {
  getLocalUserInfo,
  isApiError,
  logout,
  register as registerDeviceApi,
} from '@/services/api/authApi';
import { tokenStorage } from '@/services/storage/tokenStorage';
import { authDebug, authWarn } from '@/utils/authDebug';

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type AuthState = {
  token: string | null;
  userId: string | null;
  deviceId: string | null;
  email: string | null;
  isNewUser: boolean;
  authType: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  bootstrapDeviceSession: () => Promise<void>;
  register: (nickname?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
};

type DeviceSessionPayload = {
  token: string;
  user_id: string;
  device_id: string | null;
  email: string | null;
  is_new_user: boolean;
  auth_type: string;
};

const EMPTY_AUTH_STATE = {
  token: null,
  userId: null,
  deviceId: null,
  email: null,
  isNewUser: false,
  authType: null,
  isAuthenticated: false,
};

export const useAuthStore = create<AuthState>((set, get) => {
  const applyDeviceSession = (payload: DeviceSessionPayload): void => {
    set({
      token: payload.token,
      userId: payload.user_id,
      deviceId: payload.device_id,
      email: payload.email,
      isNewUser: payload.is_new_user,
      authType: payload.auth_type,
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
  };

  const registerDevice = async (nickname?: string): Promise<boolean> => {
    try {
      authDebug('authStore.register start');
      const res = await registerDeviceApi(nickname);
      if (!res.data) {
        authWarn('authStore.register empty response');
        set({ ...EMPTY_AUTH_STATE, isLoading: false, error: 'register_failed' });
        return false;
      }

      authDebug('authStore.register success', {
        userId: res.data.user_id,
        hasToken: Boolean(res.data.token),
      });
      applyDeviceSession(res.data);
      return true;
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      authWarn('authStore.register failed', { error: errorMessage });
      set({ ...EMPTY_AUTH_STATE, isLoading: false, error: errorMessage });
      return false;
    }
  };

  return {
    token: null,
    userId: null,
    deviceId: null,
    email: null,
    isNewUser: false,
    authType: null,
    isAuthenticated: false,
    isLoading: true,
    error: null,

    bootstrapDeviceSession: async () => {
      set({ isLoading: true, error: null });
      authDebug('authStore.bootstrapDeviceSession start');

      try {
        const [info, token, tokenSavedAt] = await Promise.all([
          getLocalUserInfo(),
          tokenStorage.getToken(),
          tokenStorage.getTokenSavedAt(),
        ]);

        authDebug('authStore.bootstrapDeviceSession snapshot', {
          hasToken: Boolean(token),
          hasUserId: Boolean(info.userId),
          tokenSavedAt,
        });

        if (token) {
          const now = Date.now();
          const tokenAge = tokenSavedAt ? now - tokenSavedAt : 0;
          const isExpired = tokenSavedAt !== null && tokenAge > TOKEN_TTL_MS;

          authDebug('authStore.bootstrapDeviceSession tokenMeta', {
            tokenAge,
            isExpired,
            ttlMs: TOKEN_TTL_MS,
          });

          if (isExpired) {
            authWarn('authStore.bootstrapDeviceSession token expired, clearing local auth');
            await tokenStorage.clearAll();
          } else {
            if (tokenSavedAt === null) {
              authDebug('authStore.bootstrapDeviceSession tokenSavedAt missing, touching value');
              await tokenStorage.touchTokenSavedAt();
            }

            set({
              token,
              userId: info.userId,
              deviceId: info.deviceId,
              email: info.email,
              isNewUser: false,
              authType: info.email ? 'email' : 'device',
              isAuthenticated: true,
              isLoading: false,
              error: null,
            });
            authDebug('authStore.bootstrapDeviceSession restored local session');
            return;
          }
        }

        authDebug('authStore.bootstrapDeviceSession register fresh device session');
        await registerDevice();
      } catch (error) {
        const errorMessage = getErrorMessage(error);
        authWarn('authStore.bootstrapDeviceSession failed', { error: errorMessage });
        set({ ...EMPTY_AUTH_STATE, isLoading: false, error: errorMessage });
      }
    },

    register: async (nickname?: string) => {
      set({ isLoading: true, error: null });
      return registerDevice(nickname);
    },

    logout: async () => {
      authDebug('authStore.logout start');
      await logout();
      set({
        ...EMPTY_AUTH_STATE,
        isLoading: false,
        error: null,
      });
      authDebug('authStore.logout done');
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
