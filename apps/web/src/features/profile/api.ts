import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api-client.js';

import type {
  CabinetOverview,
  PassportExternalLink,
  PassportReviewRequest,
  PassportAttachment,
  PassportFederationReviewRequest,
} from '../../lib/passport-api.js';

export type {
  CabinetOverview,
  PassportExternalLink,
  PassportReviewRequest,
  PassportAttachment,
  PassportFederationReviewRequest,
};

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
