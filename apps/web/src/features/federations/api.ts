import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  FederationChapterCreate,
  FederationChapterUpdate,
  FederationCreate,
  FederationUpdate,
} from '@streetlifting/domain';
import { api } from '../../lib/api-client.js';

interface FederationDto {
  id: string;
  code: string;
  nameRu: string;
  nameEn: string;
  countryCode: string;
  regionCode: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  telegramHandle: string | null;
  vkUrl: string | null;
  websiteUrl: string | null;
  chiefAccountantName: string | null;
  cashierName: string | null;
  /** Server returns BigInt as string in JSON (Prisma serialization). */
  billingTariffKopecksPerNomination: string | number;
  securityKey: string;
  isPublicResultsClosed: boolean;
  notificationsDisabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export type Federation = FederationDto;

export function useFederations() {
  return useQuery<{ federations: Federation[] }>({
    queryKey: ['federations'],
    queryFn: () => api.federations.list(),
  });
}

export function useFederation(id: string) {
  return useQuery<{ federation: Federation }>({
    queryKey: ['federations', id],
    queryFn: () => api.federations.get(id),
  });
}

export function useCreateFederation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: FederationCreate) => api.federations.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['federations'] }),
  });
}

export function useUpdateFederation(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: FederationUpdate) => api.federations.update(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['federations'] });
      void qc.invalidateQueries({ queryKey: ['federations', id] });
    },
  });
}

// ─── Chapters ────────────────────────────────────────────────────────

export interface FederationChapterDto {
  id: string;
  federationId: string;
  code: string;
  nameRu: string;
  nameEn: string;
  countryCode: string | null;
  regionCode: string | null;
  city: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function useFederationChapters(federationId: string) {
  return useQuery<{ chapters: FederationChapterDto[] }>({
    queryKey: ['federations', federationId, 'chapters'],
    queryFn: () => api.federations.chapters.list(federationId),
    enabled: Boolean(federationId),
  });
}

export function useCreateFederationChapter(federationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: FederationChapterCreate) => api.federations.chapters.create(federationId, data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['federations', federationId, 'chapters'] }),
  });
}

export function useUpdateFederationChapter(federationId: string, chapterId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: FederationChapterUpdate) =>
      api.federations.chapters.update(federationId, chapterId, data),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['federations', federationId, 'chapters'] }),
  });
}
