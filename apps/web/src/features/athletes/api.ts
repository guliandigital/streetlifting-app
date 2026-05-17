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

export interface AthleteAttemptDto {
  id: string;
  attemptNumber: number;
  weightKg: number;
  result: 'good_lift' | 'no_lift' | 'withdrawn' | 'pending';
  repsCount: number | null;
  component: { id: string; code: string; nameRu: string; nameEn: string } | null;
}

export interface AthleteAppearanceDto {
  id: string;
  status: string;
  bodyWeightAtWeighIn: number | null;
  bestSuccessfulAttemptKg: number | null;
  finalScore: number | null;
  placeInClass: number | null;
  placeInDivision: number | null;
  placeOverall: number | null;
  notes: string | null;
  competition: {
    id: string;
    code: string;
    nameRu: string;
    startDate: string;
    endDate: string;
    city: string | null;
    status: string;
    federation: { id: string; code: string; nameRu: string };
  };
  discipline: { id: string; code: string; nameRu: string; nameEn: string };
  division: {
    id: string;
    code: string;
    nameRu: string;
    nameEn: string;
    gender: 'M' | 'F';
    veteranTier: string;
  };
  weightClass: {
    id: string;
    code: string;
    nameRu: string;
    nameEn: string;
    weightMin: number | null;
    weightMax: number | null;
  };
  attempts: AthleteAttemptDto[];
}

export interface AthleteRecordDto {
  id: string;
  scope: 'federation' | 'national' | 'continental' | 'world';
  result: number;
  pointsScore: number | null;
  achievedOn: string;
  ratifiedAt: string | null;
  notes: string | null;
  federation: { id: string; code: string; nameRu: string } | null;
  competition: { id: string; code: string; nameRu: string; startDate: string };
  discipline: { id: string; code: string; nameRu: string; nameEn: string };
  division: { id: string; code: string; nameRu: string; nameEn: string };
  weightClass: { id: string; code: string; nameRu: string; nameEn: string };
}

export interface AthleteAttachmentDto {
  id: string;
  kind: string;
  filename: string;
  mimeType: string;
  sizeBytes: string | number;
  uploadedAt: string;
}

export interface AthleteDetailResponse {
  athlete: AthleteDto;
  appearances: AthleteAppearanceDto[];
  records: AthleteRecordDto[];
  attachments: AthleteAttachmentDto[];
}

export function useAthletes(search: string, limit = 50, offset = 0) {
  return useQuery<AthleteListResponse>({
    queryKey: ['athletes', { search, limit, offset }],
    queryFn: () => api.athletes.list({ search, limit, offset }),
    placeholderData: keepPreviousData,
  });
}

export function useAthlete(id: string) {
  return useQuery<AthleteDetailResponse>({
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
