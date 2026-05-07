import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AthleteCreate, AthleteUpdate } from '@streetlifting/domain';
import { api } from '../../lib/api-client.js';

export interface AthleteDto {
  id: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  dateOfBirth: string;
  gender: 'M' | 'F';
  countryCode: string;
  regionCode: string | null;
  city: string | null;
  coachName: string | null;
  clubName: string | null;
  federationCardNumber: string | null;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AthleteListResponse {
  athletes: AthleteDto[];
  total: number;
  limit: number;
  offset: number;
}

export function useAthletes(search: string, limit = 50, offset = 0) {
  return useQuery<AthleteListResponse>({
    queryKey: ['athletes', { search, limit, offset }],
    queryFn: () => api.athletes.list({ search, limit, offset }),
    placeholderData: keepPreviousData,
  });
}

export function useAthlete(id: string) {
  return useQuery<{ athlete: AthleteDto }>({
    queryKey: ['athletes', id],
    queryFn: () => api.athletes.get(id),
  });
}

export function useCreateAthlete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AthleteCreate) => api.athletes.create(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['athletes'] }),
  });
}

export function useUpdateAthlete(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AthleteUpdate) => api.athletes.update(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['athletes'] });
      void qc.invalidateQueries({ queryKey: ['athletes', id] });
    },
  });
}
