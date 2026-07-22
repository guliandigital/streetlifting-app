import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api-client.js';

export interface CabinetOverview {
  identity: {
    displayName: string;
    email: string;
    isEmailVerified: boolean;
    isfSubjectId: string | null;
    isfPersonId: string | null;
    phone: string | null;
    telegramHandle: string | null;
    consents: Array<{ id: string; scope: string; textVersion: string; grantedAt: string }>;
  };
  athlete: {
    id: string;
    displayName: string;
    federationCardNumber: string | null;
    clubName: string | null;
    privacyMode: string;
    appearancesTotal: number;
    recordsTotal: number;
    appearances: Array<{
      id: string;
      status: string;
      bestSuccessfulAttemptKg: number | null;
      finalScore: number | null;
      placeOverall: number | null;
      placeInDivision: number | null;
      placeInClass: number | null;
      competition: { id: string; nameRu: string; startDate: string; city: string | null };
      discipline: { code: string; nameRu: string };
    }>;
    records: Array<{
      id: string;
      scope: string;
      result: number;
      achievedOn: string;
      ratifiedAt: string | null;
      discipline: { code: string; nameRu: string };
      competition: { id: string; nameRu: string };
    }>;
    ranks: Array<{
      id: string;
      name: string;
      basis: string;
      issuedAt: string;
      expiresAt: string | null;
      status: string;
      statusReason: string | null;
      documentAttachmentId: string | null;
    }>;
  } | null;
  official: {
    id: string;
    displayName: string;
    categoryRu: string | null;
    categoryEn: string | null;
    cardNumber: string | null;
    cityRegion: string | null;
    functions: string[];
    credentials: Array<{
      id: string;
      kind: string;
      name: string;
      credentialNumber: string | null;
      issuedAt: string;
      expiresAt: string | null;
      status: string;
      statusReason: string | null;
      documentAttachmentId: string | null;
    }>;
    assignmentsTotal: number;
    assignments: Array<{
      id: string;
      role: string;
      assignedAt: string;
      competition: { id: string; nameRu: string; startDate: string; city: string | null };
      platform: { id: string; name: string } | null;
    }>;
    upcomingAssignments: Array<{
      id: string;
      role: string;
      assignedAt: string;
      competition: { id: string; nameRu: string; startDate: string; city: string | null };
      platform: { id: string; name: string } | null;
    }>;
  } | null;
  organizer: {
    tournamentsTotal: number;
    tournaments: Array<{
      id: string;
      completedAt: string | null;
      competition: {
        id: string;
        nameRu: string;
        startDate: string;
        city: string | null;
        teamMembers: Array<{
          id: string;
          role: string;
          status: string;
          memberNameSnapshot: string;
          completedAt: string | null;
          platform: { id: string; name: string } | null;
        }>;
      };
    }>;
  } | null;
}

export interface PassportExternalLink {
  id: string;
  system: string;
  externalId: string;
  status: string;
  verifiedAt: string | null;
}

export interface PassportReviewRequest {
  id: string;
  federationId: string;
  kind: string;
  status: string;
  payload: Record<string, unknown>;
  supportingAttachmentId: string | null;
  submittedAt: string;
  resolvedAt: string | null;
  reviewNote: string | null;
}

export interface PassportAttachment {
  id: string;
  kind: string;
  filename: string;
  mimeType: string;
  sizeBytes: string;
  uploadedAt: string;
}

export interface PassportFederationReviewRequest {
  id: string;
  kind: 'official_profile' | 'official_credential' | 'sport_rank';
  status: string;
  payload: unknown;
  submittedAt: string;
  resolvedAt: string | null;
  reviewNote: string | null;
  applicant: { id: string; displayName: string };
  supportingAttachment: PassportAttachment | null;
}

export function useCabinetOverview() {
  return useQuery<CabinetOverview>({
    queryKey: ['cabinet', 'overview'],
    queryFn: () => api.cabinet.overview(),
  });
}

export function usePassportExternalLinks() {
  return useQuery<{ links: PassportExternalLink[] }>({
    queryKey: ['passport', 'external-links'],
    queryFn: () => api.passport.externalLinks(),
  });
}

export function usePassportReviewRequests() {
  return useQuery<{ requests: PassportReviewRequest[] }>({
    queryKey: ['passport', 'requests'],
    queryFn: () => api.passport.requests(),
  });
}

export function usePassportAttachments() {
  return useQuery<{ attachments: PassportAttachment[] }>({
    queryKey: ['passport', 'attachments'],
    queryFn: () => api.passport.attachments(),
  });
}
