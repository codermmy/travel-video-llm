export interface PhotoExif {
  gpsLat?: number;
  gpsLon?: number;
  hasGps: boolean;
  shootTime: string;
  cameraMake?: string;
  cameraModel?: string;
}

export interface PhotoMetadata {
  uri: string;
  hash: string;
  width: number;
  height: number;
  fileSize?: number;
  exif: PhotoExif;
}

export interface PhotoHashResult {
  uri: string;
  hash: string;
  width: number;
  height: number;
}

export interface PhotoRecord {
  id: string;
  fileHash?: string | null;
  thumbnailUrl?: string | null;
  gpsLat?: number | null;
  gpsLon?: number | null;
  shootTime?: string | null;
  eventId?: string | null;
  status?: string | null;
}

export interface PhotoUploadResult {
  uploaded: number;
  failed: number;
  taskId?: string | null;
}

export interface PhotoListResult {
  items: PhotoRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PhotoStats {
  total: number;
  withGps: number;
  withoutGps: number;
  clustered: number;
  unclustered: number;
}
