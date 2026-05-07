import { useEffect } from 'react';
import { api, ApiClientError } from '../api-client.js';
import { moduleLogger } from '../logger.js';
import { useAuthStore } from './store.js';

const log = moduleLogger('auth');

/**
 * On mount, if we have a refresh token but no user yet, hydrate by fetching
 * /auth/me (which will trigger a refresh if the access token is missing/expired).
 * Used in the root layout once.
 */
export function useHydrateAuth(): { hydrating: boolean } {
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const clear = useAuthStore((s) => s.clear);

  useEffect(() => {
    if (!refreshToken || user) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await api.me();
        if (!cancelled) setUser(me.user);
      } catch (err) {
        if (err instanceof ApiClientError && err.status === 401) {
          clear();
        } else {
          log.warn('hydrate failed', { name: err instanceof Error ? err.name : 'unknown' });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshToken, user, setUser, clear]);

  return { hydrating: Boolean(refreshToken) && !user };
}

export function useAuth(): {
  user: ReturnType<typeof useAuthStore.getState>['user'];
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
} {
  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const clear = useAuthStore((s) => s.clear);

  return {
    user,
    isAuthenticated: user !== null,
    login: async (email, password) => {
      const res = await api.login(email, password);
      setSession(res.user, res.accessToken, res.refreshToken);
      // Replace the lean user with the full version (with roles).
      try {
        const me = await api.me();
        useAuthStore.setState({ user: me.user });
      } catch (err) {
        log.warn('me-fetch after login failed', { name: err instanceof Error ? err.name : 'unknown' });
      }
    },
    logout: async () => {
      const token = refreshToken;
      clear();
      if (token) {
        try {
          await api.logout(token);
        } catch (err) {
          log.warn('logout API call failed (session already cleared)', {
            name: err instanceof Error ? err.name : 'unknown',
          });
        }
      }
    },
  };
}
