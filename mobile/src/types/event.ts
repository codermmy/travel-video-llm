export interface EventRecord {
  id: string;
  title: string;
  locationName?: string | null;
  gpsLat?: number | null;
  gpsLon?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  photoCount: number;
  coverPhotoUrl?: string | null;
  storyText?: string | null;
  emotionTag?: string | null;
  musicUrl?: string | null;
  status: string;
}

export interface EventListResult {
  items: EventRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface EventPhotoItem {
  id: string;
  thumbnailUrl?: string | null;
  shootTime?: string | null;
}

export interface EventDetail extends EventRecord {
  photos: EventPhotoItem[];
}
