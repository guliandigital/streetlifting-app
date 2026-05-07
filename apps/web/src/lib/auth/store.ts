import { create } from 'zustand';
import type { AuthUser } from './types.js';

const REFRESH_KEY = 'streetlifting.refresh.v1';

/**
 * Auth store.
 *
 * Token storage policy (ADR-0004):
 *   - accessToken: in-memory only. Lost on reload — the refresh path will
 *     mint a new one transparently.
 *   - refreshToken: in-memory + sessionStorage (so a tab reload does NOT
 *     log the user out). NEVER localStorage (XSS-exfil risk). When we
 *     ship the federated cookie path, this will move to httpOnly cookie.
 */
interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  setSession: (
    user: Pick<AuthUser, 'id' | 'email' | 'displayName'>,
    accessToken: string,
    refreshToken: string,
  ) => void;
  setUser: (user: AuthUser | null) => void;
  setAccessToken: (token: string | null) => void;
  setRefreshToken: (token: string | null) => void;
  clear: () => void;
}

function readPersistedRefresh(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

function writePersistedRefresh(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (token === null) window.sessionStorage.removeItem(REFRESH_KEY);
    else window.sessionStorage.setItem(REFRESH_KEY, token);
  } catch {
    // sessionStorage may be blocked (private mode, quota); we degrade to
    // in-memory only — the user will need to log in again on tab reload.
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: readPersistedRefresh(),

  setSession: (user, accessToken, refreshToken) => {
    writePersistedRefresh(refreshToken);
    set({
      user: { ...user, roles: [] },
      accessToken,
      refreshToken,
    });
  },

  setUser: (user) => set({ user }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setRefreshToken: (refreshToken) => {
    writePersistedRefresh(refreshToken);
    set({ refreshToken });
  },

  clear: () => {
    writePersistedRefresh(null);
    set({ user: null, accessToken: null, refreshToken: null });
  },
}));
