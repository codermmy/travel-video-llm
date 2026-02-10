import { apiClient } from '@/services/api/client';
import { tokenStorage } from '@/services/storage/tokenStorage';
import type { ApiResponse } from '@/types';
import { authDebug, authWarn } from '@/utils/authDebug';
import { getDeviceId } from '@/utils/deviceUtils';

export type AuthResponse = {
  token: string;
  user_id: string;
  device_id: string | null;
  email: string | null;
  nickname: string | null;
  created_at: string;
  is_new_user: boolean;
  auth_type: string;
};

export type EmailPasswordRegisterParams = {
  email: string;
  password: string;
  verification_code: string;
  nickname?: string;
};

export type EmailPasswordLoginParams = {
  email: string;
  password: string;
};

export type SendCodePurpose = 'register' | 'reset_password';

export type ApiError = {
  response?: {
    data?: {
      detail?: string | { code: string; message: string };
    };
    status: number;
  };
};

export function isApiError(error: unknown): error is ApiError {
  return typeof error === 'object' && error !== null && 'response' in error;
}

export async function register(nickname?: string): Promise<ApiResponse<AuthResponse>> {
  const deviceId = await getDeviceId();
  const res = await apiClient.post<ApiResponse<AuthResponse>>('/api/v1/auth/register', {
    device_id: deviceId,
    nickname,
  });
  if (res.data?.data) {
    authDebug('authApi.register persist token', { hasToken: Boolean(res.data.data.token) });
    await tokenStorage.saveToken(res.data.data.token);
    await tokenStorage.saveUserId(res.data.data.user_id);
    if (res.data.data.device_id) {
      await tokenStorage.saveDeviceId(res.data.data.device_id);
    }
  }
  return res.data;
}

export async function sendEmailCode(
  email: string,
  purpose: SendCodePurpose,
): Promise<ApiResponse<{ message: string }>> {
  const path =
    purpose === 'reset_password'
      ? '/api/v1/auth/send-reset-code'
      : '/api/v1/auth/send-verification-code';
  const res = await apiClient.post<ApiResponse<{ message: string }>>(path, {
    email,
    purpose,
  });
  return res.data;
}

export async function verifyEmailCode(
  email: string,
  code: string,
): Promise<ApiResponse<{ message: string }>> {
  const res = await apiClient.post<ApiResponse<{ message: string }>>('/api/v1/auth/verify-email', {
    email,
    code,
  });
  return res.data;
}

export async function resetPassword(
  email: string,
  code: string,
  newPassword: string,
): Promise<ApiResponse<{ message: string }>> {
  const res = await apiClient.post<ApiResponse<{ message: string }>>(
    '/api/v1/auth/reset-password',
    {
      email,
      code,
      new_password: newPassword,
    },
  );
  return res.data;
}

export async function registerWithEmail(
  params: EmailPasswordRegisterParams,
): Promise<ApiResponse<AuthResponse>> {
  const res = await apiClient.post<ApiResponse<AuthResponse>>(
    '/api/v1/auth/register-email',
    params,
  );
  if (res.data?.data) {
    authDebug('authApi.registerWithEmail persist token', {
      hasToken: Boolean(res.data.data.token),
    });
    await tokenStorage.saveToken(res.data.data.token);
    await tokenStorage.saveUserId(res.data.data.user_id);
    if (res.data.data.email) {
      await tokenStorage.saveEmail(res.data.data.email);
    }
  }
  return res.data;
}

export async function loginWithEmail(
  params: EmailPasswordLoginParams,
): Promise<ApiResponse<AuthResponse>> {
  try {
    const res = await apiClient.post<ApiResponse<AuthResponse>>('/api/v1/auth/login', params);
    if (res.data?.data) {
      authDebug('authApi.loginWithEmail persist token', {
        hasToken: Boolean(res.data.data.token),
      });
      await tokenStorage.saveToken(res.data.data.token);
      await tokenStorage.saveUserId(res.data.data.user_id);
      if (res.data.data.email) {
        await tokenStorage.saveEmail(res.data.data.email);
      }
    }
    return res.data;
  } catch (error) {
    authWarn('authApi.loginWithEmail request failed', { error: String(error) });
    throw error;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const token = await tokenStorage.getToken();
  return Boolean(token);
}

export async function logout(): Promise<void> {
  await tokenStorage.clearAll();
}

export async function getLocalUserInfo(): Promise<{
  userId: string | null;
  deviceId: string | null;
  email: string | null;
}> {
  const [userId, deviceId, email] = await Promise.all([
    tokenStorage.getUserId(),
    tokenStorage.getDeviceId(),
    tokenStorage.getEmail(),
  ]);
  return { userId, deviceId, email };
}
