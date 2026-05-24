import type { NominationDto } from './operations-api.js';

type NominationGenderLike = {
  division: { gender: NominationDto['division']['gender'] };
};

export interface GenderStats {
  total: number;
  women: number;
  men: number;
}

export function nominationGenderStats<T extends NominationGenderLike>(
  nominations: readonly T[],
  predicate?: (nomination: T) => boolean,
): GenderStats {
  const selected = predicate ? nominations.filter(predicate) : nominations;
  return selected.reduce<GenderStats>(
    (stats, nomination) => ({
      total: stats.total + 1,
      women: stats.women + (nomination.division.gender === 'F' ? 1 : 0),
      men: stats.men + (nomination.division.gender === 'M' ? 1 : 0),
    }),
    { total: 0, women: 0, men: 0 },
  );
}

export function genderShortLabel(gender: NominationDto['division']['gender'] | undefined): string {
  if (gender === 'F') return 'Ж';
  if (gender === 'M') return 'М';
  return '-';
}
