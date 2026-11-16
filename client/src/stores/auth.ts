import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { User } from '../types/api';

interface AuthState {
  token: string | null;
  user: User | null;
  /** Message shown on the login page after a forced sign-out (expired/revoked session). */
  signOutReason: string | null;
  setSession: (token: string, user: User) => void;
  setUser: (user: User) => void;
  setToken: (token: string) => void;
  clearSession: (reason?: string) => void;
  consumeSignOutReason: () => string | null;
}

/** JWT session persisted in localStorage. The axios interceptor reads the token from here. */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      signOutReason: null,
      setSession: (token, user) => set({ token, user, signOutReason: null }),
      setUser: (user) => set({ user }),
      setToken: (token) => set({ token }),
      clearSession: (reason) => set({ token: null, user: null, signOutReason: reason ?? null }),
      consumeSignOutReason: () => {
        const reason = get().signOutReason;
        if (reason) set({ signOutReason: null });
        return reason;
      },
    }),
    {
      name: 'chatbot-studio-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ token: s.token, user: s.user }),
    },
  ),
);

export const getToken = () => useAuthStore.getState().token;
