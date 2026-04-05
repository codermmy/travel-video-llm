const envFlag =
  typeof process !== 'undefined' &&
  typeof process.env === 'object' &&
  process.env?.EXPO_PUBLIC_AUTH_DEBUG === '1';

const AUTH_DEBUG_ENABLED = envFlag;

function withPrefix(args: unknown[]): unknown[] {
  return ['[AuthDebug]', ...args];
}

export function authDebug(...args: unknown[]): void {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }
  // eslint-disable-next-line no-console
  console.log(...withPrefix(args));
}

export function authWarn(...args: unknown[]): void {
  if (!AUTH_DEBUG_ENABLED) {
    return;
  }
  // eslint-disable-next-line no-console
  console.warn(...withPrefix(args));
}

export function isAuthDebugEnabled(): boolean {
  return AUTH_DEBUG_ENABLED;
}
