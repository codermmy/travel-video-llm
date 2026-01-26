import { apiClient } from '@/services/api/client';
import type { ApiResponse } from '@/types';
import type { EventDetail, EventListResult, EventRecord } from '@/types/event';

async function listEvents(params?: { page?: number; pageSize?: number }): Promise<EventListResult> {
  const response = await apiClient.get<ApiResponse<EventListResult>>('/api/v1/events', { params });
  if (!response.data.data) {
    throw new Error('events_list_empty_response');
  }
  return response.data.data;
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
  return response.data.data;
}

export const eventApi = {
  listEvents,
  listAllEvents,
  getEventDetail,
};
