import type { AttemptResult, DisciplineFormat } from './enums.js';

export interface ScoringComponent {
  id: string;
  attemptCount: number;
  fixedWeightKg: number | null;
}

export interface ScoringAttempt {
  componentId: string | null;
  attemptNumber: number;
  weightKg: number;
  result: AttemptResult;
  repsCount: number | null;
}

export interface ScoringDiscipline {
  format: DisciplineFormat;
  attemptCount: number;
}

export interface ScoringNomination {
  id: string;
  disciplineId: string;
  divisionId: string;
  weightClassId: string;
  bodyWeightAtWeighIn: number | null;
  entryNumber: number | null;
  status?: string;
  discipline: ScoringDiscipline;
  components: ScoringComponent[];
  attempts: ScoringAttempt[];
}

export interface NominationScore {
  bestSuccessfulAttemptKg: number | null;
  finalScore: number | null;
  completedAttemptCount: number;
  hasPendingAttempts: boolean;
}

export interface NominationPlaces {
  nominationId: string;
  placeInClass: number | null;
  placeInDivision: number | null;
  placeOverall: number | null;
}

function successfulAttempts(attempts: ScoringAttempt[]): ScoringAttempt[] {
  return attempts.filter((attempt) => attempt.result === 'good_lift');
}

function isRepetitionDiscipline(format: DisciplineFormat): boolean {
  return format === 'reps_to_failure' || format === 'reps_in_time' || format === 'isometric_hold';
}

function scoreComponent(
  discipline: ScoringDiscipline,
  attempts: ScoringAttempt[],
): { result: number | null; bestWeightKg: number | null } {
  const successful = successfulAttempts(attempts);
  if (successful.length === 0) return { result: null, bestWeightKg: null };

  if (isRepetitionDiscipline(discipline.format)) {
    return {
      result: Math.max(...successful.map((attempt) => attempt.repsCount ?? 0)),
      bestWeightKg: Math.max(...successful.map((attempt) => attempt.weightKg)),
    };
  }

  const bestWeightKg = Math.max(...successful.map((attempt) => attempt.weightKg));
  return { result: bestWeightKg, bestWeightKg };
}

export function calculateNominationScore(nomination: ScoringNomination): NominationScore {
  const components = nomination.components.length > 0 ? nomination.components : [{ id: 'default', attemptCount: nomination.discipline.attemptCount, fixedWeightKg: null }];
  let finalScore = 0;
  let bestSuccessfulAttemptKg = 0;
  let hasResult = false;

  for (const component of components) {
    const attempts =
      nomination.components.length > 0
        ? nomination.attempts.filter((attempt) => attempt.componentId === component.id)
        : nomination.attempts;
    const componentScore = scoreComponent(nomination.discipline, attempts);
    if (componentScore.result !== null) {
      finalScore += componentScore.result;
      bestSuccessfulAttemptKg += componentScore.bestWeightKg ?? component.fixedWeightKg ?? 0;
      hasResult = true;
    }
  }

  return {
    bestSuccessfulAttemptKg: hasResult ? bestSuccessfulAttemptKg : null,
    finalScore: hasResult ? finalScore : null,
    completedAttemptCount: nomination.attempts.length,
    hasPendingAttempts: nomination.attempts.some((attempt) => attempt.result === 'pending'),
  };
}

function rankable(nomination: ScoringNomination & { finalScore: number | null }): boolean {
  return (
    nomination.finalScore !== null &&
    nomination.status !== 'disqualified' &&
    nomination.status !== 'withdrawn'
  );
}

function compareRankable(
  a: ScoringNomination & { finalScore: number | null },
  b: ScoringNomination & { finalScore: number | null },
): number {
  const scoreDiff = (b.finalScore ?? Number.NEGATIVE_INFINITY) - (a.finalScore ?? Number.NEGATIVE_INFINITY);
  if (scoreDiff !== 0) return scoreDiff;

  const bodyWeightA = a.bodyWeightAtWeighIn ?? Number.POSITIVE_INFINITY;
  const bodyWeightB = b.bodyWeightAtWeighIn ?? Number.POSITIVE_INFINITY;
  if (bodyWeightA !== bodyWeightB) return bodyWeightA - bodyWeightB;

  const entryA = a.entryNumber ?? Number.POSITIVE_INFINITY;
  const entryB = b.entryNumber ?? Number.POSITIVE_INFINITY;
  if (entryA !== entryB) return entryA - entryB;

  return a.id.localeCompare(b.id);
}

function assignGroupPlaces(
  nominations: Array<ScoringNomination & { finalScore: number | null }>,
): Map<string, number> {
  const ranked = nominations.filter(rankable).sort(compareRankable);
  return new Map(ranked.map((nomination, index) => [nomination.id, index + 1]));
}

function groupKey(nomination: ScoringNomination, scope: 'class' | 'division' | 'overall'): string {
  if (scope === 'class') {
    return `${nomination.disciplineId}:${nomination.divisionId}:${nomination.weightClassId}`;
  }
  if (scope === 'division') return `${nomination.disciplineId}:${nomination.divisionId}`;
  return nomination.disciplineId;
}

export function calculateNominationPlaces(
  nominations: Array<ScoringNomination & { finalScore: number | null }>,
): NominationPlaces[] {
  const scopes = ['class', 'division', 'overall'] as const;
  const scopePlaces = new Map<(typeof scopes)[number], Map<string, Map<string, number>>>();

  for (const scope of scopes) {
    const groups = new Map<string, Array<ScoringNomination & { finalScore: number | null }>>();
    for (const nomination of nominations) {
      const key = groupKey(nomination, scope);
      groups.set(key, [...(groups.get(key) ?? []), nomination]);
    }
    scopePlaces.set(
      scope,
      new Map([...groups.entries()].map(([key, group]) => [key, assignGroupPlaces(group)])),
    );
  }

  return nominations.map((nomination) => ({
    nominationId: nomination.id,
    placeInClass: scopePlaces.get('class')?.get(groupKey(nomination, 'class'))?.get(nomination.id) ?? null,
    placeInDivision:
      scopePlaces.get('division')?.get(groupKey(nomination, 'division'))?.get(nomination.id) ?? null,
    placeOverall: scopePlaces.get('overall')?.get(groupKey(nomination, 'overall'))?.get(nomination.id) ?? null,
  }));
}
