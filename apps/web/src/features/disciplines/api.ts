import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api-client.js';

export interface DisciplineDto {
  id: string;
  code: string;
  nameRu: string;
  nameEn: string;
  family: 'streetlifting' | 'weighted_calisthenics' | 'multi_rep';
  format: 'three_attempts_max' | 'reps_to_failure' | 'reps_in_time' | 'isometric_hold';
  equipment:
    | 'pull_up_bar'
    | 'dip_bars'
    | 'bench'
    | 'squat_rack'
    | 'deadlift_platform'
    | 'parallel_bars'
    | 'rings'
    | 'ground';
  attemptCount: number;
  fixedWeightKg: number | null;
  applyVeteranCoefficient: boolean;
}

export function useDisciplines() {
  return useQuery<{ disciplines: DisciplineDto[] }>({
    queryKey: ['disciplines'],
    queryFn: () => api.disciplines.list(),
  });
}

export function useDiscipline(id: string) {
  return useQuery<{ discipline: DisciplineDto }>({
    queryKey: ['disciplines', id],
    queryFn: () => api.disciplines.get(id),
  });
}
