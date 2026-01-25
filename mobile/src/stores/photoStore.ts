import { create } from 'zustand';

type PhotoState = {
  isLoading: boolean;
  setLoading: (isLoading: boolean) => void;
};

export const usePhotoStore = create<PhotoState>((set) => ({
  isLoading: false,
  setLoading: (isLoading) => set({ isLoading }),
}));
