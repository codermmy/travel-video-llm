import { create } from 'zustand';

import { setUnauthorizedHandler } from '@/services/api/client';
import {
  getLocalUserInfo,
  isApiError,
  loginWithEmail,
  logout,
  register,
  registerWithEmail,
} from '@/services/api/authApi';
import { tokenStorage } from '@/services/storage/tokenStorage';

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
  register: (nickname?: string) => Promise<boolean>;
  registerWithEmail: (email: string, password: string, nickname?: string) => Promise<boolean>;
  loginWithEmail: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  clearError: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  userId: null,
  deviceId: null,
  email: null,
  isNewUser: false,
  authType: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  register: async (nickname?: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await register(nickname);
      if (!res.data) {
        set({ isLoading: false, error: 'register_failed' });
        return false;
      }
      set({
        token: res.data.token,
        userId: res.data.user_id,
        deviceId: res.data.device_id,
        email: res.data.email,
        isNewUser: res.data.is_new_user,
        authType: res.data.auth_type,
        isAuthenticated: true,
        isLoading: false,
      });
      return true;
    } catch (error: any) {
      const errorMessage = getErrorMessage(error);
      set({ isLoading: false, error: errorMessage });
      return false;
    }
  },

  registerWithEmail: async (email: string, password: string, nickname?: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await registerWithEmail({ email, password, nickname });
      if (!res.data) {
        set({ isLoading: false, error: 'register_failed' });
        return false;
      }
      set({
        token: res.data.token,
        userId: res.data.user_id,
        deviceId: res.data.device_id,
        email: res.data.email,
        isNewUser: res.data.is_new_user,
        authType: res.data.auth_type,
        isAuthenticated: true,
        isLoading: false,
      });
      return true;
    } catch (error: any) {
      const errorMessage = getErrorMessage(error);
      set({ isLoading: false, error: errorMessage });
      return false;
    }
  },

  loginWithEmail: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await loginWithEmail({ email, password });
      if (!res.data) {
        set({ isLoading: false, error: 'login_failed' });
        return false;
      }
      set({
        token: res.data.token,
        userId: res.data.user_id,
        deviceId: res.data.device_id,
        email: res.data.email,
        isNewUser: res.data.is_new_user,
        authType: res.data.auth_type,
        isAuthenticated: true,
        isLoading: false,
      });
      return true;
    } catch (error: any) {
      const errorMessage = getErrorMessage(error);
      set({ isLoading: false, error: errorMessage });
      return false;
    }
  },

  logout: async () => {
    await logout();
    set({
      token: null,
      userId: null,
      deviceId: null,
      email: null,
      isNewUser: false,
      authType: null,
      isAuthenticated: false,
    });
  },

  checkAuth: async () => {
    set({ isLoading: true });

    // 超时保护：5秒后强制结束 loading 状态
    const timeout = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Auth check timeout')), 5000);
    });

    try {
      const authCheck = Promise.all([
        getLocalUserInfo(),
        tokenStorage.getToken(),
        tokenStorage.getTokenSavedAt(),
      ]);

      const [info, token, tokenSavedAt] = (await Promise.race([authCheck, timeout])) as [
        { userId: string | null; deviceId: string | null; email: string | null },
        string | null,
        number | null,
      ];

      if (token) {
        const now = Date.now();

        if (tokenSavedAt === null) {
          await tokenStorage.touchTokenSavedAt();
        } else if (now - tokenSavedAt > TOKEN_TTL_MS) {
          await tokenStorage.clearAll();
          set({
            token: null,
            userId: null,
            deviceId: null,
            email: null,
            isAuthenticated: false,
            isLoading: false,
          });
          return;
        }
      }

      if (info.userId && token) {
        set({
          token,
          userId: info.userId,
          deviceId: info.deviceId,
          email: info.email,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        set({
          token: null,
          userId: null,
          deviceId: null,
          email: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    } catch (error) {
      console.error('Failed to check auth:', error);
      // 确保任何情况下都结束 loading 状态
      set({
        token: null,
        userId: null,
        deviceId: null,
        email: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  clearError: () => {
    set({ error: null });
  },
}));

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
      return '账号或密码错误';
    }
    if (error.response?.status === 409) {
      return '邮箱已被注册';
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return '操作失败，请稍后重试';
}

setUnauthorizedHandler(() => {
  void useAuthStore.getState().logout();
});
