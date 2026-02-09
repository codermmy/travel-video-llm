import { create } from 'zustand';

import type { SlideshowEventContext, SlideshowPhoto } from '@/types/slideshow';

type SlideshowStore = {
  event: SlideshowEventContext | null;
  photos: SlideshowPhoto[];
  setSession: (event: SlideshowEventContext, photos: SlideshowPhoto[]) => void;
  clearSession: () => void;
};

export const useSlideshowStore = create<SlideshowStore>((set) => ({
  event: null,
  photos: [],
  setSession: (event, photos) => set({ event, photos }),
  clearSession: () => set({ event: null, photos: [] }),
}));
