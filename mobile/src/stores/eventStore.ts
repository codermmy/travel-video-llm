import { create } from 'zustand';

type EventState = {
  isLoading: boolean;
  setLoading: (isLoading: boolean) => void;
};

export const useEventStore = create<EventState>((set) => ({
  isLoading: false,
  setLoading: (isLoading) => set({ isLoading }),
}));
