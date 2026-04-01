import { getApiConnectionDebugInfo } from '@/constants/api';
import { apiClient } from '@/services/api/client';
import { tokenStorage } from '@/services/storage/tokenStorage';
import type { ApiResponse } from '@/types';
import { authDebug } from '@/utils/authDebug';
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

// ============================================================================
// 【已禁用】邮箱认证相关类型 - 保留以便恢复
// 恢复方法请参考：my-spec/docs/auth-recovery-guide.md
// ============================================================================
// export type EmailPasswordRegisterParams = { ... };
// export type EmailPasswordLoginParams = { ... };
// export type SendCodePurpose = 'register' | 'reset_password';
// ============================================================================

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
  authDebug('authApi.register request', {
    deviceId,
    ...getApiConnectionDebugInfo(),
  });
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
