import { apiClient, fetchWithRetry } from '@/services/api/client';
import type {
  SlideshowAudioManifestTrack,
  SlideshowAudioPlan,
  SlideshowAudioSegment,
  SlideshowEventContext,
  SlideshowPhoto,
  SlideshowTimelineScene,
} from '@/types/slideshow';
import { resolveApiUrl } from '@/utils/urlUtils';

const MANIFEST_PATH = '/uploads/music/pixabay/manifests/pixabay_music_manifest.json';

const SELECTION_BUCKET_ORDER = [
  'Travel cinematic / opening',
  'Nature / calm / healing',
  'Daylight / happy / urban walk',
  'Lounge / lofi / night city',
  'Optional trendier vlog cuts',
  'Cinematic / emotional / documentary-friendly',
  'Travel acoustic / indie / road trip',
  'Cafe / lounge / city / lifestyle',
  'Sunset / tropical / beach',
  'Calm / nature / reflective',
  'Urban / montage / extra lofi options',
] as const;

const BUCKET_PROFILES: Record<
  string,
  { moodTags: string[]; sceneTags: string[]; energyTarget: number }
> = {
  'Travel cinematic / opening': {
    moodTags: ['cinematic', 'hopeful', 'opening'],
    sceneTags: ['opening', 'landscape', 'montage'],
    energyTarget: 3,
  },
  'Nature / calm / healing': {
    moodTags: ['calm', 'healing', 'nature'],
    sceneTags: ['nature', 'landscape', 'healing'],
    energyTarget: 2,
  },
  'Daylight / happy / urban walk': {
    moodTags: ['happy', 'light', 'daylight'],
    sceneTags: ['street', 'walk', 'city', 'daylight'],
    energyTarget: 3,
  },
  'Lounge / lofi / night city': {
    moodTags: ['lofi', 'lounge', 'night'],
    sceneTags: ['night', 'city', 'lounge', 'cafe'],
    energyTarget: 2,
  },
  'Optional trendier vlog cuts': {
    moodTags: ['vlog', 'modern', 'light-groove'],
    sceneTags: ['vlog', 'city', 'montage'],
    energyTarget: 3,
  },
  'Cinematic / emotional / documentary-friendly': {
    moodTags: ['cinematic', 'emotional', 'documentary'],
    sceneTags: ['documentary', 'landscape', 'voiceover'],
    energyTarget: 2,
  },
  'Travel acoustic / indie / road trip': {
    moodTags: ['acoustic', 'indie', 'road-trip'],
    sceneTags: ['roadtrip', 'daylight', 'people', 'walk'],
    energyTarget: 4,
  },
  'Cafe / lounge / city / lifestyle': {
    moodTags: ['cafe', 'lounge', 'lifestyle'],
    sceneTags: ['cafe', 'food', 'city', 'lifestyle'],
    energyTarget: 2,
  },
  'Sunset / tropical / beach': {
    moodTags: ['sunset', 'tropical', 'beach'],
    sceneTags: ['sunset', 'beach', 'sea', 'tropical'],
    energyTarget: 3,
  },
  'Calm / nature / reflective': {
    moodTags: ['reflective', 'nature', 'peaceful'],
    sceneTags: ['nature', 'reflection', 'slow'],
    energyTarget: 1,
  },
  'Urban / montage / extra lofi options': {
    moodTags: ['urban', 'montage', 'lofi'],
    sceneTags: ['city', 'montage', 'night', 'walk'],
    energyTarget: 3,
  },
};

type WeightMap = Map<string, number>;
type SignalProfile = {
  mood: WeightMap;
  scene: WeightMap;
  energyVotes: number[];
};

type RawManifestTrack = {
  provider?: string;
  selection_bucket?: string;
  title?: string;
  artist_slug?: string;
  source_track_id?: string;
  source_slug?: string;
  source_url?: string;
  local_filename?: string;
  relative_url?: string;
  mood_tags?: string;
  energy?: number;
  scene_fit?: string;
  recommended_start_sec?: number;
  recommended_end_sec?: number;
  duration_sec?: number;
  fade_in_ms?: number;
  fade_out_ms?: number;
  status?: string;
};

let manifestPromise: Promise<SlideshowAudioManifestTrack[]> | null = null;

function normalizeToken(value?: string | null): string {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
}

function splitTagList(value?: string | null): string[] {
  return String(value || '')
    .split('|')
    .map((item) => normalizeToken(item))
    .filter(Boolean);
}

function mapManifestTrack(item: RawManifestTrack): SlideshowAudioManifestTrack | null {
  const sourceTrackId = String(item.source_track_id || '').trim();
  const relativeUrl = resolveApiUrl(item.relative_url);
  const selectionBucket = String(item.selection_bucket || '').trim();
  if (!sourceTrackId || !relativeUrl || !selectionBucket) {
    return null;
  }
  return {
    provider: String(item.provider || 'pixabay').trim() || 'pixabay',
    selectionBucket,
    title: String(item.title || 'Untitled').trim() || 'Untitled',
    artistSlug: String(item.artist_slug || '').trim(),
    sourceTrackId,
    sourceSlug: String(item.source_slug || '').trim(),
    sourceUrl: String(item.source_url || '').trim(),
    localFilename: String(item.local_filename || '').trim(),
    relativeUrl,
    moodTags: splitTagList(item.mood_tags),
    energy: Number(item.energy || 3),
    sceneFit: splitTagList(item.scene_fit),
    recommendedStartSec: Number(item.recommended_start_sec || 0),
    recommendedEndSec: Number(item.recommended_end_sec || -1),
    durationSec: Math.max(0, Number(item.duration_sec || 0)),
    fadeInMs: Math.max(0, Number(item.fade_in_ms || 0)),
    fadeOutMs: Math.max(0, Number(item.fade_out_ms || 0)),
    status: String(item.status || 'ready').trim() || 'ready',
  };
}

async function loadPixabayManifest(): Promise<SlideshowAudioManifestTrack[]> {
  if (!manifestPromise) {
    manifestPromise = fetchWithRetry(async () => {
      const response = await apiClient.get<RawManifestTrack[]>(MANIFEST_PATH);
      return (Array.isArray(response.data) ? response.data : [])
        .map(mapManifestTrack)
        .filter((item): item is SlideshowAudioManifestTrack => Boolean(item))
        .filter((item) => item.status === 'ready');
    });
  }
  return manifestPromise;
}

function incrementWeight(map: WeightMap, token: string, amount: number): void {
  if (!token || amount <= 0) {
    return;
  }
  map.set(token, (map.get(token) || 0) + amount);
}

function addMoodTags(profile: SignalProfile, tags: string[], amount: number): void {
  tags.forEach((tag) => incrementWeight(profile.mood, normalizeToken(tag), amount));
}

function addSceneTags(profile: SignalProfile, tags: string[], amount: number): void {
  tags.forEach((tag) => incrementWeight(profile.scene, normalizeToken(tag), amount));
}

function addEnergyVote(profile: SignalProfile, value: number, amount = 1): void {
  for (let index = 0; index < amount; index += 1) {
    profile.energyVotes.push(value);
  }
}

function applyTextRules(profile: SignalProfile, text?: string | null, amount = 1): void {
  const normalized = String(text || '')
    .trim()
    .toLowerCase();
  if (!normalized) {
    return;
  }

  const rules: {
    keywords: string[];
    mood?: string[];
    scene?: string[];
    energy?: number;
  }[] = [
    {
      keywords: ['joyful', 'happy', 'pleasant', '开心', '快乐', '明亮', '轻快', '热闹', '轻松'],
      mood: ['happy', 'light', 'daylight'],
      scene: ['daylight', 'walk'],
      energy: 3,
    },
    {
      keywords: ['peaceful', 'calm', 'neutral', '治愈', '平静', '安静', '松弛', '舒服', '柔和'],
      mood: ['calm', 'healing', 'peaceful'],
      scene: ['nature', 'slow', 'reflection'],
      energy: 2,
    },
    {
      keywords: ['epic', 'cinematic', 'opening', '史诗', '电影感', '壮阔', '开场'],
      mood: ['cinematic', 'hopeful', 'opening'],
      scene: ['opening', 'landscape', 'montage'],
      energy: 3,
    },
    {
      keywords: ['emotional', 'nostalgic', 'romantic', '温馨', '回忆', '情绪', '浪漫', '感动'],
      mood: ['emotional', 'reflective', 'documentary'],
      scene: ['documentary', 'reflection'],
      energy: 2,
    },
    {
      keywords: ['night', 'midnight', '夜', '夜景', '霓虹', '酒吧'],
      mood: ['night', 'lofi', 'lounge'],
      scene: ['night', 'city', 'lounge'],
      energy: 2,
    },
    {
      keywords: ['cafe', 'coffee', '餐厅', '咖啡', '甜点', '美食', '餐酒', 'brunch'],
      mood: ['cafe', 'lounge', 'lifestyle'],
      scene: ['cafe', 'food', 'lifestyle'],
      energy: 2,
    },
    {
      keywords: ['sunset', 'golden hour', 'beach', 'sea', 'ocean', '海', '海边', '日落', '沙滩'],
      mood: ['sunset', 'tropical', 'beach'],
      scene: ['sunset', 'beach', 'sea', 'tropical'],
      energy: 3,
    },
    {
      keywords: ['road trip', 'roadtrip', 'drive', 'walk', '徒步', '公路', '旅程', '出发'],
      mood: ['acoustic', 'indie', 'road-trip'],
      scene: ['roadtrip', 'walk', 'daylight'],
      energy: 4,
    },
    {
      keywords: ['nature', 'forest', 'mountain', 'lake', 'park', '森林', '山', '湖', '自然'],
      mood: ['nature', 'healing', 'peaceful'],
      scene: ['nature', 'landscape', 'slow'],
      energy: 2,
    },
    {
      keywords: ['city', 'street', 'tower', 'bridge', 'museum', '城市', '街头', '夜市', '博物馆'],
      mood: ['urban', 'montage', 'modern'],
      scene: ['city', 'walk', 'montage'],
      energy: 3,
    },
  ];

  for (const rule of rules) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      addMoodTags(profile, rule.mood || [], amount);
      addSceneTags(profile, rule.scene || [], amount);
      if (rule.energy) {
        addEnergyVote(profile, rule.energy, Math.max(1, Math.round(amount)));
      }
    }
  }
}

function applyPhotoSignals(profile: SignalProfile, photo: SlideshowPhoto): void {
  applyTextRules(profile, photo.caption, 0.6);
  applyTextRules(profile, photo.microStory, 0.8);
  applyTextRules(profile, photo.visualDesc, 0.6);
  applyTextRules(profile, photo.emotionTag, 0.8);

  const vision = photo.vision;
  if (!vision) {
    return;
  }

  applyTextRules(profile, vision.emotion_hint, 0.9);
  applyTextRules(profile, vision.scene_category, 1.1);
  applyTextRules(profile, vision.activity_hint, 1.0);
  applyTextRules(profile, vision.landmark_hint, 0.9);
  applyTextRules(profile, vision.ocr_text, 0.4);
  addSceneTags(profile, vision.object_tags, 0.5);

  if (vision.scene_category === 'food_and_dining') {
    addSceneTags(profile, ['cafe', 'food', 'lifestyle'], 1.2);
    addMoodTags(profile, ['cafe', 'lounge'], 1);
    addEnergyVote(profile, 2, 2);
  }
  if (vision.scene_category === 'beach') {
    addSceneTags(profile, ['sunset', 'beach', 'sea'], 1.2);
    addMoodTags(profile, ['sunset', 'tropical'], 1);
    addEnergyVote(profile, 3, 2);
  }
  if (vision.scene_category === 'nature' || vision.scene_category === 'mountain') {
    addSceneTags(profile, ['nature', 'landscape'], 1.2);
    addMoodTags(profile, ['peaceful', 'healing'], 1);
    addEnergyVote(profile, 2, 2);
  }
  if (vision.scene_category === 'city' || vision.scene_category === 'landmark') {
    addSceneTags(profile, ['city', 'walk', 'montage'], 1.1);
    addMoodTags(profile, ['urban', 'modern'], 0.8);
    addEnergyVote(profile, 3, 2);
  }

  if (photo.shootTime) {
    const hour = new Date(photo.shootTime).getHours();
    if (hour >= 18 || hour < 5) {
      addSceneTags(profile, ['night', 'city'], 0.7);
      addMoodTags(profile, ['night', 'lofi'], 0.6);
      addEnergyVote(profile, 2);
    } else if (hour >= 16 && hour <= 19) {
      addSceneTags(profile, ['sunset'], 0.7);
      addMoodTags(profile, ['sunset'], 0.6);
      addEnergyVote(profile, 3);
    } else {
      addSceneTags(profile, ['daylight'], 0.4);
      addMoodTags(profile, ['light'], 0.3);
      addEnergyVote(profile, 3);
    }
  }
}

function buildSignalProfile(
  event: SlideshowEventContext,
  photos: SlideshowPhoto[],
  timeline: SlideshowTimelineScene[],
): SignalProfile {
  const profile: SignalProfile = {
    mood: new Map<string, number>(),
    scene: new Map<string, number>(),
    energyVotes: [],
  };

  applyTextRules(profile, event.emotionTag, 1.4);
  applyTextRules(profile, event.title, 0.9);
  applyTextRules(profile, event.storyText, 0.7);
  applyTextRules(profile, event.fullStory, 0.7);

  for (const chapter of event.chapters || []) {
    applyTextRules(profile, chapter.chapterTitle, 0.8);
    applyTextRules(profile, chapter.chapterIntro, 0.8);
    applyTextRules(profile, chapter.chapterSummary, 0.8);
    applyTextRules(profile, chapter.chapterStory, 1);
    applyTextRules(profile, chapter.slideshowCaption, 1);
  }

  for (const group of event.photoGroups || []) {
    applyTextRules(profile, group.groupEmotion, 0.9);
    applyTextRules(profile, group.groupTheme, 0.7);
    applyTextRules(profile, group.groupSceneDesc, 0.8);
  }

  photos.forEach((photo) => applyPhotoSignals(profile, photo));

  const natureSceneCount = timeline.filter((scene) => scene.type !== 'photo').length;
  if (natureSceneCount > 0) {
    addSceneTags(profile, ['montage'], 0.4 * natureSceneCount);
  }

  if (profile.mood.size === 0) {
    addMoodTags(profile, ['cinematic', 'hopeful'], 1);
    addEnergyVote(profile, 3, 2);
  }
  if (profile.scene.size === 0) {
    addSceneTags(profile, ['landscape', 'montage'], 1);
  }

  return profile;
}

function averageWeightedMatch(tokens: string[], weights: WeightMap): number {
  if (tokens.length === 0) {
    return 0;
  }
  const total = tokens.reduce((sum, token) => sum + (weights.get(normalizeToken(token)) || 0), 0);
  const maxWeight = Math.max(1, ...Array.from(weights.values()), 1);
  return Math.max(0, Math.min(total / (tokens.length * maxWeight), 1));
}

function getEnergyTarget(profile: SignalProfile): number {
  if (profile.energyVotes.length === 0) {
    return 3;
  }
  const average =
    profile.energyVotes.reduce((sum, value) => sum + value, 0) / profile.energyVotes.length;
  return Math.max(1, Math.min(4, average));
}

function getBucketScore(bucket: string, profile: SignalProfile): number {
  const definition = BUCKET_PROFILES[bucket];
  if (!definition) {
    return 0;
  }
  const moodScore = averageWeightedMatch(definition.moodTags, profile.mood);
  const sceneScore = averageWeightedMatch(definition.sceneTags, profile.scene);
  const energyTarget = getEnergyTarget(profile);
  const energyScore = 1 - Math.min(Math.abs(definition.energyTarget - energyTarget), 3) / 3;
  return moodScore * 0.55 + sceneScore * 0.45 + energyScore * 0.08;
}

function getTrackScore(track: SlideshowAudioManifestTrack, profile: SignalProfile): number {
  const bucketScore = getBucketScore(track.selectionBucket, profile);
  const moodScore = averageWeightedMatch(track.moodTags, profile.mood);
  const sceneScore = averageWeightedMatch(track.sceneFit, profile.scene);
  const energyTarget = getEnergyTarget(profile);
  const energyScore = 1 - Math.min(Math.abs(track.energy - energyTarget), 3) / 3;
  const durationScore = Math.min(track.durationSec / 180, 1);
  return (
    bucketScore + moodScore * 0.18 + sceneScore * 0.16 + energyScore * 0.08 + durationScore * 0.04
  );
}

function getAvailableTrackWindow(track: SlideshowAudioManifestTrack): {
  startMs: number;
  endMs: number;
  availableMs: number;
} {
  const durationMs = Math.max(track.durationSec * 1000, 45_000);
  const startMs = Math.max(0, track.recommendedStartSec * 1000);
  const rawEndMs = track.recommendedEndSec > 0 ? track.recommendedEndSec * 1000 : durationMs;
  const endMs = Math.max(startMs + 8_000, Math.min(rawEndMs, durationMs));
  return {
    startMs,
    endMs,
    availableMs: Math.max(8_000, endMs - startMs),
  };
}

function getBucketCompatibility(primaryBucket: string, candidateBucket: string): number {
  if (primaryBucket === candidateBucket) {
    return 1;
  }
  const primaryIndex = SELECTION_BUCKET_ORDER.indexOf(
    primaryBucket as (typeof SELECTION_BUCKET_ORDER)[number],
  );
  const candidateIndex = SELECTION_BUCKET_ORDER.indexOf(
    candidateBucket as (typeof SELECTION_BUCKET_ORDER)[number],
  );
  if (primaryIndex < 0 || candidateIndex < 0) {
    return 0;
  }
  const distance = Math.abs(primaryIndex - candidateIndex);
  if (distance === 1) {
    return 0.72;
  }
  if (distance === 2) {
    return 0.42;
  }
  return 0;
}

function buildPlanFromManifest(
  tracks: SlideshowAudioManifestTrack[],
  totalDurationMs: number,
  profile: SignalProfile,
): SlideshowAudioPlan {
  const readyTracks = tracks.filter((track) => track.status === 'ready');
  if (readyTracks.length === 0) {
    return {
      strategy: 'fallback',
      totalDurationMs,
      segments: [],
      tracks: [],
      reason: 'manifest_empty',
    };
  }

  const rankedTracks = [...readyTracks]
    .map((track) => ({ track, score: getTrackScore(track, profile) }))
    .sort((left, right) => right.score - left.score);
  const primaryTrack = rankedTracks[0]?.track;
  if (!primaryTrack) {
    return {
      strategy: 'fallback',
      totalDurationMs,
      segments: [],
      tracks: [],
      reason: 'primary_track_missing',
    };
  }

  const primaryWindow = getAvailableTrackWindow(primaryTrack);
  const compatibleCandidates = rankedTracks
    .filter(({ track }) => track.sourceTrackId !== primaryTrack.sourceTrackId)
    .filter(
      ({ track }) =>
        getBucketCompatibility(primaryTrack.selectionBucket, track.selectionBucket) >= 0.72,
    )
    .map(({ track }) => track);

  const needsMultiTrack =
    totalDurationMs > Math.min(primaryWindow.availableMs + 12_000, 65_000) &&
    compatibleCandidates.length > 0;

  const selectedTracks: SlideshowAudioManifestTrack[] = [primaryTrack];
  const segments: SlideshowAudioSegment[] = [];
  let cursorMs = 0;

  const appendSegment = (
    track: SlideshowAudioManifestTrack,
    desiredDurationMs: number,
    segmentIndex: number,
  ): number => {
    const window = getAvailableTrackWindow(track);
    const clipDurationMs = Math.max(8_000, Math.min(window.availableMs, desiredDurationMs));
    let sourceStartMs = window.startMs;
    if (clipDurationMs < window.availableMs) {
      const extraRoomMs = window.availableMs - clipDurationMs;
      sourceStartMs = Math.min(window.startMs + extraRoomMs / 2, window.endMs - clipDurationMs);
    }
    const sourceEndMs = sourceStartMs + clipDurationMs;
    const fadeInMs = Math.min(track.fadeInMs, Math.floor(clipDurationMs / 4));
    const fadeOutMs = Math.min(track.fadeOutMs, Math.floor(clipDurationMs / 4));
    segments.push({
      id: `${track.sourceTrackId}-${segmentIndex}`,
      trackId: track.sourceTrackId,
      title: track.title,
      selectionBucket: track.selectionBucket,
      sourceUrl: track.relativeUrl,
      sourceStartMs,
      sourceEndMs,
      timelineStartMs: cursorMs,
      timelineEndMs: cursorMs + clipDurationMs,
      fadeInMs,
      fadeOutMs,
    });
    cursorMs += clipDurationMs;
    return clipDurationMs;
  };

  if (!needsMultiTrack || totalDurationMs <= primaryWindow.availableMs) {
    appendSegment(primaryTrack, totalDurationMs, 0);
    return {
      strategy: 'manifest-primary',
      totalDurationMs,
      segments,
      tracks: selectedTracks,
      reason: null,
    };
  }

  appendSegment(primaryTrack, Math.min(primaryWindow.availableMs, totalDurationMs), 0);

  let remainingMs = totalDurationMs - cursorMs;
  let segmentIndex = 1;

  for (const candidate of compatibleCandidates) {
    if (remainingMs <= 0) {
      break;
    }
    selectedTracks.push(candidate);
    const window = getAvailableTrackWindow(candidate);
    appendSegment(candidate, Math.min(window.availableMs, remainingMs), segmentIndex);
    remainingMs = totalDurationMs - cursorMs;
    segmentIndex += 1;
    if (selectedTracks.length >= 3) {
      break;
    }
  }

  const safeSwitchAvailable = compatibleCandidates.length >= 2;
  while (cursorMs < totalDurationMs) {
    appendSegment(primaryTrack, totalDurationMs - cursorMs, segmentIndex);
    segmentIndex += 1;
    remainingMs = totalDurationMs - cursorMs;
    if (remainingMs <= 0) {
      break;
    }
  }

  return {
    strategy: safeSwitchAvailable ? 'manifest-multi' : 'manifest-loop',
    totalDurationMs,
    segments,
    tracks: Array.from(
      new Map(selectedTracks.map((track) => [track.sourceTrackId, track])).values(),
    ),
    reason: safeSwitchAvailable ? null : 'compatible_bucket_insufficient',
  };
}

export async function buildSlideshowAudioPlan(params: {
  event: SlideshowEventContext;
  photos: SlideshowPhoto[];
  timeline: SlideshowTimelineScene[];
}): Promise<SlideshowAudioPlan> {
  const totalDurationMs = params.timeline[params.timeline.length - 1]?.endMs ?? 0;
  if (totalDurationMs <= 0) {
    return {
      strategy: 'fallback',
      totalDurationMs: 0,
      segments: [],
      tracks: [],
      reason: 'timeline_empty',
    };
  }

  try {
    const tracks = await loadPixabayManifest();
    const profile = buildSignalProfile(params.event, params.photos, params.timeline);
    return buildPlanFromManifest(tracks, totalDurationMs, profile);
  } catch (error) {
    if (params.event.musicUrl) {
      return {
        strategy: 'legacy-event',
        totalDurationMs,
        segments: [
          {
            id: 'legacy-event-track',
            trackId: 'legacy-event-track',
            title: 'Legacy Event Track',
            selectionBucket: 'legacy',
            sourceUrl: resolveApiUrl(params.event.musicUrl) || params.event.musicUrl,
            sourceStartMs: 0,
            sourceEndMs: totalDurationMs,
            timelineStartMs: 0,
            timelineEndMs: totalDurationMs,
            fadeInMs: 1000,
            fadeOutMs: 1400,
          },
        ],
        tracks: [],
        reason: error instanceof Error ? error.message : 'manifest_load_failed',
      };
    }

    return {
      strategy: 'fallback',
      totalDurationMs,
      segments: [],
      tracks: [],
      reason: error instanceof Error ? error.message : 'manifest_load_failed',
    };
  }
}

export function getAudioSegmentAtPosition(
  plan: SlideshowAudioPlan | null | undefined,
  positionMs: number,
): SlideshowAudioSegment | null {
  if (!plan || plan.segments.length === 0) {
    return null;
  }
  const clampedPositionMs = Math.max(
    0,
    Math.min(positionMs, Math.max(plan.totalDurationMs - 1, 0)),
  );
  return (
    plan.segments.find(
      (segment) =>
        clampedPositionMs >= segment.timelineStartMs && clampedPositionMs < segment.timelineEndMs,
    ) ??
    plan.segments[plan.segments.length - 1] ??
    null
  );
}

export function getAudioVolumeAtPosition(
  segment: SlideshowAudioSegment | null | undefined,
  positionMs: number,
): number {
  if (!segment) {
    return 0;
  }
  const localPositionMs = positionMs - segment.timelineStartMs;
  const durationMs = segment.timelineEndMs - segment.timelineStartMs;
  if (durationMs <= 0) {
    return 0;
  }

  let volume = 1;
  if (segment.fadeInMs > 0 && localPositionMs < segment.fadeInMs) {
    volume = Math.min(volume, Math.max(localPositionMs / segment.fadeInMs, 0));
  }
  const fadeOutStartMs = durationMs - segment.fadeOutMs;
  if (segment.fadeOutMs > 0 && localPositionMs > fadeOutStartMs) {
    volume = Math.min(volume, Math.max((durationMs - localPositionMs) / segment.fadeOutMs, 0));
  }
  return Math.max(0, Math.min(volume, 1));
}
