import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CompetitionCreate, CompetitionUpdate } from '@streetlifting/domain';
import { api } from '../../lib/api-client.js';

export interface CompetitionDto {
  id: string;
  federationId: string;
  code: string;
  nameRu: string;
  nameEn: string;
  description: string | null;
  rulebook: string;
  startDate: string;
  endDate: string;
  registrationDeadline: string | null;
  city: string | null;
  venue: string | null;
  timezone: string;
  status: string;
  entryFeeKopecks: string | number;
  isOnlineRegistrationOpen: boolean;
  createdAt: string;
  updatedAt: string;
  federation: {
    id: string;
    code: string;
    nameRu: string;
    nameEn: string;
  };
  _count?: {
    nominations: number;
    flights: number;
    judgeAssignments: number;
  };
}

export interface CompetitionListResponse {
  competitions: CompetitionDto[];
  total: number;
  limit: number;
  offset: number;
}

export function useCompetitions(
  params: { federationId?: string; status?: string; limit?: number; offset?: number } & {
    enabled?: boolean;
  } = {},
) {
  const { enabled = true, ...query } = params;
  return useQuery<CompetitionListResponse>({
    queryKey: ['competitions', query],
    queryFn: () => api.competitions.list(query),
    enabled,
  });
}

export function useCompetition(id: string) {
  return useQuery<{ competition: CompetitionDto }>({
    queryKey: ['competitions', id],
    queryFn: () => api.competitions.get(id),
  });
}

export function useCreateCompetition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CompetitionCreate) => api.competitions.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['competitions'] }),
  });
}

export function useUpdateCompetition(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CompetitionUpdate) => api.competitions.update(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['competitions'] });
      void qc.invalidateQueries({ queryKey: ['competitions', id] });
    },
  });
}
