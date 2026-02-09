import { apiClient } from '@/services/api/client';
import type { ApiResponse } from '@/types';
import type {
  EventDetail,
  EventListResult,
  EventRecord,
  RegenerateStoryResult,
} from '@/types/event';
import { resolveApiUrl } from '@/utils/urlUtils';

function normalizeEvent(e: EventRecord): EventRecord {
  return {
    ...e,
    coverPhotoUrl: resolveApiUrl(e.coverPhotoUrl),
  };
}

function normalizeEventDetail(e: EventDetail): EventDetail {
  const rawPhotos = (e as unknown as { photos?: unknown }).photos;
  const photos = Array.isArray(rawPhotos) ? (rawPhotos as EventDetail['photos']) : [];
  return {
    ...normalizeEvent(e),
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
  return {
    ...response.data.data,
    items: items.map(normalizeEvent),
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
  return normalizeEventDetail(response.data.data);
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

export const eventApi = {
  listEvents,
  listAllEvents,
  getEventDetail,
  regenerateStory,
};
