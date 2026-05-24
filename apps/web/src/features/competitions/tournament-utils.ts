import type { DisciplineComponentDto, LiveNominationDto, NominationDto } from './operations-api.js';

type TournamentNominationDto = NominationDto | LiveNominationDto;

export interface ComponentOption {
  id: string | null;
  label: string;
  attemptCount: number;
  fixedWeightKg: number | null;
}

export function fullName(person: {
  lastName: string;
  firstName: string;
  middleName?: string | null;
}): string {
  return [person.lastName, person.firstName, person.middleName].filter(Boolean).join(' ');
}

export function componentLabel(component: DisciplineComponentDto): string {
  return component.fixedWeightKg === null
    ? component.nameRu
    : `${component.nameRu} · ${component.fixedWeightKg} kg`;
}

export function componentOptions(nomination: TournamentNominationDto): ComponentOption[] {
  if (nomination.discipline.components.length > 0) {
    return nomination.discipline.components.map((component) => ({
      id: component.id,
      label: componentLabel(component),
      attemptCount: component.attemptCount,
      fixedWeightKg: component.fixedWeightKg,
    }));
  }

  return [
    {
      id: null,
      label: nomination.discipline.nameRu,
      attemptCount: nomination.discipline.attemptCount,
      fixedWeightKg: nomination.discipline.fixedWeightKg,
    },
  ];
}

export function nextAttemptNumber(
  nomination: TournamentNominationDto,
  componentId: string | null,
): number {
  const options = componentOptions(nomination);
  const component = options.find((item) => item.id === componentId) ?? options[0];
  if (!component) return 1;
  const used = new Set(
    nomination.attempts
      .filter((attempt) =>
        componentId ? attempt.componentId === componentId : attempt.componentId === null,
      )
      .map((attempt) => attempt.attemptNumber),
  );

  for (let attempt = 1; attempt <= component.attemptCount; attempt += 1) {
    if (!used.has(attempt)) return attempt;
  }
  return component.attemptCount;
}

export function attemptSummary(nomination: TournamentNominationDto): string {
  if (nomination.attempts.length === 0) return '—';
  return nomination.attempts
    .map((attempt) => {
      const component = attempt.component?.code ?? nomination.discipline.components[0]?.code ?? '-';
      const reps = attempt.repsCount !== null ? `/${attempt.repsCount}` : '';
      return `${component}${attempt.attemptNumber}:${attempt.weightKg}${reps}:${attempt.result}`;
    })
    .join(' | ');
}

export function sortForPlatform(a: TournamentNominationDto, b: TournamentNominationDto): number {
  return (
    (a.flight?.code ?? '').localeCompare(b.flight?.code ?? '') ||
    (a.group?.name ?? '').localeCompare(b.group?.name ?? '') ||
    (a.entryNumber ?? Number.POSITIVE_INFINITY) - (b.entryNumber ?? Number.POSITIVE_INFINITY) ||
    fullName(a.athlete).localeCompare(fullName(b.athlete))
  );
}
