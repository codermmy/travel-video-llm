import { apiClient } from '@/services/api/client';
import type { ApiResponse } from '@/types';

export type TaskStatus = {
  taskId: string;
  taskType: string;
  status: string;
  stage: 'pending' | 'clustering' | 'geocoding' | 'ai';
  progress: number;
  total: number;
  result: string | null;
  error: string | null;
  createdAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export async function getTaskStatus(taskId: string): Promise<TaskStatus> {
  const response = await apiClient.get<ApiResponse<TaskStatus>>(`/api/v1/tasks/status/${taskId}`);
  if (!response.data.data) {
    throw new Error('task_status_empty_response');
  }
  return response.data.data;
}

export const taskApi = {
  getTaskStatus,
};
