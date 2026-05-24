import { create } from 'zustand';
import type { AuthUser } from './types.js';

const REFRESH_KEY = 'streetlifting.refresh.v1';
const E2E_SESSION_KEY = 'streetlifting.e2e.session.v1';

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

interface E2EAuthSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

function isAuthUser(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<AuthUser>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.email === 'string' &&
    typeof candidate.displayName === 'string' &&
    Array.isArray(candidate.roles)
  );
}

function isE2EAuthSession(value: unknown): value is E2EAuthSession {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<E2EAuthSession>;
  return (
    isAuthUser(candidate.user) &&
    typeof candidate.accessToken === 'string' &&
    candidate.accessToken.length > 0 &&
    typeof candidate.refreshToken === 'string' &&
    candidate.refreshToken.length > 0
  );
}

function readE2EAuthSession(): E2EAuthSession | null {
  if (typeof window === 'undefined' || import.meta.env.MODE === 'production') return null;
  try {
    const raw = window.sessionStorage.getItem(E2E_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isE2EAuthSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
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

function clearE2EAuthSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(E2E_SESSION_KEY);
  } catch {
    // Best-effort cleanup; blocked storage should not affect auth flow.
  }
}

const e2eAuthSession = readE2EAuthSession();

export const useAuthStore = create<AuthState>((set) => ({
  user: e2eAuthSession?.user ?? null,
  accessToken: e2eAuthSession?.accessToken ?? null,
  refreshToken: e2eAuthSession?.refreshToken ?? readPersistedRefresh(),

  setSession: (user, accessToken, refreshToken) => {
    clearE2EAuthSession();
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
    clearE2EAuthSession();
    writePersistedRefresh(refreshToken);
    set({ refreshToken });
  },

  clear: () => {
    clearE2EAuthSession();
    writePersistedRefresh(null);
    set({ user: null, accessToken: null, refreshToken: null });
  },
}));
