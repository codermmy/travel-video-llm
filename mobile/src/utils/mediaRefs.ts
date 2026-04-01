import type { EventPhotoItem, EventRecord } from '@/types/event';

function uniqUris(input: (string | null | undefined)[]): string[] {
  const result: string[] = [];
  for (const value of input) {
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed || result.includes(trimmed)) {
      continue;
    }
    result.push(trimmed);
  }
  return result;
}

export function getPhotoThumbnailCandidates(photo?: EventPhotoItem | null): string[] {
  if (!photo) {
    return [];
  }
  return uniqUris([photo.localThumbnailUri, photo.localUri, photo.thumbnailUrl, photo.photoUrl]);
}

export function getPhotoCoverCandidates(photo?: EventPhotoItem | null): string[] {
  if (!photo) {
    return [];
  }
  return uniqUris([
    photo.localCoverUri,
    photo.localThumbnailUri,
    photo.localUri,
    photo.thumbnailUrl,
    photo.photoUrl,
  ]);
}

export function getPhotoOriginalCandidates(photo?: EventPhotoItem | null): string[] {
  if (!photo) {
    return [];
  }
  return uniqUris([photo.localUri, photo.photoUrl, photo.localThumbnailUri, photo.thumbnailUrl]);
}

export function getPreferredPhotoThumbnailUri(photo?: EventPhotoItem | null): string | null {
  return getPhotoThumbnailCandidates(photo)[0] ?? null;
}

export function getPreferredPhotoUri(photo?: EventPhotoItem | null): string | null {
  return getPhotoOriginalCandidates(photo)[0] ?? null;
}

export function resolveCoverCandidateFromPhotos(
  photos: EventPhotoItem[],
  preferredPhotoIds: (string | null | undefined)[] = [],
): { photoId: string | null; uri: string | null } {
  for (const preferredPhotoId of preferredPhotoIds) {
    if (!preferredPhotoId) {
      continue;
    }
    const matched = photos.find((photo) => photo.id === preferredPhotoId);
    const matchedUri = getPhotoCoverCandidates(matched)[0] ?? null;
    if (matched && matchedUri) {
      return { photoId: matched.id, uri: matchedUri };
    }
  }

  for (const photo of photos) {
    const uri = getPhotoCoverCandidates(photo)[0] ?? null;
    if (uri) {
      return { photoId: photo.id, uri };
    }
  }

  return { photoId: null, uri: null };
}

export function getPreferredEventCoverUri(event?: EventRecord | null): string | null {
  if (!event) {
    return null;
  }
  return event.localCoverUri ?? event.coverPhotoUrl ?? null;
}
