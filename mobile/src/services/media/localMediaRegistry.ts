import AsyncStorage from '@react-native-async-storage/async-storage';
import * as MediaLibrary from 'expo-media-library';

const LOCAL_MEDIA_REGISTRY_KEY = 'local-media-registry/v1';
const EVENT_COVER_OVERRIDE_KEY = 'event-cover-override/v1';

function logMediaDebug(label: string, payload: Record<string, unknown>): void {
  if (__DEV__) {
    console.log(`[MediaDebug] ${label}`, payload);
  }
}

export type LocalMediaRegistryEntry = {
  photoId?: string | null;
  fileHash?: string | null;
  assetId?: string | null;
  shootTime?: string | null;
  gpsLat?: number | null;
  gpsLon?: number | null;
  localUri?: string | null;
  localThumbnailUri?: string | null;
  localCoverUri?: string | null;
  updatedAt: string;
};

export type EventCoverOverride = {
  eventId: string;
  photoId: string;
  localCoverUri?: string | null;
  updatedAt: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function buildLocalMediaRegistryKey(input: {
  photoId?: string | null;
  assetId?: string | null;
  fileHash?: string | null;
}): string | null {
  if (isNonEmptyString(input.photoId)) {
    return `photo:${input.photoId.trim()}`;
  }
  if (isNonEmptyString(input.assetId)) {
    return `asset:${input.assetId.trim()}`;
  }
  if (isNonEmptyString(input.fileHash)) {
    return `hash:${input.fileHash.trim()}`;
  }
  return null;
}

function buildLocalMediaMetadataKey(input: {
  shootTime?: string | null;
  gpsLat?: number | null;
  gpsLon?: number | null;
}): string | null {
  const shootTime = isNonEmptyString(input.shootTime) ? input.shootTime.trim() : null;
  if (!shootTime) {
    return null;
  }

  const hasLat = typeof input.gpsLat === 'number' && Number.isFinite(input.gpsLat);
  const hasLon = typeof input.gpsLon === 'number' && Number.isFinite(input.gpsLon);
  if (!hasLat && !hasLon) {
    return `meta:${shootTime}|nogps`;
  }
  if (!hasLat || !hasLon) {
    return null;
  }
  return `meta:${shootTime}|${input.gpsLat}|${input.gpsLon}`;
}

export function buildLocalMediaLookupKeys(input: {
  photoId?: string | null;
  assetId?: string | null;
  fileHash?: string | null;
  shootTime?: string | null;
  gpsLat?: number | null;
  gpsLon?: number | null;
}): string[] {
  const keys = [
    buildLocalMediaRegistryKey({ photoId: input.photoId }),
    buildLocalMediaRegistryKey({ assetId: input.assetId, fileHash: undefined }),
    buildLocalMediaRegistryKey({ assetId: undefined, fileHash: input.fileHash }),
    buildLocalMediaMetadataKey({
      shootTime: input.shootTime,
      gpsLat: input.gpsLat,
      gpsLon: input.gpsLon,
    }),
  ].filter((value): value is string => isNonEmptyString(value));

  return Array.from(new Set(keys));
}

async function readJsonRecord<T>(storageKey: string): Promise<Record<string, T>> {
  try {
    const raw = await AsyncStorage.getItem(storageKey);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, T>) : {};
  } catch (error) {
    console.warn(`[local-media-registry] failed to read ${storageKey}:`, error);
    return {};
  }
}

async function writeJsonRecord<T>(storageKey: string, value: Record<string, T>): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKey, JSON.stringify(value));
  } catch (error) {
    console.warn(`[local-media-registry] failed to write ${storageKey}:`, error);
  }
}

export async function registerLocalMediaEntries(
  entries: {
    photoId?: string | null;
    fileHash?: string | null;
    assetId?: string | null;
    shootTime?: string | null;
    gpsLat?: number | null;
    gpsLon?: number | null;
    localUri?: string | null;
    localThumbnailUri?: string | null;
    localCoverUri?: string | null;
  }[],
): Promise<void> {
  const validEntries = entries
    .flatMap((entry) =>
      buildLocalMediaLookupKeys({
        photoId: entry.photoId,
        assetId: entry.assetId,
        fileHash: entry.fileHash,
        shootTime: entry.shootTime,
        gpsLat: entry.gpsLat,
        gpsLon: entry.gpsLon,
      }).map((registryKey) => ({
      ...entry,
        registryKey,
      })),
    )
    .filter(
      (
        entry,
      ): entry is {
        fileHash?: string | null;
        photoId?: string | null;
        assetId?: string | null;
        shootTime?: string | null;
        gpsLat?: number | null;
        gpsLon?: number | null;
        localUri?: string | null;
        localThumbnailUri?: string | null;
        localCoverUri?: string | null;
        registryKey: string;
      } => Boolean(entry.registryKey),
    );
  if (validEntries.length === 0) {
    logMediaDebug('registerLocalMediaEntries skipped', { reason: 'no_valid_entries' });
    return;
  }

  const current = await readJsonRecord<LocalMediaRegistryEntry>(LOCAL_MEDIA_REGISTRY_KEY);
  const now = new Date().toISOString();

  for (const entry of validEntries) {
    const previous = current[entry.registryKey];
    current[entry.registryKey] = {
      fileHash: entry.fileHash ?? previous?.fileHash ?? null,
      photoId: entry.photoId ?? previous?.photoId ?? null,
      assetId: entry.assetId ?? previous?.assetId ?? null,
      shootTime: entry.shootTime ?? previous?.shootTime ?? null,
      gpsLat: entry.gpsLat ?? previous?.gpsLat ?? null,
      gpsLon: entry.gpsLon ?? previous?.gpsLon ?? null,
      localUri: entry.localUri ?? previous?.localUri ?? null,
      localThumbnailUri: entry.localThumbnailUri ?? previous?.localThumbnailUri ?? null,
      localCoverUri: entry.localCoverUri ?? previous?.localCoverUri ?? null,
      updatedAt: now,
    };
  }

  await writeJsonRecord(LOCAL_MEDIA_REGISTRY_KEY, current);
  logMediaDebug('registerLocalMediaEntries', {
    count: validEntries.length,
    keys: validEntries.slice(0, 8).map((entry) => entry.registryKey),
  });
}

export async function getLocalMediaEntries(
  refs: {
    photoId?: string | null;
    assetId?: string | null;
    fileHash?: string | null;
    shootTime?: string | null;
    gpsLat?: number | null;
    gpsLon?: number | null;
  }[],
): Promise<Map<string, LocalMediaRegistryEntry>> {
  const uniqueKeys = Array.from(
    new Set(
      refs
        .flatMap((value) =>
          buildLocalMediaLookupKeys({
            photoId: value.photoId,
            assetId: value.assetId,
            fileHash: value.fileHash,
            shootTime: value.shootTime,
            gpsLat: value.gpsLat,
            gpsLon: value.gpsLon,
          }),
        )
        .filter((value): value is string => isNonEmptyString(value)),
    ),
  );
  if (uniqueKeys.length === 0) {
    logMediaDebug('getLocalMediaEntries skipped', { reason: 'no_lookup_keys' });
    return new Map();
  }

  const current = await readJsonRecord<LocalMediaRegistryEntry>(LOCAL_MEDIA_REGISTRY_KEY);
  const result = new Map<string, LocalMediaRegistryEntry>();

  for (const key of uniqueKeys) {
    const existing = current[key];
    if (!existing) {
      continue;
    }
    result.set(key, existing);
  }

  logMediaDebug('getLocalMediaEntries', {
    requested: uniqueKeys.length,
    matched: result.size,
    keys: uniqueKeys.slice(0, 8),
  });
  return result;
}

export async function resolveLocalMediaEntriesByAssetIds(
  assetIds: (string | null | undefined)[],
): Promise<Map<string, LocalMediaRegistryEntry>> {
  const uniqueAssetIds = Array.from(
    new Set(assetIds.filter((value): value is string => isNonEmptyString(value)).map((v) => v.trim())),
  );
  if (uniqueAssetIds.length === 0) {
    logMediaDebug('resolveLocalMediaEntriesByAssetIds skipped', { reason: 'no_asset_ids' });
    return new Map();
  }

  const current = await readJsonRecord<LocalMediaRegistryEntry>(LOCAL_MEDIA_REGISTRY_KEY);
  const resolved = new Map<string, LocalMediaRegistryEntry>();
  const missingAssetIds: string[] = [];

  for (const assetId of uniqueAssetIds) {
    const key = `asset:${assetId}`;
    const existing = current[key];
    if (existing?.localUri || existing?.localCoverUri || existing?.localThumbnailUri) {
      resolved.set(key, existing);
    } else {
      missingAssetIds.push(assetId);
    }
  }

  if (missingAssetIds.length === 0) {
    logMediaDebug('resolveLocalMediaEntriesByAssetIds cache-hit', {
      requested: uniqueAssetIds.length,
      resolved: resolved.size,
    });
    return resolved;
  }

  const hydratedEntries: {
    assetId: string;
    localUri?: string | null;
    localCoverUri?: string | null;
  }[] = [];

  for (const assetId of missingAssetIds) {
    try {
      const info = await MediaLibrary.getAssetInfoAsync(assetId);
      const localUri = info.localUri ?? null;
      if (!localUri) {
        continue;
      }
      hydratedEntries.push({
        assetId,
        localUri,
        localCoverUri: localUri,
      });
    } catch (error) {
      console.warn(`[local-media-registry] failed to resolve asset ${assetId}:`, error);
    }
  }

  if (hydratedEntries.length > 0) {
    await registerLocalMediaEntries(hydratedEntries);
    for (const entry of hydratedEntries) {
      resolved.set(`asset:${entry.assetId}`, {
        assetId: entry.assetId,
        fileHash: null,
        photoId: null,
        shootTime: null,
        gpsLat: null,
        gpsLon: null,
        localUri: entry.localUri ?? null,
        localThumbnailUri: null,
        localCoverUri: entry.localCoverUri ?? null,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  logMediaDebug('resolveLocalMediaEntriesByAssetIds', {
    requested: uniqueAssetIds.length,
    cacheHit: resolved.size - hydratedEntries.length,
    hydrated: hydratedEntries.length,
    missing: missingAssetIds.length - hydratedEntries.length,
    sampleAssetIds: uniqueAssetIds.slice(0, 8),
  });
  return resolved;
}

export async function getEventCoverOverrides(
  eventIds: string[],
): Promise<Map<string, EventCoverOverride>> {
  const uniqueIds = Array.from(
    new Set(
      eventIds.filter((value): value is string => isNonEmptyString(value)).map((v) => v.trim()),
    ),
  );
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const current = await readJsonRecord<EventCoverOverride>(EVENT_COVER_OVERRIDE_KEY);
  return new Map(
    uniqueIds
      .map((eventId) => [eventId, current[eventId]] as const)
      .filter((entry): entry is [string, EventCoverOverride] => Boolean(entry[1])),
  );
}

export async function getEventCoverOverride(eventId: string): Promise<EventCoverOverride | null> {
  const overrides = await getEventCoverOverrides([eventId]);
  return overrides.get(eventId) ?? null;
}

export async function saveEventCoverOverride(input: {
  eventId: string;
  photoId: string;
  localCoverUri?: string | null;
}): Promise<void> {
  if (!isNonEmptyString(input.eventId) || !isNonEmptyString(input.photoId)) {
    return;
  }

  const current = await readJsonRecord<EventCoverOverride>(EVENT_COVER_OVERRIDE_KEY);
  current[input.eventId] = {
    eventId: input.eventId,
    photoId: input.photoId,
    localCoverUri: input.localCoverUri ?? null,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonRecord(EVENT_COVER_OVERRIDE_KEY, current);
}

export async function clearEventCoverOverride(eventId: string): Promise<void> {
  if (!isNonEmptyString(eventId)) {
    return;
  }

  const current = await readJsonRecord<EventCoverOverride>(EVENT_COVER_OVERRIDE_KEY);
  if (!(eventId in current)) {
    return;
  }

  delete current[eventId];
  await writeJsonRecord(EVENT_COVER_OVERRIDE_KEY, current);
}
