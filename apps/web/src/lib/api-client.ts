import type {
  AthleteCreate,
  AthleteUpdate,
  CityCreate,
  CityUpdate,
  CompetitionCreate,
  CompetitionDefaultSetup,
  CompetitionUpdate,
  CountryCreate,
  CountryUpdate,
  FederationChapterCreate,
  FederationChapterUpdate,
  FederationCreate,
  FederationUpdate,
  FlightAutoPlan,
  JudgeAssignmentCreate,
  JudgeCreate,
  JudgeUpdate,
  LookupValueCreate,
  LookupValueUpdate,
  NominationDraw,
  NominationCreate,
  NominationUpdate,
  PlateSetCreate,
  PlateSetUpdate,
  RegionCreate,
  RegionUpdate,
  AttemptUpsert,
  JudgeDecisionSubmission,
} from '@streetlifting/domain';
import { useAuthStore } from './auth/store.js';
import type { ApiError, LoginResponse, MeResponse, RefreshResponse } from './auth/types.js';
import { moduleLogger } from './logger.js';
import type {
  Federation,
  FederationAuditEntryDto,
  FederationAttachmentDto,
  FederationChapterDto,
  FederationDashboardResponse,
  FederationPlateSetDto,
  FederationReceiptDto,
  SupportTicketDto,
  SupportTicketMessageDto,
  SupportTicketStatus,
  FederationTestEmailResponse,
  FederationWriteoffDto,
} from '../features/federations/api.js';
import type {
  AthleteDto,
  AthleteListResponse,
  AthleteAppearancesResponse,
  AthleteRecordsResponse,
  AthleteDocumentsResponse,
} from '../features/athletes/api.js';
import type { DisciplineDto } from '../features/disciplines/api.js';
import type { JudgeDto, JudgeListResponse } from '../features/judges/api.js';
import type { CompetitionDto, CompetitionListResponse } from '../features/competitions/api.js';
import type {
  CompetitionLiveOpsResponse,
  CompetitionOpsResponse,
  MutationAttemptDto,
  MutationNominationDto,
  PublicScoreboardResponse,
  ScoreboardResponse,
  NominationDto,
} from '../features/competitions/operations-api.js';
import type {
  CityDto,
  CityListResponse,
  CountryDto,
  LookupValueDto,
  RegionDto,
} from './references-api.js';
import type {
  CabinetOverview,
  PassportAttachment,
  PassportExternalLink,
  PassportFederationReviewRequest,
  PassportReviewRequest,
} from '../features/profile/api.js';

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

export interface IsfServiceClientDto {
  id: string;
  code: string;
  name: string;
  scopes: string[];
  isActive: boolean;
  rateLimitRpm: number;
  createdAt: string;
  revokedAt: string | null;
}

export interface IsfProtocolKeyDto {
  id: string;
  federationId: string;
  keyId: string;
  publicKeyFingerprint: string;
  sanctioningCertId: string | null;
  isActive: boolean;
  validFrom: string | null;
  validUntil: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Skip auth header attachment + skip refresh-on-401 retry (used by /auth/* endpoints). */
  unauthenticated?: boolean;
  /** Internal: set when we're already inside a refresh-on-401 retry, prevents loops. */
  _retried?: boolean;
}

let inflightRefresh: Promise<string | null> | null = null;
let clearInflightRefreshTimer: ReturnType<typeof setTimeout> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (inflightRefresh) return inflightRefresh;
  const refresh = useAuthStore.getState().refreshToken;
  if (!refresh) return null;

  if (clearInflightRefreshTimer) {
    clearTimeout(clearInflightRefreshTimer);
    clearInflightRefreshTimer = null;
  }

  const refreshPromise = (async (): Promise<string | null> => {
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
      clearInflightRefreshTimer = setTimeout(() => {
        if (inflightRefresh === refreshPromise) inflightRefresh = null;
        clearInflightRefreshTimer = null;
      }, 10_000);
    }
  })();
  inflightRefresh = refreshPromise;

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

async function requestText(path: string, options: RequestOptions = {}): Promise<string> {
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
    if (fresh) return requestText(path, { ...options, _retried: true });
  }

  const text = await res.text();
  if (!res.ok) {
    let err: ApiError | null = null;
    try {
      err = text ? (JSON.parse(text) as ApiError) : null;
    } catch {
      err = null;
    }
    throw new ApiClientError(
      res.status,
      err?.error?.code ?? 'unknown',
      err?.error?.message ?? res.statusText,
      err?.error?.requestId,
    );
  }
  return text;
}

async function requestBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
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
    if (fresh) return requestBlob(path, { ...options, _retried: true });
  }

  if (!res.ok) {
    let err: ApiError | null = null;
    const text = await res.text();
    try {
      err = text ? (JSON.parse(text) as ApiError) : null;
    } catch {
      err = null;
    }
    throw new ApiClientError(
      res.status,
      err?.error?.code ?? 'unknown',
      err?.error?.message ?? res.statusText,
      err?.error?.requestId,
    );
  }
  return res.blob();
}

export const api = {
  login: (email: string, password: string): Promise<LoginResponse> =>
    request<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
      unauthenticated: true,
    }),

  register: (
    email: string,
    displayName: string,
    password: string,
  ): Promise<{ user: { id: string; email: string; displayName: string; createdAt: string } }> =>
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

  isf: {
    session: (token: string): Promise<LoginResponse> =>
      request<LoginResponse>('/auth/isf/session', {
        method: 'POST',
        body: { token },
        unauthenticated: true,
      }),
  },

  integrations: {
    isf: {
      serviceClients: (): Promise<{ clients: IsfServiceClientDto[] }> =>
        request('/integrations/isf/service-clients'),
      createServiceClient: (data: {
        code: string;
        name: string;
        scopes: Array<'isf:read' | 'isf:webhook' | 'openstreetlifting:read' | 'isf:protocol:write'>;
        rateLimitRpm: number;
      }): Promise<{ client: IsfServiceClientDto; token: string }> =>
        request('/integrations/isf/service-clients', { method: 'POST', body: data }),
      revokeServiceClient: (id: string): Promise<{ client: IsfServiceClientDto }> =>
        request(`/integrations/isf/service-clients/${id}/revoke`, { method: 'POST' }),
      protocolKeys: (federationId?: string): Promise<{ keys: IsfProtocolKeyDto[] }> =>
        request(
          `/integrations/isf/protocol-keys${
            federationId ? `?federationId=${encodeURIComponent(federationId)}` : ''
          }`,
        ),
      createProtocolKey: (data: {
        federationId: string;
        keyId: string;
        publicKeyPem: string;
        sanctioningCertId?: string;
      }): Promise<{ key: IsfProtocolKeyDto }> =>
        request('/integrations/isf/protocol-keys', { method: 'POST', body: data }),
      revokeProtocolKey: (id: string): Promise<{ key: IsfProtocolKeyDto }> =>
        request(`/integrations/isf/protocol-keys/${id}/revoke`, { method: 'POST' }),
    },
  },

  changePassword: (
    currentPassword: string,
    newPassword: string,
  ): Promise<{ status: 'ok'; revokedRefreshTokens: number }> =>
    request('/auth/password', {
      method: 'PATCH',
      body: { currentPassword, newPassword },
    }),

  cabinet: {
    overview: (): Promise<CabinetOverview> => request('/cabinet/overview'),
  },

  passport: {
    externalLinks: (): Promise<{ links: PassportExternalLink[] }> =>
      request('/passport/external-links'),
    requests: (): Promise<{ requests: PassportReviewRequest[] }> => request('/passport/requests'),
    attachments: (): Promise<{ attachments: PassportAttachment[] }> =>
      request('/passport/attachments'),
    uploadAttachment: (data: {
      filename: string;
      mimeType: string;
      contentBase64: string;
      kind?: 'certificate_pdf' | 'misc';
    }): Promise<{ attachment: PassportAttachment }> =>
      request('/passport/attachments', { method: 'POST', body: data }),
    downloadAttachment: (id: string): Promise<Blob> =>
      requestBlob(`/passport/attachments/${id}/download`),
    updateProfile: (data: {
      displayName?: string;
      phone?: string | null;
      telegramHandle?: string | null;
    }): Promise<{
      user: {
        id: string;
        displayName: string;
        phone: string | null;
        telegramHandle: string | null;
      };
    }> => request('/passport/profile', { method: 'PATCH', body: data }),
    updatePrivacy: (
      privacyMode: 'public_results' | 'hidden',
    ): Promise<{ athlete: { id: string; privacyMode: string } }> =>
      request('/passport/privacy', { method: 'PATCH', body: { privacyMode } }),
    revokeConsent: (id: string): Promise<unknown> =>
      request(`/passport/consents/${id}/revoke`, { method: 'POST' }),
    submitRequest: (data: {
      federationId: string;
      kind: 'official_profile' | 'official_credential' | 'sport_rank';
      payload: Record<string, unknown>;
      supportingAttachmentId?: string | null;
    }): Promise<{ request: PassportReviewRequest }> =>
      request('/passport/requests', { method: 'POST', body: data }),
    cancelRequest: (id: string): Promise<{ request: PassportReviewRequest }> =>
      request(`/passport/requests/${id}/cancel`, { method: 'POST' }),
    federationReviewRequests: (
      federationId: string,
      status: 'pending' | 'approved' | 'rejected' | 'cancelled' = 'pending',
    ): Promise<{ requests: PassportFederationReviewRequest[] }> =>
      request(`/passport/federations/${federationId}/review-requests?status=${status}`),
    reviewRequest: (
      id: string,
      data: {
        status: 'approved' | 'rejected';
        reviewNote?: string;
        resolution?: Record<string, unknown>;
      },
    ): Promise<{ request: PassportReviewRequest }> =>
      request(`/passport/requests/${id}/review`, { method: 'POST', body: data }),
  },

  federations: {
    list: (): Promise<{ federations: Federation[] }> => request('/federations'),
    get: (id: string): Promise<{ federation: Federation }> => request(`/federations/${id}`),
    dashboard: (id: string): Promise<FederationDashboardResponse> =>
      request(`/federations/${id}/dashboard`),
    audit: (id: string): Promise<{ audit: FederationAuditEntryDto[] }> =>
      request(`/federations/${id}/audit`),
    create: (data: FederationCreate): Promise<{ federation: Federation }> =>
      request('/federations', { method: 'POST', body: data }),
    update: (id: string, data: FederationUpdate): Promise<{ federation: Federation }> =>
      request(`/federations/${id}`, { method: 'PATCH', body: data }),
    testEmail: (id: string): Promise<FederationTestEmailResponse> =>
      request(`/federations/${id}/test-email`, { method: 'POST' }),
    createFeedback: (
      id: string,
      data: { message: string },
    ): Promise<{ feedback: { author: string; message: string; status: string } }> =>
      request(`/federations/${id}/feedback`, { method: 'POST', body: data }),
    supportTickets: {
      list: (id: string): Promise<{ tickets: SupportTicketDto[] }> =>
        request(`/federations/${id}/support-tickets`),
      create: (
        id: string,
        data: { subject?: string; message: string },
      ): Promise<{ ticket: SupportTicketDto }> =>
        request(`/federations/${id}/support-tickets`, { method: 'POST', body: data }),
      createMessage: (
        id: string,
        ticketId: string,
        data: { message: string; isInternal?: boolean },
      ): Promise<{ message: SupportTicketMessageDto }> =>
        request(`/federations/${id}/support-tickets/${ticketId}/messages`, {
          method: 'POST',
          body: data,
        }),
      update: (
        id: string,
        ticketId: string,
        data: { status: SupportTicketStatus },
      ): Promise<{ ticket: SupportTicketDto }> =>
        request(`/federations/${id}/support-tickets/${ticketId}`, { method: 'PATCH', body: data }),
    },
    uploadAttachment: (
      id: string,
      data: { filename: string; mimeType: string; contentBase64: string },
    ): Promise<{ attachment: FederationAttachmentDto }> =>
      request(`/federations/${id}/attachments`, { method: 'POST', body: data }),
    deleteAttachment: (id: string, attachmentId: string): Promise<{ status: 'ok' }> =>
      request(`/federations/${id}/attachments/${attachmentId}`, { method: 'DELETE' }),
    downloadAttachment: (id: string, attachmentId: string): Promise<Blob> =>
      requestBlob(`/federations/${id}/attachments/${attachmentId}/download`),
    createPlateSet: (
      id: string,
      data: PlateSetCreate,
    ): Promise<{ plateSet: FederationPlateSetDto }> =>
      request(`/federations/${id}/plate-sets`, { method: 'POST', body: data }),
    updatePlateSet: (
      id: string,
      plateSetId: string,
      data: PlateSetUpdate,
    ): Promise<{ plateSet: FederationPlateSetDto }> =>
      request(`/federations/${id}/plate-sets/${plateSetId}`, { method: 'PATCH', body: data }),
    deletePlateSet: (id: string, plateSetId: string): Promise<{ status: 'ok' }> =>
      request(`/federations/${id}/plate-sets/${plateSetId}`, { method: 'DELETE' }),
    createReceipt: (
      id: string,
      data: {
        number: string;
        date: string;
        nominationsCount: number;
        amountKopecks: number;
        paymentMethod: FederationReceiptDto['paymentMethod'];
        expiresAt: string;
        externalReference?: string | null;
      },
    ): Promise<{ receipt: FederationReceiptDto }> =>
      request(`/federations/${id}/receipts`, { method: 'POST', body: data }),
    createWriteoff: (
      id: string,
      data: {
        number: string;
        date: string;
        nominationsCount: number;
        competitionId?: string | null;
        linkedReceiptId?: string | null;
      },
    ): Promise<{ writeoff: FederationWriteoffDto }> =>
      request(`/federations/${id}/writeoffs`, { method: 'POST', body: data }),
    chapters: {
      list: (fedId: string): Promise<{ chapters: FederationChapterDto[] }> =>
        request(`/federations/${fedId}/chapters`),
      get: (fedId: string, id: string): Promise<{ chapter: FederationChapterDto }> =>
        request(`/federations/${fedId}/chapters/${id}`),
      create: (
        fedId: string,
        data: FederationChapterCreate,
      ): Promise<{ chapter: FederationChapterDto }> =>
        request(`/federations/${fedId}/chapters`, { method: 'POST', body: data }),
      update: (
        fedId: string,
        id: string,
        data: FederationChapterUpdate,
      ): Promise<{ chapter: FederationChapterDto }> =>
        request(`/federations/${fedId}/chapters/${id}`, { method: 'PATCH', body: data }),
    },
  },

  competitions: {
    list: (
      params: { federationId?: string; status?: string; limit?: number; offset?: number } = {},
    ): Promise<CompetitionListResponse> => {
      const q = new URLSearchParams();
      if (params.federationId) q.set('federationId', params.federationId);
      if (params.status) q.set('status', params.status);
      if (params.limit !== undefined) q.set('limit', String(params.limit));
      if (params.offset !== undefined) q.set('offset', String(params.offset));
      const qs = q.toString();
      return request(`/competitions${qs ? `?${qs}` : ''}`);
    },
    get: (id: string): Promise<{ competition: CompetitionDto }> => request(`/competitions/${id}`),
    create: (data: CompetitionCreate): Promise<{ competition: CompetitionDto }> =>
      request('/competitions', { method: 'POST', body: data }),
    update: (id: string, data: CompetitionUpdate): Promise<{ competition: CompetitionDto }> =>
      request(`/competitions/${id}`, { method: 'PATCH', body: data }),
    ops: (id: string): Promise<CompetitionOpsResponse> => request(`/competitions/${id}/ops`),
    liveOps: (id: string): Promise<CompetitionLiveOpsResponse> =>
      request(`/competitions/${id}/live-ops`),
    applyDefaultSetup: (
      id: string,
      data: Partial<CompetitionDefaultSetup> = {},
    ): Promise<{
      setup: { platformId: string; flightId: string; divisions: number; weightClasses: number };
    }> => request(`/competitions/${id}/setup/default`, { method: 'POST', body: data }),
    drawNominations: (
      id: string,
      data: Partial<NominationDraw> = {},
    ): Promise<{ draw: { assigned: number; firstNumber: number | null } }> =>
      request(`/competitions/${id}/nominations/draw`, { method: 'POST', body: data }),
    autoPlanFlights: (
      id: string,
      data: Partial<FlightAutoPlan> = {},
    ): Promise<{
      plan: {
        platformId: string;
        flights: Array<{
          flightId: string;
          code: string;
          nominations: number;
          groups: number;
          startTime: string;
          estimatedMinutes: number;
        }>;
      };
    }> => request(`/competitions/${id}/flights/auto-plan`, { method: 'POST', body: data }),
    createNomination: (
      id: string,
      data: NominationCreate,
    ): Promise<{ nomination: NominationDto }> =>
      request(`/competitions/${id}/nominations`, { method: 'POST', body: data }),
    updateNomination: (
      id: string,
      data: NominationUpdate,
    ): Promise<{ nomination: MutationNominationDto }> =>
      request(`/nominations/${id}`, { method: 'PATCH', body: data }),
    upsertAttempt: (
      nominationId: string,
      attemptNumber: number,
      data: Omit<AttemptUpsert, 'attemptNumber'>,
    ): Promise<{ attempt: MutationAttemptDto | null; nomination: MutationNominationDto | null }> =>
      request(`/nominations/${nominationId}/attempts/${attemptNumber}`, {
        method: 'PUT',
        body: data,
      }),
    upsertComponentAttempt: (
      nominationId: string,
      componentId: string,
      attemptNumber: number,
      data: Omit<AttemptUpsert, 'attemptNumber'>,
    ): Promise<{ attempt: MutationAttemptDto | null; nomination: MutationNominationDto | null }> =>
      request(`/nominations/${nominationId}/attempts/${componentId}/${attemptNumber}`, {
        method: 'PUT',
        body: data,
      }),
    submitJudgeDecision: (
      nominationId: string,
      attemptNumber: number,
      data: JudgeDecisionSubmission,
    ): Promise<{ attempt: MutationAttemptDto | null; nomination: MutationNominationDto | null }> =>
      request(`/nominations/${nominationId}/attempts/${attemptNumber}/judge-decision`, {
        method: 'PUT',
        body: data,
      }),
    createJudgeAssignment: (
      id: string,
      data: JudgeAssignmentCreate,
    ): Promise<{ judgeAssignment: CompetitionOpsResponse['judgeAssignments'][number] }> =>
      request(`/competitions/${id}/judge-assignments`, { method: 'POST', body: data }),
    deleteJudgeAssignment: (assignmentId: string): Promise<{ deleted: true }> =>
      request(`/judge-assignments/${assignmentId}`, { method: 'DELETE' }),
    teamMembers: (
      id: string,
    ): Promise<{
      teamMembers: Array<{
        id: string;
        userId: string;
        role: string;
        status: string;
        memberNameSnapshot: string;
        platform: { id: string; name: string } | null;
        judgeAssignmentId: string | null;
        invitedAt: string | null;
        confirmedAt: string | null;
        completedAt: string | null;
        correctionOfId: string | null;
      }>;
    }> => request(`/competitions/${id}/team-members`),
    inviteTeamMember: (
      id: string,
      data: {
        userId: string;
        role:
          | 'organizer'
          | 'head_judge'
          | 'judge'
          | 'secretary'
          | 'assistant'
          | 'scoreboard_operator'
          | 'speaker'
          | 'technical_official'
          | 'medical_official';
        platformId?: string | null;
        judgeAssignmentId?: string | null;
      },
    ): Promise<{ teamMember: unknown }> =>
      request(`/competitions/${id}/team-members`, { method: 'POST', body: data }),
    respondTeamMember: (
      id: string,
      status: 'confirmed' | 'declined',
    ): Promise<{ teamMember: unknown }> =>
      request(`/competition-team-members/${id}/respond`, { method: 'POST', body: { status } }),
    completeTeamMember: (id: string): Promise<{ teamMember: unknown }> =>
      request(`/competition-team-members/${id}/complete`, { method: 'POST' }),
    scoreboard: (id: string): Promise<ScoreboardResponse> =>
      request(`/competitions/${id}/scoreboard`),
    publicScoreboard: (id: string): Promise<PublicScoreboardResponse> =>
      request(`/public/competitions/${id}/scoreboard`, { unauthenticated: true }),
    protocolCsv: (id: string): Promise<string> => requestText(`/competitions/${id}/protocol.csv`),
    protocolXlsx: (id: string): Promise<Blob> => requestBlob(`/competitions/${id}/protocol.xlsx`),
    accountingCsv: (id: string): Promise<string> =>
      requestText(`/competitions/${id}/accounting.csv`),
    accountingXlsx: (id: string): Promise<Blob> =>
      requestBlob(`/competitions/${id}/accounting.xlsx`),
  },

  athletes: {
    list: (
      params: {
        search?: string;
        gender?: 'M' | 'F';
        countryCode?: string;
        cardNumberContains?: string;
        bornFrom?: string;
        bornTo?: string;
        limit?: number;
        offset?: number;
      } = {},
    ): Promise<AthleteListResponse> => {
      const q = new URLSearchParams();
      if (params.search) q.set('search', params.search);
      if (params.gender) q.set('gender', params.gender);
      if (params.countryCode) q.set('countryCode', params.countryCode);
      if (params.cardNumberContains) q.set('cardNumberContains', params.cardNumberContains);
      if (params.bornFrom) q.set('bornFrom', params.bornFrom);
      if (params.bornTo) q.set('bornTo', params.bornTo);
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
    appearances: (id: string): Promise<AthleteAppearancesResponse> =>
      request(`/athletes/${id}/appearances`),
    records: (id: string): Promise<AthleteRecordsResponse> => request(`/athletes/${id}/records`),
    documents: (id: string): Promise<AthleteDocumentsResponse> =>
      request(`/athletes/${id}/documents`),
    uploadAttachment: (
      id: string,
      data: {
        filename: string;
        mimeType: string;
        contentBase64: string;
        kind?: 'certificate_pdf' | 'misc';
      },
    ): Promise<{
      attachment: {
        id: string;
        kind: string;
        filename: string;
        mimeType: string;
        sizeBytes: string;
        uploadedAt: string;
      };
    }> => request(`/athletes/${id}/attachments`, { method: 'POST', body: data }),
    deleteAttachment: (id: string, attachmentId: string): Promise<{ status: string }> =>
      request(`/athletes/${id}/attachments/${attachmentId}`, { method: 'DELETE' }),
    downloadAttachment: (id: string, attachmentId: string): Promise<Blob> =>
      requestBlob(`/athletes/${id}/attachments/${attachmentId}/download`),
    uploadPhoto: (
      id: string,
      data: { filename: string; mimeType: string; contentBase64: string },
    ): Promise<{ athlete: AthleteDto }> =>
      request(`/athletes/${id}/photo`, { method: 'POST', body: data }),
    deletePhoto: (id: string): Promise<{ status: string }> =>
      request(`/athletes/${id}/photo`, { method: 'DELETE' }),
  },

  disciplines: {
    list: (): Promise<{ disciplines: DisciplineDto[] }> => request('/disciplines'),
    get: (id: string): Promise<{ discipline: DisciplineDto }> => request(`/disciplines/${id}`),
  },

  judges: {
    list: (
      params: { search?: string; limit?: number; offset?: number } = {},
    ): Promise<JudgeListResponse> => {
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

  references: {
    countries: {
      list: (): Promise<{ countries: CountryDto[] }> => request('/references/countries'),
      get: (id: string): Promise<{ country: CountryDto }> => request(`/references/countries/${id}`),
      create: (data: CountryCreate): Promise<{ country: CountryDto }> =>
        request('/references/countries', { method: 'POST', body: data }),
      update: (id: string, data: CountryUpdate): Promise<{ country: CountryDto }> =>
        request(`/references/countries/${id}`, { method: 'PATCH', body: data }),
    },
    regions: {
      list: (params: { countryId?: string } = {}): Promise<{ regions: RegionDto[] }> => {
        const q = new URLSearchParams();
        if (params.countryId) q.set('countryId', params.countryId);
        const qs = q.toString();
        return request(`/references/regions${qs ? `?${qs}` : ''}`);
      },
      get: (id: string): Promise<{ region: RegionDto }> => request(`/references/regions/${id}`),
      create: (data: RegionCreate): Promise<{ region: RegionDto }> =>
        request('/references/regions', { method: 'POST', body: data }),
      update: (id: string, data: RegionUpdate): Promise<{ region: RegionDto }> =>
        request(`/references/regions/${id}`, { method: 'PATCH', body: data }),
    },
    cities: {
      list: (
        params: {
          regionId?: string;
          countryId?: string;
          q?: string;
          limit?: number;
          offset?: number;
        } = {},
      ): Promise<CityListResponse> => {
        const qp = new URLSearchParams();
        if (params.regionId) qp.set('regionId', params.regionId);
        if (params.countryId) qp.set('countryId', params.countryId);
        if (params.q) qp.set('q', params.q);
        if (params.limit !== undefined) qp.set('limit', String(params.limit));
        if (params.offset !== undefined) qp.set('offset', String(params.offset));
        const qs = qp.toString();
        return request(`/references/cities${qs ? `?${qs}` : ''}`);
      },
      get: (id: string): Promise<{ city: CityDto }> => request(`/references/cities/${id}`),
      create: (data: CityCreate): Promise<{ city: CityDto }> =>
        request('/references/cities', { method: 'POST', body: data }),
      update: (id: string, data: CityUpdate): Promise<{ city: CityDto }> =>
        request(`/references/cities/${id}`, { method: 'PATCH', body: data }),
    },
    lookups: {
      list: (params: { kind?: string } = {}): Promise<{ lookups: LookupValueDto[] }> => {
        const qp = new URLSearchParams();
        if (params.kind) qp.set('kind', params.kind);
        const qs = qp.toString();
        return request(`/references/lookups${qs ? `?${qs}` : ''}`);
      },
      get: (id: string): Promise<{ lookup: LookupValueDto }> =>
        request(`/references/lookups/${id}`),
      create: (data: LookupValueCreate): Promise<{ lookup: LookupValueDto }> =>
        request('/references/lookups', { method: 'POST', body: data }),
      update: (id: string, data: LookupValueUpdate): Promise<{ lookup: LookupValueDto }> =>
        request(`/references/lookups/${id}`, { method: 'PATCH', body: data }),
    },
  },
};
