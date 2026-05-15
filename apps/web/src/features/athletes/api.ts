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

export interface AthleteAppearanceDto {
  id: string;
  competitionId: string;
  competitionName: string;
  competitionStartDate: string;
  competitionCity: string | null;
  disciplineCode: string;
  disciplineName: string;
  divisionCode: string;
  divisionName: string;
  weightClassCode: string;
  weightClassName: string;
  bodyWeightAtWeighIn: number | null;
  bestSuccessfulAttemptKg: number | null;
  finalScore: number | null;
  placeOverall: number | null;
  placeInDivision: number | null;
  placeInClass: number | null;
  status: string;
}

export interface AthleteAppearancesResponse {
  appearances: AthleteAppearanceDto[];
  total: number;
}

export interface AthleteRecordDto {
  id: string;
  scope: 'federation' | 'national' | 'continental' | 'world';
  achievedOn: string;
  disciplineCode: string;
  disciplineName: string;
  divisionCode: string;
  divisionName: string;
  weightClassCode: string;
  weightClassName: string;
  result: number;
  pointsScore: number | null;
  competitionId: string;
  competitionName: string;
  ratifiedAt: string | null;
}

export interface AthleteRecordsResponse {
  records: AthleteRecordDto[];
  total: number;
}

export interface AthleteDocumentDto {
  id: string;
  kind:
    | 'athlete_photo'
    | 'federation_file'
    | 'competition_file'
    | 'certificate_pdf'
    | 'protocol_pdf'
    | 'misc';
  filename: string;
  mimeType: string;
  sizeBytes: string;
  uploadedAt: string;
}

export interface AthleteDocumentsResponse {
  documents: AthleteDocumentDto[];
  total: number;
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

export function useAthleteAppearances(id: string) {
  return useQuery<AthleteAppearancesResponse>({
    queryKey: ['athletes', id, 'appearances'],
    queryFn: () => api.athletes.appearances(id),
  });
}

export function useAthleteRecords(id: string) {
  return useQuery<AthleteRecordsResponse>({
    queryKey: ['athletes', id, 'records'],
    queryFn: () => api.athletes.records(id),
  });
}

export function useAthleteDocuments(id: string) {
  return useQuery<AthleteDocumentsResponse>({
    queryKey: ['athletes', id, 'documents'],
    queryFn: () => api.athletes.documents(id),
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
