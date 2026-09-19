import { useQuery } from '@tanstack/react-query';
import { api } from './api-client.js';

/**
 * Federation read model shared across features (federation workspace,
 * profile passport requests, competition setup). Lives in `lib/` so features
 * never import each other (ADR-0003). Feature-specific DTOs stay in
 * `features/federations/api.ts`.
 */
export interface Federation {
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
  /** Personal-data operator requisites shown in consent texts (152-ФЗ). */
  pdOperatorName: string | null;
  pdOperatorAddress: string | null;
  pdOperatorContact: string | null;
  privacyPolicyUrl: string | null;
  createdAt: string;
  updatedAt: string;
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
