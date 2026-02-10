import { apiClient } from '@/services/api/client';
import type { ApiResponse } from '@/types';
import { calculateFileHash } from '@/utils/hashUtils';
import { resolveApiUrl } from '@/utils/urlUtils';

export type UserProfile = {
  id: string;
  device_id: string | null;
  email: string | null;
  nickname: string | null;
  avatar_url: string | null;
  username: string | null;
  auth_type: string;
  created_at: string;
  updated_at: string;
};

export type UserUpdateParams = {
  nickname?: string;
  avatar_url?: string;
  username?: string;
};

type UserSearchData = {
  users: UserProfile[];
  total: number;
};

type UploadFileData = {
  url: string;
};

function normalizeUserProfile(profile: UserProfile): UserProfile {
  return {
    ...profile,
    avatar_url: resolveApiUrl(profile.avatar_url),
  };
}

async function uploadAvatarFile(uri: string): Promise<string> {
  const fileHash = await calculateFileHash(uri);
  const formData = new FormData();
  formData.append(
    'file',
    {
      uri,
      name: `${fileHash}.jpg`,
      type: 'image/jpeg',
    } as unknown as Blob,
  );

  const response = await apiClient.post<ApiResponse<UploadFileData>>('/api/v1/photos/upload/file', formData, {
    params: { file_hash: fileHash },
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  if (!response.data.data?.url) {
    throw new Error('avatar_upload_empty_response');
  }

  return response.data.data.url;
}

export const userApi = {
  async getCurrentUser(): Promise<UserProfile> {
    const response = await apiClient.get<ApiResponse<UserProfile>>('/api/v1/users/me');
    if (!response.data.data) {
      throw new Error('user_me_empty_response');
    }
    return normalizeUserProfile(response.data.data);
  },

  async updateCurrentUser(params: UserUpdateParams): Promise<UserProfile> {
    const response = await apiClient.patch<ApiResponse<UserProfile>>('/api/v1/users/me', params);
    if (!response.data.data) {
      throw new Error('user_update_empty_response');
    }
    return normalizeUserProfile(response.data.data);
  },

  async getUserById(userId: string): Promise<UserProfile> {
    const response = await apiClient.get<ApiResponse<UserProfile>>(`/api/v1/users/${userId}`);
    if (!response.data.data) {
      throw new Error('user_id_empty_response');
    }
    return normalizeUserProfile(response.data.data);
  },

  async getUserByUsername(username: string): Promise<UserProfile> {
    const response = await apiClient.get<ApiResponse<UserProfile>>(
      `/api/v1/users/by-username/${encodeURIComponent(username)}`,
    );
    if (!response.data.data) {
      throw new Error('user_username_empty_response');
    }
    return normalizeUserProfile(response.data.data);
  },

  async searchUsersByNickname(
    nickname: string,
    page = 1,
    pageSize = 20,
  ): Promise<UserSearchData> {
    const response = await apiClient.get<ApiResponse<UserSearchData>>(
      `/api/v1/users/by-nickname/${encodeURIComponent(nickname)}`,
      { params: { page, page_size: pageSize } },
    );
    if (!response.data.data) {
      throw new Error('user_nickname_empty_response');
    }
    return {
      ...response.data.data,
      users: response.data.data.users.map(normalizeUserProfile),
    };
  },

  async uploadAvatarAndUpdate(uri: string): Promise<UserProfile> {
    const avatarUrl = await uploadAvatarFile(uri);
    return this.updateCurrentUser({ avatar_url: avatarUrl });
  },
};
