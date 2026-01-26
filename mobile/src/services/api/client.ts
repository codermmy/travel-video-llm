import axios, { AxiosHeaders } from 'axios';

import { API_BASE_URL } from '@/constants/api';
import { tokenStorage } from '@/services/storage/tokenStorage';

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
});

apiClient.interceptors.request.use(async (config) => {
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
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error?.response?.status === 401) {
      await tokenStorage.clearAll();
      unauthorizedHandler?.();
    }
    return Promise.reject(error);
  },
);
