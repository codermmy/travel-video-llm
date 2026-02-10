import { apiClient } from '@/services/api/client';
import { syncStorage } from '@/services/sync/syncStorage';
import type { ApiResponse } from '@/types';
import type { EventRecord } from '@/types/event';

type SyncStatus = {
  deviceId: string;
  isFirstSyncOnDevice: boolean;
  needsSync: boolean;
  cloud: {
    eventCount: number;
    photoCount: number;
    cursor: string | null;
  };
  device: {
    lastPullCursor: string | null;
    lastPullAt: string | null;
  };
  serverTime: string;
};

type SyncPullResponse = {
  mode: 'metadata_only';
  events: EventRecord[];
  deletedEventIds: string[];
  newCursor: string | null;
  stats: {
    pulledEvents: number;
    cloudEventCount: number;
  };
};

let bootstrapActive = false;

export const syncService = {
  setBootstrapActive(active: boolean) {
    bootstrapActive = active;
  },

  isBootstrapActive() {
    return bootstrapActive;
  },

  async getStatus(): Promise<SyncStatus> {
    const response = await apiClient.get<ApiResponse<SyncStatus>>('/api/v1/sync/status');
    if (!response.data.data) {
      throw new Error('sync_status_empty_response');
    }
    return response.data.data;
  },

  async pullMetadata(sinceCursor?: string | null): Promise<SyncPullResponse> {
    const response = await apiClient.post<ApiResponse<SyncPullResponse>>('/api/v1/sync/pull', {
      mode: 'metadata_only',
      sinceCursor: sinceCursor || undefined,
    });
    if (!response.data.data) {
      throw new Error('sync_pull_empty_response');
    }
    return response.data.data;
  },

  async ack(cursor?: string | null): Promise<void> {
    await apiClient.post<ApiResponse<{ ok: boolean }>>('/api/v1/sync/ack', {
      cursor: cursor || undefined,
    });
  },

  async runMetadataSync(userId: string): Promise<SyncPullResponse> {
    const local = await syncStorage.get(userId);
    const result = await this.pullMetadata(local?.lastCursor);
    await this.ack(result.newCursor);
    await syncStorage.save(userId, {
      lastCursor: result.newCursor,
      lastPullAt: new Date().toISOString(),
    });
    return result;
  },

  async markSynced(userId: string, cursor: string | null): Promise<void> {
    await syncStorage.save(userId, {
      lastCursor: cursor,
      lastPullAt: new Date().toISOString(),
    });
  },

  async getLocalState(userId: string) {
    return syncStorage.get(userId);
  },
};

export type { SyncPullResponse, SyncStatus };
