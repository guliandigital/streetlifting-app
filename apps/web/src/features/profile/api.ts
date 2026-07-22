import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api-client.js';

export interface CabinetOverview {
  identity: { isfSubjectId: string | null };
  athlete: {
    id: string;
    displayName: string;
    federationCardNumber: string | null;
    clubName: string | null;
    appearancesTotal: number;
    recordsTotal: number;
    appearances: Array<{
      id: string;
      status: string;
      bestSuccessfulAttemptKg: number | null;
      finalScore: number | null;
      placeOverall: number | null;
      placeInDivision: number | null;
      placeInClass: number | null;
      competition: { id: string; nameRu: string; startDate: string; city: string | null };
      discipline: { code: string; nameRu: string };
    }>;
    records: Array<{
      id: string;
      scope: string;
      result: number;
      achievedOn: string;
      ratifiedAt: string | null;
      discipline: { code: string; nameRu: string };
      competition: { id: string; nameRu: string };
    }>;
  } | null;
  official: {
    id: string;
    displayName: string;
    categoryRu: string | null;
    categoryEn: string | null;
    cardNumber: string | null;
    cityRegion: string | null;
    assignmentsTotal: number;
    assignments: Array<{
      id: string;
      role: string;
      assignedAt: string;
      competition: { id: string; nameRu: string; startDate: string; city: string | null };
      platform: { id: string; name: string } | null;
    }>;
    upcomingAssignments: Array<{
      id: string;
      role: string;
      assignedAt: string;
      competition: { id: string; nameRu: string; startDate: string; city: string | null };
      platform: { id: string; name: string } | null;
    }>;
  } | null;
}

export function useCabinetOverview() {
  return useQuery<CabinetOverview>({
    queryKey: ['cabinet', 'overview'],
    queryFn: () => api.cabinet.overview(),
  });
}
