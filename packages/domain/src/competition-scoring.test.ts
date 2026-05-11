import { describe, expect, it } from 'vitest';
import { calculateNominationPlaces, calculateNominationScore, type ScoringNomination } from './competition-scoring.js';

const baseNomination: ScoringNomination = {
  id: 'n1',
  disciplineId: 'd1',
  divisionId: 'open',
  weightClassId: '82',
  bodyWeightAtWeighIn: 81.5,
  entryNumber: 10,
  discipline: { format: 'three_attempts_max', attemptCount: 3 },
  components: [{ id: 'pu', attemptCount: 3, fixedWeightKg: null }],
  attempts: [],
};

describe('competition scoring', () => {
  it('uses the best successful weight for max-weight disciplines', () => {
    const score = calculateNominationScore({
      ...baseNomination,
      attempts: [
        { componentId: 'pu', attemptNumber: 1, weightKg: 45, result: 'good_lift', repsCount: null },
        { componentId: 'pu', attemptNumber: 2, weightKg: 50, result: 'no_lift', repsCount: null },
        { componentId: 'pu', attemptNumber: 3, weightKg: 47.5, result: 'good_lift', repsCount: null },
      ],
    });

    expect(score.bestSuccessfulAttemptKg).toBe(47.5);
    expect(score.finalScore).toBe(47.5);
  });

  it('sums component results for totals', () => {
    const score = calculateNominationScore({
      ...baseNomination,
      components: [
        { id: 'pu', attemptCount: 3, fixedWeightKg: null },
        { id: 'di', attemptCount: 3, fixedWeightKg: null },
      ],
      attempts: [
        { componentId: 'pu', attemptNumber: 1, weightKg: 50, result: 'good_lift', repsCount: null },
        { componentId: 'di', attemptNumber: 1, weightKg: 70, result: 'good_lift', repsCount: null },
      ],
    });

    expect(score.bestSuccessfulAttemptKg).toBe(120);
    expect(score.finalScore).toBe(120);
  });

  it('uses best reps for fixed-weight multirep components', () => {
    const score = calculateNominationScore({
      ...baseNomination,
      discipline: { format: 'reps_to_failure', attemptCount: 1 },
      components: [{ id: 'pu', attemptCount: 1, fixedWeightKg: 16 }],
      attempts: [
        { componentId: 'pu', attemptNumber: 1, weightKg: 16, result: 'good_lift', repsCount: 18 },
        { componentId: 'pu', attemptNumber: 2, weightKg: 16, result: 'good_lift', repsCount: 20 },
      ],
    });

    expect(score.bestSuccessfulAttemptKg).toBe(16);
    expect(score.finalScore).toBe(20);
  });

  it('breaks ties by lower bodyweight and then lower entry number', () => {
    const places = calculateNominationPlaces([
      { ...baseNomination, id: 'heavy', finalScore: 100, bodyWeightAtWeighIn: 82, entryNumber: 1 },
      { ...baseNomination, id: 'light', finalScore: 100, bodyWeightAtWeighIn: 80, entryNumber: 3 },
      { ...baseNomination, id: 'early', finalScore: 100, bodyWeightAtWeighIn: 80, entryNumber: 2 },
    ]);

    expect(places.find((place) => place.nominationId === 'early')?.placeInClass).toBe(1);
    expect(places.find((place) => place.nominationId === 'light')?.placeInClass).toBe(2);
    expect(places.find((place) => place.nominationId === 'heavy')?.placeInClass).toBe(3);
  });
});
