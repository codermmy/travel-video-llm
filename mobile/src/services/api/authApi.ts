import { apiClient } from '@/services/api/client';
import { tokenStorage } from '@/services/storage/tokenStorage';
import { getDeviceId } from '@/utils/deviceUtils';
import type { ApiResponse } from '@/types';

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
  nickname?: string;
};

export type EmailPasswordLoginParams = {
  email: string;
  password: string;
};

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
    await tokenStorage.saveToken(res.data.data.token);
    await tokenStorage.saveUserId(res.data.data.user_id);
    if (res.data.data.device_id) {
      await tokenStorage.saveDeviceId(res.data.data.device_id);
    }
  }
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
  const res = await apiClient.post<ApiResponse<AuthResponse>>('/api/v1/auth/login', params);
  if (res.data?.data) {
    await tokenStorage.saveToken(res.data.data.token);
    await tokenStorage.saveUserId(res.data.data.user_id);
    if (res.data.data.email) {
      await tokenStorage.saveEmail(res.data.data.email);
    }
  }
  return res.data;
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
