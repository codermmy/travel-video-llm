import { create } from 'zustand';

import type { EventPhotoItem } from '@/types/event';

type PhotoViewerState = {
  photos: EventPhotoItem[];
  initialIndex: number;
  setSession: (photos: EventPhotoItem[], initialIndex?: number) => void;
  clearSession: () => void;
};

export const usePhotoViewerStore = create<PhotoViewerState>((set) => ({
  photos: [],
  initialIndex: 0,
  setSession: (photos, initialIndex = 0) => {
    const safeInitial = Math.max(0, Math.min(initialIndex, Math.max(photos.length - 1, 0)));
    set({ photos, initialIndex: safeInitial });
  },
  clearSession: () => set({ photos: [], initialIndex: 0 }),
}));
