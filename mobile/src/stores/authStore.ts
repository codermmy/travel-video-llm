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
  register: (nickname?: string) => Promise<boolean>;
  registerWithEmail: (
    email: string,
    password: string,
    verificationCode: string,
    nickname?: string,
  ) => Promise<boolean>;
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
      authDebug('authStore.register start');
      const res = await register(nickname);
      if (!res.data) {
        authWarn('authStore.register empty response');
        set({ isLoading: false, error: 'register_failed' });
        return false;
      }
      authDebug('authStore.register success', {
        userId: res.data.user_id,
        hasToken: Boolean(res.data.token),
      });
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
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      authWarn('authStore.register failed', { error: errorMessage });
      set({ isLoading: false, error: errorMessage });
      return false;
    }
  },

  registerWithEmail: async (
    email: string,
    password: string,
    verificationCode: string,
    nickname?: string,
  ) => {
    set({ isLoading: true, error: null });
    try {
      authDebug('authStore.registerWithEmail start', { email });
      const res = await registerWithEmail({
        email,
        password,
        verification_code: verificationCode,
        nickname,
      });
      if (!res.data) {
        authWarn('authStore.registerWithEmail empty response');
        set({ isLoading: false, error: 'register_failed' });
        return false;
      }
      authDebug('authStore.registerWithEmail success', {
        userId: res.data.user_id,
        hasToken: Boolean(res.data.token),
      });
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
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      authWarn('authStore.registerWithEmail failed', { error: errorMessage });
      set({ isLoading: false, error: errorMessage });
      return false;
    }
  },

  loginWithEmail: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      authDebug('authStore.loginWithEmail start', { email });
      const res = await loginWithEmail({ email, password });
      if (!res.data) {
        authWarn('authStore.loginWithEmail empty response');
        set({ isLoading: false, error: 'login_failed' });
        return false;
      }
      authDebug('authStore.loginWithEmail success', {
        userId: res.data.user_id,
        hasToken: Boolean(res.data.token),
      });
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
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      authWarn('authStore.loginWithEmail failed', { error: errorMessage });
      set({ isLoading: false, error: errorMessage });
      return false;
    }
  },

  logout: async () => {
    authDebug('authStore.logout start');
    await logout();
    set({
      token: null,
      userId: null,
      deviceId: null,
      email: null,
      isNewUser: false,
      authType: null,
      isAuthenticated: false,
      isLoading: false,
    });
    authDebug('authStore.logout done');
  },

  checkAuth: async () => {
    set({ isLoading: true });
    authDebug('authStore.checkAuth start');

    try {
      const [info, token, tokenSavedAt] = await Promise.all([
        getLocalUserInfo(),
        tokenStorage.getToken(),
        tokenStorage.getTokenSavedAt(),
      ]);

      authDebug('authStore.checkAuth snapshot', {
        hasToken: Boolean(token),
        hasUserId: Boolean(info.userId),
        tokenSavedAt,
      });

      if (token) {
        const now = Date.now();
        const tokenAge = tokenSavedAt ? now - tokenSavedAt : 0;
        const isExpired = tokenSavedAt !== null && tokenAge > TOKEN_TTL_MS;

        authDebug('authStore.checkAuth tokenMeta', {
          tokenAge,
          isExpired,
          ttlMs: TOKEN_TTL_MS,
        });

        if (isExpired) {
          authWarn('authStore.checkAuth token expired, clearing local auth');
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

        if (tokenSavedAt === null) {
          authDebug('authStore.checkAuth tokenSavedAt missing, touching value');
          await tokenStorage.touchTokenSavedAt();
        }
      }

      if (token) {
        set({
          token,
          userId: info.userId,
          deviceId: info.deviceId,
          email: info.email,
          isAuthenticated: true,
          isLoading: false,
        });
        authDebug('authStore.checkAuth authenticated');
        return;
      }

      set({
        token: null,
        userId: null,
        deviceId: null,
        email: null,
        isAuthenticated: false,
        isLoading: false,
      });
      authDebug('authStore.checkAuth unauthenticated (no token)');
    } catch (error) {
      authWarn('authStore.checkAuth failed', { error: String(error) });
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
  authWarn('authStore.unauthorizedHandler triggered');
  void useAuthStore.getState().logout();
});

tokenStorage.setErrorCallback((error) => {
  authWarn('tokenStorage error callback', { error: error.message });
  useAuthStore.setState({ error: error.message });
});
