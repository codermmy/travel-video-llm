import { getApiBaseUrl } from '@/constants/api';

export function resolveApiUrl(input?: string | null): string | null {
  if (!input) {
    return null;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const apiBaseUrl = getApiBaseUrl();
  if (trimmed.startsWith('/')) {
    return `${apiBaseUrl}${trimmed}`;
  }
  return `${apiBaseUrl}/${trimmed}`;
}
