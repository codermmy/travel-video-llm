export type OnDeviceVisionSchemaVersion = 'single-device-vision/v1';

export type OnDeviceVisionSourcePlatform =
  | 'android-mlkit'
  | 'android-mlkit-fallback'
  | 'unsupported';

export type PeopleCountBucket = '0' | '1' | '2-3' | '4+';

export type OnDeviceVisionStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'unsupported';

export interface LocalMediaReference {
  assetId?: string;
  localUri: string;
  localThumbnailUri?: string;
  localCoverUri?: string;
}

export interface OnDeviceVisionResult {
  schema_version: OnDeviceVisionSchemaVersion;
  source_platform: OnDeviceVisionSourcePlatform;
  generated_at: string;
  scene_category: string | null;
  object_tags: string[];
  activity_hint: string | null;
  people_present: boolean;
  people_count_bucket: PeopleCountBucket;
  emotion_hint: string | null;
  ocr_text: string;
  landmark_hint: string | null;
  image_quality_flags: string[];
  cover_score: number;
  confidence_map: Record<string, number>;
}

export interface OnDeviceVisionRecord extends LocalMediaReference {
  cacheKey: string;
  hash?: string;
  width?: number;
  height?: number;
  fileSize?: number;
  status: OnDeviceVisionStatus;
  updatedAt: string;
  errorMessage?: string | null;
  result?: OnDeviceVisionResult | null;
}

export interface OnDeviceVisionAnalysisInput extends LocalMediaReference {
  cacheKey: string;
  hash?: string;
  width?: number;
  height?: number;
  fileSize?: number;
}
