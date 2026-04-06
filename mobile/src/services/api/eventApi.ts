import { apiClient } from '@/services/api/client';
import {
  buildLocalMediaLookupKeys,
  getEventCoverOverride,
  getEventCoverOverrides,
  getLocalMediaEntries,
  resolveLocalMediaEntriesByAssetIds,
} from '@/services/media/localMediaRegistry';
import type { ApiResponse } from '@/types';
import type {
  EnhancementStorageSummary,
  EnhanceStoryResult,
  EventDetail,
  EventListResult,
  EventPhotoItem,
  EventRecord,
  RegenerateStoryResult,
} from '@/types/event';
import type { LocationCityCandidate, LocationPlaceCandidate } from '@/types/location';
import { getPreferredPhotoThumbnailUri, resolveCoverCandidateFromPhotos } from '@/utils/mediaRefs';
import { resolveApiUrl } from '@/utils/urlUtils';

const MEDIA_DEBUG_ENABLED =
  typeof process !== 'undefined' &&
  typeof process.env === 'object' &&
  process.env?.EXPO_PUBLIC_MEDIA_DEBUG === '1';

function logMediaDebug(label: string, payload: Record<string, unknown>): void {
  if (MEDIA_DEBUG_ENABLED) {
    console.log(`[MediaDebug] ${label}`, payload);
  }
}

function pickMediaEntry(
  entries: Map<
    string,
    ReturnType<typeof getLocalMediaEntries> extends Promise<Map<string, infer T>> ? T : never
  >,
  ref: {
    photoId?: string | null;
    assetId?: string | null;
    fileHash?: string | null;
    shootTime?: string | null;
    gpsLat?: number | null;
    gpsLon?: number | null;
  },
) {
  const keys = buildLocalMediaLookupKeys(ref);
  for (const key of keys) {
    const entry = entries.get(key);
    if (entry) {
      return entry;
    }
  }
  return undefined;
}

function normalizeEvent(e: EventRecord): EventRecord {
  return {
    ...e,
    coverPhotoUrl: resolveApiUrl(e.coverPhotoUrl),
    musicUrl: resolveApiUrl(e.musicUrl),
    fullStory: e.fullStory ?? e.storyText ?? null,
    heroTitle: e.heroTitle ?? null,
    heroSummary: e.heroSummary ?? null,
  };
}

function normalizeEnhancement(
  enhancement?: EventDetail['enhancement'] | EnhanceStoryResult['enhancement'] | null,
) {
  if (!enhancement) {
    return {
      status: 'none' as const,
      assetCount: 0,
      totalBytes: 0,
      canRetry: false,
      lastUploadedAt: null,
      retainedUntil: null,
    };
  }
  return {
    ...enhancement,
    lastUploadedAt: enhancement.lastUploadedAt ?? null,
    retainedUntil: enhancement.retainedUntil ?? null,
  };
}

async function hydrateEventLocalCover(items: EventRecord[]): Promise<EventRecord[]> {
  const overrides = await getEventCoverOverrides(items.map((item) => item.id));
  const registryEntries = await getLocalMediaEntries(
    items.map((item) => ({
      photoId: item.coverPhotoId,
      assetId: item.coverAssetId,
      shootTime: item.coverShootTime,
      gpsLat: item.coverGpsLat,
      gpsLon: item.coverGpsLon,
    })),
  );
  const resolvedCoverEntries = await resolveLocalMediaEntriesByAssetIds(
    items.map((item) => item.coverAssetId),
  );
  const hydrated = items.map((item) => {
    const override = overrides.get(item.id);
    const coverEntry =
      (item.coverAssetId ? resolvedCoverEntries.get(`asset:${item.coverAssetId}`) : undefined) ??
      pickMediaEntry(registryEntries, {
        photoId: item.coverPhotoId,
        assetId: item.coverAssetId,
        shootTime: item.coverShootTime,
        gpsLat: item.coverGpsLat,
        gpsLon: item.coverGpsLon,
      });
    return {
      ...item,
      localCoverUri:
        override?.localCoverUri ??
        item.localCoverUri ??
        coverEntry?.localCoverUri ??
        coverEntry?.localUri ??
        null,
      selectedCoverPhotoId:
        override?.photoId ?? item.selectedCoverPhotoId ?? item.coverPhotoId ?? null,
    };
  });

  logMediaDebug('hydrateEventLocalCover', {
    eventCount: hydrated.length,
    localCoverCount: hydrated.filter((item) => Boolean(item.localCoverUri)).length,
    sample: hydrated.slice(0, 5).map((item) => ({
      eventId: item.id,
      coverPhotoId: item.coverPhotoId,
      coverAssetId: item.coverAssetId,
      coverShootTime: item.coverShootTime,
      localCoverUri: item.localCoverUri,
      coverPhotoUrl: item.coverPhotoUrl,
    })),
  });

  return hydrated;
}

async function hydrateEventDetailLocalMedia(event: EventDetail): Promise<EventDetail> {
  const registryEntries = await getLocalMediaEntries(
    event.photos.map((photo) => ({
      photoId: photo.id,
      assetId: photo.assetId,
      fileHash: photo.fileHash,
      shootTime: photo.shootTime,
      gpsLat: photo.gpsLat,
      gpsLon: photo.gpsLon,
    })),
  );
  const resolvedAssetEntries = await resolveLocalMediaEntriesByAssetIds(
    event.photos.map((photo) => photo.assetId),
  );
  const coverOverride = await getEventCoverOverride(event.id);

  const photos = event.photos.map((photo): EventPhotoItem => {
    const mediaEntry =
      (photo.assetId ? resolvedAssetEntries.get(`asset:${photo.assetId}`) : undefined) ??
      pickMediaEntry(registryEntries, {
        photoId: photo.id,
        assetId: photo.assetId,
        fileHash: photo.fileHash,
        shootTime: photo.shootTime,
        gpsLat: photo.gpsLat,
        gpsLon: photo.gpsLon,
      });
    return {
      ...photo,
      assetId: photo.assetId ?? mediaEntry?.assetId ?? null,
      width:
        typeof photo.width === 'number'
          ? photo.width
          : typeof mediaEntry?.width === 'number'
            ? mediaEntry.width
            : null,
      height:
        typeof photo.height === 'number'
          ? photo.height
          : typeof mediaEntry?.height === 'number'
            ? mediaEntry.height
            : null,
      localUri: photo.localUri ?? mediaEntry?.localUri ?? null,
      localThumbnailUri: photo.localThumbnailUri ?? mediaEntry?.localThumbnailUri ?? null,
      localCoverUri:
        photo.localCoverUri ??
        mediaEntry?.localCoverUri ??
        photo.localUri ??
        mediaEntry?.localUri ??
        photo.localThumbnailUri ??
        mediaEntry?.localThumbnailUri ??
        null,
    };
  });

  const fallbackCover = resolveCoverCandidateFromPhotos(photos, [
    coverOverride?.photoId,
    event.selectedCoverPhotoId,
    event.coverPhotoId,
  ]);
  const overrideUri =
    coverOverride?.localCoverUri ??
    (coverOverride?.photoId
      ? getPreferredPhotoThumbnailUri(photos.find((photo) => photo.id === coverOverride.photoId))
      : null);

  const hydratedEvent = {
    ...event,
    photos,
    localCoverUri: overrideUri ?? fallbackCover.uri ?? event.localCoverUri ?? null,
    selectedCoverPhotoId:
      coverOverride?.photoId ??
      fallbackCover.photoId ??
      event.selectedCoverPhotoId ??
      event.coverPhotoId ??
      null,
  };

  logMediaDebug('hydrateEventDetailLocalMedia', {
    eventId: event.id,
    totalPhotos: photos.length,
    localUriCount: photos.filter((photo) => Boolean(photo.localUri)).length,
    localCoverCount: photos.filter((photo) => Boolean(photo.localCoverUri)).length,
    localThumbCount: photos.filter((photo) => Boolean(photo.localThumbnailUri)).length,
    resolvedCoverUri: hydratedEvent.localCoverUri,
    samplePhotos: photos.slice(0, 8).map((photo) => ({
      id: photo.id,
      assetId: photo.assetId,
      fileHash: photo.fileHash,
      shootTime: photo.shootTime,
      gpsLat: photo.gpsLat,
      gpsLon: photo.gpsLon,
      localUri: photo.localUri,
      localCoverUri: photo.localCoverUri,
      thumbnailUrl: photo.thumbnailUrl,
      photoUrl: photo.photoUrl,
    })),
  });

  return hydratedEvent;
}

function normalizeEventDetail(e: EventDetail): EventDetail {
  const rawPhotos = (e as unknown as { photos?: unknown }).photos;
  const rawChapters = (e as unknown as { chapters?: unknown }).chapters;
  const rawPhotoGroups = (e as unknown as { photoGroups?: unknown }).photoGroups;
  const photos = Array.isArray(rawPhotos) ? (rawPhotos as EventDetail['photos']) : [];
  const chapters = Array.isArray(rawChapters) ? (rawChapters as EventDetail['chapters']) : [];
  const photoGroups = Array.isArray(rawPhotoGroups)
    ? (rawPhotoGroups as EventDetail['photoGroups'])
    : [];

  return {
    ...normalizeEvent(e),
    chapters,
    photoGroups,
    enhancement: normalizeEnhancement(
      (e as unknown as { enhancement?: EventDetail['enhancement'] }).enhancement,
    ),
    photos: photos.map((p) => ({
      ...p,
      photoUrl: resolveApiUrl((p as { photoUrl?: string | null }).photoUrl),
      thumbnailUrl: resolveApiUrl(p.thumbnailUrl),
    })),
  };
}

async function listEvents(params?: { page?: number; pageSize?: number }): Promise<EventListResult> {
  const response = await apiClient.get<ApiResponse<EventListResult>>('/api/v1/events/', { params });
  if (!response.data.data) {
    throw new Error('events_list_empty_response');
  }
  const rawItems = (response.data.data as unknown as { items?: unknown }).items;
  const items = Array.isArray(rawItems) ? (rawItems as EventListResult['items']) : [];
  const normalizedItems = await hydrateEventLocalCover(items.map(normalizeEvent));
  return {
    ...response.data.data,
    items: normalizedItems,
  };
}

async function listAllEvents(pageSize = 100): Promise<EventRecord[]> {
  const first = await listEvents({ page: 1, pageSize });
  const items = [...first.items];

  for (let page = 2; page <= first.totalPages; page += 1) {
    const next = await listEvents({ page, pageSize });
    items.push(...next.items);
  }

  return items;
}

async function getEventDetail(eventId: string): Promise<EventDetail> {
  const response = await apiClient.get<ApiResponse<EventDetail>>(`/api/v1/events/${eventId}`);
  if (!response.data.data) {
    throw new Error('event_detail_empty_response');
  }
  return hydrateEventDetailLocalMedia(normalizeEventDetail(response.data.data));
}

async function createEvent(payload: {
  title?: string | null;
  locationName?: string | null;
  photoIds?: string[];
}): Promise<EventRecord> {
  const response = await apiClient.post<ApiResponse<EventRecord>>('/api/v1/events/', {
    title: payload.title ?? undefined,
    locationName: payload.locationName ?? undefined,
    photoIds: payload.photoIds ?? [],
  });
  if (!response.data.data) {
    throw new Error('event_create_empty_response');
  }
  const [hydrated] = await hydrateEventLocalCover([normalizeEvent(response.data.data)]);
  return hydrated;
}

async function updateEvent(
  eventId: string,
  payload: {
    title?: string | null;
    locationName?: string | null;
    gpsLat?: number | null;
    gpsLon?: number | null;
    detailedLocation?: string | null;
    locationTags?: string | null;
  },
): Promise<EventRecord> {
  const response = await apiClient.patch<ApiResponse<EventRecord>>(
    `/api/v1/events/${eventId}`,
    payload,
  );
  if (!response.data.data) {
    throw new Error('event_update_empty_response');
  }
  const [hydrated] = await hydrateEventLocalCover([normalizeEvent(response.data.data)]);
  return hydrated;
}

async function searchLocationCities(query: string): Promise<LocationCityCandidate[]> {
  const response = await apiClient.get<ApiResponse<LocationCityCandidate[]>>(
    '/api/v1/events/location-search/cities',
    {
      params: { query },
    },
  );
  return response.data.data ?? [];
}

async function searchLocationPlaces(
  query: string,
  city: string,
): Promise<LocationPlaceCandidate[]> {
  const response = await apiClient.get<ApiResponse<LocationPlaceCandidate[]>>(
    '/api/v1/events/location-search/places',
    {
      params: { query, city },
    },
  );
  return response.data.data ?? [];
}

async function deleteEvent(eventId: string): Promise<void> {
  await apiClient.delete(`/api/v1/events/${eventId}`);
}

async function regenerateStory(eventId: string): Promise<RegenerateStoryResult> {
  const response = await apiClient.post<ApiResponse<RegenerateStoryResult>>(
    `/api/v1/events/${eventId}/regenerate-story`,
  );
  if (!response.data.data) {
    throw new Error('event_regenerate_story_empty_response');
  }
  return response.data.data;
}

async function enhanceStory(
  eventId: string,
  params:
    | {
        reuseExisting: true;
      }
    | {
        reuseExisting?: false;
        uploads: {
          photoId: string;
          fileUri: string;
          fileName: string;
          mimeType: string;
        }[];
      },
): Promise<EnhanceStoryResult> {
  const form = new FormData();

  if (params.reuseExisting) {
    form.append('reuseExisting', 'true');
  } else {
    params.uploads.forEach((item) => {
      form.append('photoIds', item.photoId);
      form.append('files', {
        uri: item.fileUri,
        name: item.fileName,
        type: item.mimeType,
      } as never);
    });
  }

  const response = await apiClient.post<ApiResponse<EnhanceStoryResult>>(
    `/api/v1/events/${eventId}/enhance-story`,
    form,
    {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 60_000,
    },
  );
  if (!response.data.data) {
    throw new Error('event_enhance_story_empty_response');
  }
  return {
    ...response.data.data,
    enhancement: normalizeEnhancement(response.data.data.enhancement),
  };
}

async function getEnhancementStorageSummary(): Promise<EnhancementStorageSummary> {
  const response = await apiClient.get<ApiResponse<EnhancementStorageSummary>>(
    '/api/v1/events/enhancement-storage/summary',
  );
  if (!response.data.data) {
    throw new Error('enhancement_storage_summary_empty_response');
  }
  return response.data.data;
}

async function clearEnhancementStorage(): Promise<EnhancementStorageSummary> {
  const response = await apiClient.delete<ApiResponse<EnhancementStorageSummary>>(
    '/api/v1/events/enhancement-storage',
  );
  if (!response.data.data) {
    throw new Error('enhancement_storage_clear_empty_response');
  }
  return response.data.data;
}

export const eventApi = {
  listEvents,
  listAllEvents,
  getEventDetail,
  createEvent,
  updateEvent,
  searchLocationCities,
  searchLocationPlaces,
  deleteEvent,
  regenerateStory,
  enhanceStory,
  getEnhancementStorageSummary,
  clearEnhancementStorage,
};
