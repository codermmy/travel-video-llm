import Constants from 'expo-constants';
import { Platform } from 'react-native';

const LOCALHOST_API = 'http://localhost:8000';

function getDevServerHost(): string | null {
  const manifest = Constants.manifest as unknown;
  const debuggerHost =
    typeof manifest === 'object' && manifest && 'debuggerHost' in manifest
      ? (manifest as { debuggerHost?: unknown }).debuggerHost
      : null;
  const hostUri =
    Constants.expoConfig?.hostUri ?? (typeof debuggerHost === 'string' ? debuggerHost : null);
  if (!hostUri) {
    return null;
  }
  return hostUri.split(':')[0] ?? null;
}

const deviceHost = getDevServerHost();
const deviceApiBase = deviceHost ? `http://${deviceHost}:8000` : LOCALHOST_API;

export const API_BASE_URL = Platform.OS === 'web' ? LOCALHOST_API : deviceApiBase;
