import type {
  AthleteCreate,
  AthleteUpdate,
  FederationCreate,
  FederationUpdate,
  JudgeCreate,
  JudgeUpdate,
} from '@streetlifting/domain';
import { useAuthStore } from './auth/store.js';
import type { ApiError, LoginResponse, MeResponse, RefreshResponse } from './auth/types.js';
import { moduleLogger } from './logger.js';
import type { Federation } from '../features/federations/api.js';
import type { AthleteDto, AthleteListResponse } from '../features/athletes/api.js';
import type { DisciplineDto } from '../features/disciplines/api.js';
import type { JudgeDto, JudgeListResponse } from '../features/judges/api.js';

const log = moduleLogger('api-client');

/**
 * Same-origin path served by Vite's dev proxy → http://localhost:3000.
 * In prod, the same path is served by nginx in front of the API.
 */
const BASE = '/api';

class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export { ApiClientError };

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Skip auth header attachment + skip refresh-on-401 retry (used by /auth/* endpoints). */
  unauthenticated?: boolean;
  /** Internal: set when we're already inside a refresh-on-401 retry, prevents loops. */
  _retried?: boolean;
}

let inflightRefresh: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (inflightRefresh) return inflightRefresh;
  const refresh = useAuthStore.getState().refreshToken;
  if (!refresh) return null;

  inflightRefresh = (async (): Promise<string | null> => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (!res.ok) {
        log.warn('refresh failed; clearing session', { status: res.status });
        useAuthStore.getState().clear();
        return null;
      }
      const json = (await res.json()) as RefreshResponse;
      const store = useAuthStore.getState();
      store.setAccessToken(json.accessToken);
      store.setRefreshToken(json.refreshToken);
      return json.accessToken;
    } finally {
      inflightRefresh = null;
    }
  })();

  return inflightRefresh;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, unauthenticated, _retried } = options;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (!unauthenticated) {
    const token = useAuthStore.getState().accessToken;
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });

  if (res.status === 401 && !unauthenticated && !_retried) {
    const fresh = await refreshAccessToken();
    if (fresh) {
      return request<T>(path, { ...options, _retried: true });
    }
  }

  const text = await res.text();
  const json: unknown = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const err = json as ApiError | null;
    throw new ApiClientError(
      res.status,
      err?.error?.code ?? 'unknown',
      err?.error?.message ?? res.statusText,
      err?.error?.requestId,
    );
  }

  return json as T;
}

export const api = {
  login: (email: string, password: string): Promise<LoginResponse> =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
      unauthenticated: true,
    }),

  register: (email: string, displayName: string, password: string): Promise<{ user: { id: string; email: string; displayName: string; createdAt: string } }> =>
    request('/auth/register', {
      method: 'POST',
      body: { email, displayName, password },
      unauthenticated: true,
    }),

  logout: (refreshToken: string): Promise<null> =>
    request('/auth/logout', {
      method: 'POST',
      body: { refreshToken },
      unauthenticated: true,
    }),

  me: (): Promise<MeResponse> => request<MeResponse>('/auth/me'),

  federations: {
    list: (): Promise<{ federations: Federation[] }> =>
      request('/federations'),
    get: (id: string): Promise<{ federation: Federation }> =>
      request(`/federations/${id}`),
    create: (data: FederationCreate): Promise<{ federation: Federation }> =>
      request('/federations', { method: 'POST', body: data }),
    update: (id: string, data: FederationUpdate): Promise<{ federation: Federation }> =>
      request(`/federations/${id}`, { method: 'PATCH', body: data }),
  },

  athletes: {
    list: (params: { search?: string; limit?: number; offset?: number } = {}): Promise<AthleteListResponse> => {
      const q = new URLSearchParams();
      if (params.search) q.set('search', params.search);
      if (params.limit !== undefined) q.set('limit', String(params.limit));
      if (params.offset !== undefined) q.set('offset', String(params.offset));
      const qs = q.toString();
      return request(`/athletes${qs ? `?${qs}` : ''}`);
    },
    get: (id: string): Promise<{ athlete: AthleteDto }> => request(`/athletes/${id}`),
    create: (data: AthleteCreate): Promise<{ athlete: AthleteDto }> =>
      request('/athletes', { method: 'POST', body: data }),
    update: (id: string, data: AthleteUpdate): Promise<{ athlete: AthleteDto }> =>
      request(`/athletes/${id}`, { method: 'PATCH', body: data }),
  },

  disciplines: {
    list: (): Promise<{ disciplines: DisciplineDto[] }> => request('/disciplines'),
    get: (id: string): Promise<{ discipline: DisciplineDto }> => request(`/disciplines/${id}`),
  },

  judges: {
    list: (params: { search?: string; limit?: number; offset?: number } = {}): Promise<JudgeListResponse> => {
      const q = new URLSearchParams();
      if (params.search) q.set('search', params.search);
      if (params.limit !== undefined) q.set('limit', String(params.limit));
      if (params.offset !== undefined) q.set('offset', String(params.offset));
      const qs = q.toString();
      return request(`/judges${qs ? `?${qs}` : ''}`);
    },
    get: (id: string): Promise<{ judge: JudgeDto }> => request(`/judges/${id}`),
    create: (data: JudgeCreate): Promise<{ judge: JudgeDto }> =>
      request('/judges', { method: 'POST', body: data }),
    update: (id: string, data: JudgeUpdate): Promise<{ judge: JudgeDto }> =>
      request(`/judges/${id}`, { method: 'PATCH', body: data }),
  },
};
