import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  AttemptUpsert,
  FlightAutoPlan,
  JudgeAssignmentCreate,
  JudgeRole,
  NominationCreate,
  NominationDraw,
  NominationUpdate,
  JudgeDecisionSubmission,
} from '@streetlifting/domain';
import { api } from '../../lib/api-client.js';

export interface DivisionDto {
  id: string;
  competitionId: string;
  code: string;
  nameRu: string;
  nameEn: string;
  gender: 'M' | 'F';
  veteranTier: string;
  ageMin: number | null;
  ageMax: number | null;
  veteranCoefficient: number;
  weightClasses: WeightClassDto[];
}

export interface WeightClassDto {
  id: string;
  divisionId: string;
  disciplineId: string | null;
  code: string;
  nameRu: string;
  nameEn: string;
  weightMin: number | null;
  weightMax: number | null;
  order: number;
}

export interface DisciplineComponentDto {
  id: string;
  disciplineId: string;
  code: string;
  nameRu: string;
  nameEn: string;
  equipment: string;
  order: number;
  attemptCount: number;
  fixedWeightKg: number | null;
}

export interface PlatformDto {
  id: string;
  competitionId: string;
  name: string;
  order: number;
  flights: FlightDto[];
}

export interface FlightDto {
  id: string;
  competitionId: string;
  platformId: string;
  code: string;
  name: string;
  order: number;
  startTime: string | null;
  groups: GroupDto[];
}

export interface GroupDto {
  id: string;
  flightId: string;
  name: string;
  order: number;
}

export interface AttemptDto {
  id: string;
  nominationId: string;
  componentId: string | null;
  attemptNumber: number;
  weightKg: number;
  result: 'pending' | 'good_lift' | 'no_lift' | 'withdrawn';
  judgeDecisions: unknown[];
  repsCount: number | null;
  timeoutSeconds: number | null;
  startedAt: string | null;
  decidedAt: string | null;
  notes: string | null;
  component: DisciplineComponentDto | null;
}

export interface NominationDto {
  id: string;
  competitionId: string;
  athleteId: string;
  disciplineId: string;
  divisionId: string;
  declaredWeightClassId: string | null;
  weightClassId: string;
  bodyWeightAtWeighIn: number | null;
  entryNumber: number | null;
  flightId: string | null;
  groupId: string | null;
  status:
    | 'draft'
    | 'paid'
    | 'weighed_in'
    | 'on_platform'
    | 'finished'
    | 'disqualified'
    | 'withdrawn';
  isEntryFeePaid: boolean;
  paymentStatus: 'unpaid' | 'partial' | 'paid' | 'waived' | 'refunded';
  paidAmountKopecks: string | number;
  paymentMethod: 'bank_transfer' | 'card' | 'sbp' | 'cash' | 'other' | null;
  paymentComment: string | null;
  paidAt: string | null;
  isMandatePassed: boolean;
  bestSuccessfulAttemptKg: number | null;
  finalScore: number | null;
  placeInClass: number | null;
  placeInDivision: number | null;
  placeOverall: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  athlete: {
    id: string;
    lastName: string;
    firstName: string;
    middleName: string | null;
    dateOfBirth: string;
    clubName: string | null;
    federationCardNumber: string | null;
    photoUrl: string | null;
  };
  discipline: {
    id: string;
    code: string;
    nameRu: string;
    nameEn: string;
    attemptCount: number;
    fixedWeightKg: number | null;
    format: string;
    components: DisciplineComponentDto[];
  };
  division: {
    id: string;
    code: string;
    nameRu: string;
    nameEn: string;
    gender: 'M' | 'F';
  };
  declaredWeightClass: {
    id: string;
    code: string;
    nameRu: string;
    nameEn: string;
  } | null;
  weightClass: {
    id: string;
    code: string;
    nameRu: string;
    nameEn: string;
  };
  flight: { id: string; code: string; name: string } | null;
  group: { id: string; name: string } | null;
  attempts: AttemptDto[];
}

export interface PublicAttemptDto {
  id: string;
  nominationId: string;
  componentId: string | null;
  attemptNumber: number;
  weightKg: number;
  result: AttemptDto['result'];
  repsCount: number | null;
  timeoutSeconds: number | null;
  component: DisciplineComponentDto | null;
}

export interface LiveAttemptDto extends PublicAttemptDto {
  judgeDecisions: unknown[];
  startedAt: string | null;
  decidedAt: string | null;
}

export interface PublicNominationDto {
  id: string;
  entryNumber: number | null;
  bodyWeightAtWeighIn: number | null;
  status: NominationDto['status'];
  bestSuccessfulAttemptKg: number | null;
  finalScore: number | null;
  placeInClass: number | null;
  placeInDivision: number | null;
  placeOverall: number | null;
  athlete: {
    id: string;
    lastName: string;
    firstName: string;
    middleName: string | null;
    birthYear: number | null;
    clubName: string | null;
    photoUrl: string | null;
  };
  discipline: NominationDto['discipline'];
  division: NominationDto['division'];
  declaredWeightClass: NominationDto['declaredWeightClass'];
  weightClass: NominationDto['weightClass'];
  flight: { id: string; code: string; name: string } | null;
  group: { id: string; name: string } | null;
  attempts: PublicAttemptDto[];
}

export interface LiveNominationDto extends Omit<PublicNominationDto, 'attempts'> {
  competitionId: string;
  athleteId: string;
  disciplineId: string;
  divisionId: string;
  declaredWeightClassId: string | null;
  weightClassId: string;
  flightId: string | null;
  groupId: string | null;
  isMandatePassed: boolean;
  attempts: LiveAttemptDto[];
}

export interface ScoreboardRowDto {
  nominationId: string;
  entryNumber: number | null;
  athleteName: string;
  discipline: string;
  division: string;
  weightClass: string;
  placeInClass: number | null;
  placeInDivision: number | null;
  placeOverall: number | null;
  bestSuccessfulAttemptKg: number | null;
  finalScore: number | null;
  status: NominationDto['status'];
}

export interface JudgeAssignmentDto {
  id: string;
  competitionId: string;
  judgeId: string;
  platformId: string | null;
  role: JudgeRole;
  assignedAt: string;
  judge: {
    id: string;
    lastName: string;
    firstName: string;
    middleName: string | null;
    categoryRu: string | null;
    categoryEn: string | null;
    cardNumber: string | null;
    cityRegion: string | null;
  };
  platform: {
    id: string;
    name: string;
    order: number;
  } | null;
}

export interface CompetitionOpsResponse {
  competition: {
    id: string;
    federationId: string;
    code: string;
    nameRu: string;
    nameEn: string;
    startDate: string;
    endDate: string;
    entryFeeKopecks: string | number;
    federation: {
      id: string;
      code: string;
      nameRu: string;
      billingTariffKopecksPerNomination: string | number;
      isPublicResultsClosed?: boolean;
    };
  };
  divisions: DivisionDto[];
  platforms: PlatformDto[];
  judgeAssignments: JudgeAssignmentDto[];
  nominations: NominationDto[];
  scoreboardRows: ScoreboardRowDto[];
  accounting: {
    totalNominations: number;
    paidNominations: number;
    unpaidNominations: number;
    weighedInNominations: number;
    mandatePassedNominations: number;
    expectedEntryFeeKopecks: number;
    paidEntryFeeKopecks: number;
    federationBillingKopecks: number;
  };
}

export interface ScoreboardResponse {
  competition: PublicScoreboardResponse['competition'];
  nominations: LiveNominationDto[];
  rows: ScoreboardRowDto[];
  generatedAt: string;
}

export interface PublicScoreboardResponse {
  competition: {
    id: string;
    federationId: string;
    code: string;
    nameRu: string;
    nameEn: string;
    startDate: string;
    endDate: string;
    federation: {
      id: string;
      code: string;
      nameRu: string;
    };
  };
  nominations: PublicNominationDto[];
  rows: ScoreboardRowDto[];
  generatedAt: string;
}

export interface CompetitionLiveOpsResponse {
  competition: PublicScoreboardResponse['competition'];
  divisions: DivisionDto[];
  platforms: PlatformDto[];
  nominations: LiveNominationDto[];
  scoreboardRows: ScoreboardRowDto[];
}

export type MutationNominationDto = NominationDto | LiveNominationDto;
export type MutationAttemptDto = AttemptDto | LiveAttemptDto;

export function useCompetitionOps(id: string) {
  return useQuery<CompetitionOpsResponse>({
    queryKey: ['competitions', id, 'ops'],
    queryFn: () => api.competitions.ops(id),
  });
}

export function useCompetitionLiveOps(id: string) {
  return useQuery<CompetitionLiveOpsResponse>({
    queryKey: ['competitions', id, 'live-ops'],
    queryFn: () => api.competitions.liveOps(id),
  });
}

export function useScoreboard(id: string) {
  return useQuery<ScoreboardResponse>({
    queryKey: ['competitions', id, 'scoreboard'],
    queryFn: () => api.competitions.scoreboard(id),
    refetchInterval: 15_000,
  });
}

export function usePublicScoreboard(id: string) {
  return useQuery<PublicScoreboardResponse>({
    queryKey: ['public-competitions', id, 'scoreboard'],
    queryFn: () => api.competitions.publicScoreboard(id),
    refetchInterval: 15_000,
  });
}

export function useApplyDefaultSetup(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.competitions.applyDefaultSetup(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['competitions', id] });
      void qc.invalidateQueries({ queryKey: ['competitions', id, 'ops'] });
      void qc.invalidateQueries({ queryKey: ['competitions', id, 'live-ops'] });
    },
  });
}

export function useDrawNominations(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<NominationDraw> = {}) => api.competitions.drawNominations(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['competitions', id] });
      void qc.invalidateQueries({ queryKey: ['competitions', id, 'ops'] });
      void qc.invalidateQueries({ queryKey: ['competitions', id, 'live-ops'] });
      void qc.invalidateQueries({ queryKey: ['competitions', id, 'scoreboard'] });
    },
  });
}

export function useAutoPlanFlights(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<FlightAutoPlan> = {}) => api.competitions.autoPlanFlights(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['competitions', id] });
      void qc.invalidateQueries({ queryKey: ['competitions', id, 'ops'] });
      void qc.invalidateQueries({ queryKey: ['competitions', id, 'live-ops'] });
    },
  });
}

export function useCreateNomination(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: NominationCreate) => api.competitions.createNomination(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['competitions', id] });
      void qc.invalidateQueries({ queryKey: ['competitions', id, 'ops'] });
      void qc.invalidateQueries({ queryKey: ['competitions', id, 'live-ops'] });
      void qc.invalidateQueries({ queryKey: ['competitions', id, 'scoreboard'] });
    },
  });
}

export function useCreateJudgeAssignment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: JudgeAssignmentCreate) => api.competitions.createJudgeAssignment(id, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['competitions', id] });
      void qc.invalidateQueries({ queryKey: ['competitions', id, 'ops'] });
      void qc.invalidateQueries({ queryKey: ['competitions', id, 'live-ops'] });
    },
  });
}

export function useDeleteJudgeAssignment(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: string) => api.competitions.deleteJudgeAssignment(assignmentId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['competitions', id] });
      void qc.invalidateQueries({ queryKey: ['competitions', id, 'ops'] });
      void qc.invalidateQueries({ queryKey: ['competitions', id, 'live-ops'] });
    },
  });
}

export function useUpdateNomination(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ nominationId, data }: { nominationId: string; data: NominationUpdate }) =>
      api.competitions.updateNomination(nominationId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['competitions', id] });
      void qc.invalidateQueries({ queryKey: ['competitions', id, 'ops'] });
      void qc.invalidateQueries({ queryKey: ['competitions', id, 'live-ops'] });
      void qc.invalidateQueries({ queryKey: ['competitions', id, 'scoreboard'] });
    },
  });
}

export function useUpsertAttempt(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      nominationId,
      componentId,
      attemptNumber,
      data,
    }: {
      nominationId: string;
      componentId?: string | null;
      attemptNumber: number;
      data: Omit<AttemptUpsert, 'attemptNumber'>;
    }) =>
      componentId
        ? api.competitions.upsertComponentAttempt(nominationId, componentId, attemptNumber, data)
        : api.competitions.upsertAttempt(nominationId, attemptNumber, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['competitions', id] });
      void qc.invalidateQueries({ queryKey: ['competitions', id, 'ops'] });
      void qc.invalidateQueries({ queryKey: ['competitions', id, 'live-ops'] });
      void qc.invalidateQueries({ queryKey: ['competitions', id, 'scoreboard'] });
    },
  });
}

export function useSubmitJudgeDecision(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      nominationId,
      attemptNumber,
      data,
    }: {
      nominationId: string;
      attemptNumber: number;
      data: JudgeDecisionSubmission;
    }) => api.competitions.submitJudgeDecision(nominationId, attemptNumber, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['competitions', id] });
      void qc.invalidateQueries({ queryKey: ['competitions', id, 'ops'] });
      void qc.invalidateQueries({ queryKey: ['competitions', id, 'live-ops'] });
      void qc.invalidateQueries({ queryKey: ['competitions', id, 'scoreboard'] });
    },
  });
}
