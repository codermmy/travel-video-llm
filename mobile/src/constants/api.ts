import Constants from 'expo-constants';
import { Platform } from 'react-native';

const LOCALHOST_API = 'http://localhost:8000';

function getDevServerHost(): string | null {
  const hostUri = Constants.expoConfig?.hostUri ?? Constants.manifest?.debuggerHost;
  if (!hostUri) {
    return null;
  }
  return hostUri.split(':')[0] ?? null;
}

const deviceHost = getDevServerHost();
const deviceApiBase = deviceHost ? `http://${deviceHost}:8000` : LOCALHOST_API;

export const API_BASE_URL = Platform.OS === 'web' ? LOCALHOST_API : deviceApiBase;
