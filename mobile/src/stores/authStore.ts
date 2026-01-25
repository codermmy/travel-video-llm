import { create } from 'zustand';

type AuthState = {
  token: string | null;
  userId: string | null;
  setAuth: (token: string, userId: string) => void;
  clear: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  userId: null,
  setAuth: (token, userId) => set({ token, userId }),
  clear: () => set({ token: null, userId: null }),
}));
