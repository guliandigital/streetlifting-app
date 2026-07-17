import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { JudgeCreate, JudgeUpdate } from '@streetlifting/domain';
import { api } from '../../lib/api-client.js';

export interface JudgeDto {
  id: string;
  userId?: string | null;
  lastName: string;
  firstName: string;
  middleName: string | null;
  categoryRu: string | null;
  categoryEn: string | null;
  cardNumber: string | null;
  cityRegion: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface JudgeListResponse {
  judges: JudgeDto[];
  total: number;
  limit: number;
  offset: number;
}

export function useJudges(search: string, limit = 50, offset = 0) {
  return useQuery<JudgeListResponse>({
    queryKey: ['judges', { search, limit, offset }],
    queryFn: () => api.judges.list({ search, limit, offset }),
    placeholderData: keepPreviousData,
  });
}

export function useJudge(id: string) {
  return useQuery<{ judge: JudgeDto }>({
    queryKey: ['judges', id],
    queryFn: () => api.judges.get(id),
  });
}

export function useCreateJudge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: JudgeCreate) => api.judges.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['judges'] }),
  });
}

export function useUpdateJudge(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: JudgeUpdate) => api.judges.update(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['judges'] });
      void qc.invalidateQueries({ queryKey: ['judges', id] });
    },
  });
}
