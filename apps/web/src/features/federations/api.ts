import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FederationCreate, FederationUpdate } from '@streetlifting/domain';
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
