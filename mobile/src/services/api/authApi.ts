import { apiClient } from '@/services/api/client';
import type { ApiResponse } from '@/types';

export type RegisterResponse = {
  token: string;
  user_id: string;
};

export async function register(deviceId: string): Promise<ApiResponse<RegisterResponse>> {
  const res = await apiClient.post<ApiResponse<RegisterResponse>>('/api/v1/auth/register', {
    device_id: deviceId,
  });
  return res.data;
}
