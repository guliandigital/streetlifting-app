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

export interface FederationReceiptDto {
  id: string;
  federationId: string;
  number: string;
  date: string;
  nominationsCount: number;
  amountKopecks: string | number;
  paymentMethod: 'bank_transfer' | 'card' | 'sbp' | 'cash' | 'other';
  expiresAt: string;
  externalReference: string | null;
  createdAt: string;
}

export interface FederationWriteoffDto {
  id: string;
  federationId: string;
  number: string;
  date: string;
  nominationsCount: number;
  competitionId: string | null;
  linkedReceiptId: string | null;
  createdAt: string;
  competition: { id: string; code: string; nameRu: string } | null;
}

export interface FederationAttachmentDto {
  id: string;
  kind: string;
  filename: string;
  mimeType: string;
  sizeBytes: string | number;
  storagePath: string;
  uploadedAt: string;
}

export interface FederationPlateSetDto {
  id: string;
  federationId: string | null;
  competitionId: string | null;
  name: string;
  incrementKg: number;
  barWeightKg: number;
  collarWeightKg: number;
  plates: unknown;
}

export interface FederationDashboardResponse {
  federation: Federation & {
    attachments: FederationAttachmentDto[];
    plateSets: FederationPlateSetDto[];
  };
  receipts: FederationReceiptDto[];
  writeoffs: FederationWriteoffDto[];
  competitions: Array<{
    id: string;
    code: string;
    nameRu: string;
    startDate: string;
    endDate: string;
    status: string;
    _count: { nominations: number };
  }>;
  balance: {
    receivedNominations: number;
    consumedNominations: number;
    remainingNominations: number;
    receivedAmountKopecks: string | number;
  };
  telegramSubscriptionCode: string;
  regionalComparison: Array<{
    federationId: string;
    code: string;
    nameRu: string;
    nominations: number;
  }>;
}

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

export function useFederationDashboard(id: string) {
  return useQuery<FederationDashboardResponse>({
    queryKey: ['federations', id, 'dashboard'],
    queryFn: () => api.federations.dashboard(id),
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

export function useCreateFederationReceipt(federationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      number: string;
      date: string;
      nominationsCount: number;
      amountKopecks: number;
      paymentMethod: FederationReceiptDto['paymentMethod'];
      expiresAt: string;
      externalReference?: string | null;
    }) => api.federations.createReceipt(federationId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['federations', federationId] });
      void qc.invalidateQueries({ queryKey: ['federations', federationId, 'dashboard'] });
    },
  });
}

export function useCreateFederationWriteoff(federationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      number: string;
      date: string;
      nominationsCount: number;
      competitionId?: string | null;
      linkedReceiptId?: string | null;
    }) => api.federations.createWriteoff(federationId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['federations', federationId] });
      void qc.invalidateQueries({ queryKey: ['federations', federationId, 'dashboard'] });
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
