import type { PublicCompetitionRegistrationCreate } from '@streetlifting/domain';
import { ApiClientError } from '../../lib/api-client.js';

const BASE = '/api';

export interface PublicRegistrationCompetition {
  id: string;
  federationId: string;
  code: string;
  nameRu: string;
  nameEn: string;
  startDate: string;
  endDate: string;
  registrationDeadline: string | null;
  city: string | null;
  venue: string | null;
  timezone: string;
  status: string;
  entryFeeKopecks: string | number;
  isOnlineRegistrationOpen: boolean;
  federation: {
    id: string;
    code: string;
    nameRu: string;
    nameEn: string;
  };
  divisions: PublicRegistrationDivision[];
}

export interface PublicRegistrationDivision {
  id: string;
  competitionId: string;
  code: string;
  nameRu: string;
  nameEn: string;
  gender: 'M' | 'F';
  veteranTier: string;
  ageMin: number | null;
  ageMax: number | null;
  veteranCoefficient: number;
  weightClasses: PublicRegistrationWeightClass[];
}

export interface PublicRegistrationWeightClass {
  id: string;
  divisionId: string;
  disciplineId: string | null;
  code: string;
  nameRu: string;
  nameEn: string;
  weightMin: number | null;
  weightMax: number | null;
  order: number;
}

export interface PublicRegistrationDiscipline {
  id: string;
  code: string;
  nameRu: string;
  nameEn: string;
  attemptCount: number;
  fixedWeightKg: number | null;
  format: string;
}

export interface PublicRegistrationDetails {
  competition: PublicRegistrationCompetition;
  disciplines: PublicRegistrationDiscipline[];
  registration: {
    isAvailable: boolean;
    reason: string | null;
  };
}

export interface PublicFederationRegistrationList {
  federation: {
    id: string;
    code: string;
    nameRu: string;
    nameEn: string;
  };
  competitions: Array<{
    id: string;
    code: string;
    nameRu: string;
    nameEn: string;
    startDate: string;
    endDate: string;
    registrationDeadline: string | null;
    city: string | null;
    venue: string | null;
    entryFeeKopecks: string | number;
    _count: { nominations: number };
  }>;
}

export interface PublicRegistrationResult {
  registration: {
    athleteId: string;
    nominationId: string;
    status: string;
    paymentStatus: string;
    entryFeeKopecks: string | number;
  };
}

async function publicRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const text = await res.text();
  const json: unknown = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const err = json as { error?: { code?: string; message?: string; requestId?: string } } | null;
    throw new ApiClientError(
      res.status,
      err?.error?.code ?? 'unknown',
      err?.error?.message ?? res.statusText,
      err?.error?.requestId,
    );
  }

  return json as T;
}

export const publicRegistrationApi = {
  federation: (code: string): Promise<PublicFederationRegistrationList> =>
    publicRequest(`/public/federations/${encodeURIComponent(code)}/registrations`),
  details: (competitionId: string): Promise<PublicRegistrationDetails> =>
    publicRequest(`/public/competitions/${competitionId}/registration`),
  submit: (
    competitionId: string,
    data: PublicCompetitionRegistrationCreate,
  ): Promise<PublicRegistrationResult> =>
    publicRequest(`/public/competitions/${competitionId}/registrations`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
