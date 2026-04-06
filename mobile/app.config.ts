import type { ExpoConfig, ConfigContext } from 'expo/config';

type AmapExtra = { androidKey?: string; iosKey?: string };
type AppExtra = {
  apiBaseUrl?: string;
  amap?: AmapExtra;
};

function mergeAmapExtra(existing: unknown, envAmap: AmapExtra): AmapExtra {
  const base = (
    typeof existing === 'object' && existing ? (existing as AmapExtra) : {}
  ) as AmapExtra;
  return {
    ...base,
    androidKey: envAmap.androidKey ?? base.androidKey,
    iosKey: envAmap.iosKey ?? base.iosKey,
  };
}

export default ({ config }: ConfigContext): ExpoConfig => {
  // Prefer env vars so keys are not committed to git.
  // These values are baked into the native app during prebuild/build.
  const envAmap: AmapExtra = {
    androidKey: process.env.AMAP_ANDROID_KEY,
    iosKey: process.env.AMAP_IOS_KEY,
  };

  const existingExtra = (config.extra ?? {}) as AppExtra & Record<string, unknown>;
  const mergedExtra = {
    ...existingExtra,
    apiBaseUrl: process.env.EXPO_PUBLIC_API_URL ?? existingExtra.apiBaseUrl,
    amap: mergeAmapExtra(existingExtra.amap, envAmap),
  };

  return {
    ...config,
    // Make TS happy: ensure required ExpoConfig fields exist.
    name: config.name ?? 'mobile',
    slug: config.slug ?? 'mobile',
    version: config.version ?? '1.0.0',
    extra: mergedExtra,
  };
};
