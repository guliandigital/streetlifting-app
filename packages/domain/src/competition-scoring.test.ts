import { describe, expect, it } from 'vitest';
import {
  calculateNominationPlaces,
  calculateNominationPlacesV1,
  calculateNominationScore,
  hasCompleteAttemptSet,
  type ScoringNomination,
} from './competition-scoring.js';

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

describe('complete attempt protocol', () => {
  const protocol = {
    discipline: { attemptCount: 3 },
    components: [
      { id: 'pull', attemptCount: 1 },
      { id: 'dip', attemptCount: 1 },
    ],
    attempts: [
      { componentId: 'pull', attemptNumber: 1, result: 'good_lift' },
      { componentId: 'dip', attemptNumber: 1, result: 'no_lift' },
    ],
  };
  it('accepts a completed protocol even with an unsuccessful component', () => {
    expect(hasCompleteAttemptSet(protocol)).toBe(true);
  });
  it('does not mistake duplicate or excess slots for the missing component', () => {
    expect(
      hasCompleteAttemptSet({
        ...protocol,
        attempts: [protocol.attempts[0]!, protocol.attempts[0]!],
      }),
    ).toBe(false);
    expect(
      hasCompleteAttemptSet({
        ...protocol,
        attempts: [protocol.attempts[0]!, { ...protocol.attempts[0]!, attemptNumber: 2 }],
      }),
    ).toBe(false);
  });
  it('rejects undecided attempts', () => {
    expect(
      hasCompleteAttemptSet({
        ...protocol,
        attempts: [protocol.attempts[0]!, { ...protocol.attempts[1]!, result: 'pending' }],
      }),
    ).toBe(false);
  });
  it('handles disciplines without components and explicit withdrawals', () => {
    expect(
      hasCompleteAttemptSet({
        discipline: { attemptCount: 1 },
        components: [],
        attempts: [{ componentId: null, attemptNumber: 1, result: 'withdrawn' }],
      }),
    ).toBe(true);
  });
});

describe('competition scoring', () => {
  it('uses the best successful weight for max-weight disciplines', () => {
    const score = calculateNominationScore({
      ...baseNomination,
      attempts: [
        { componentId: 'pu', attemptNumber: 1, weightKg: 45, result: 'good_lift', repsCount: null },
        { componentId: 'pu', attemptNumber: 2, weightKg: 50, result: 'no_lift', repsCount: null },
        {
          componentId: 'pu',
          attemptNumber: 3,
          weightKg: 47.5,
          result: 'good_lift',
          repsCount: null,
        },
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

  it.each(['missing', 'no_lift', 'pending'] as const)(
    'does not rank an incomplete total: %s second component',
    (result) => {
      const nomination = {
        ...baseNomination,
        status: 'finished',
        components: [
          { id: 'pu', attemptCount: 3, fixedWeightKg: null },
          { id: 'di', attemptCount: 3, fixedWeightKg: null },
        ],
        attempts: [
          {
            componentId: 'pu',
            attemptNumber: 1,
            weightKg: 50,
            result: 'good_lift' as const,
            repsCount: null,
          },
          ...(result === 'missing'
            ? []
            : [{ componentId: 'di', attemptNumber: 1, weightKg: 70, result, repsCount: null }]),
        ],
      };
      const score = calculateNominationScore(nomination);
      expect(score.finalScore).toBeNull();
      expect(score.bestSuccessfulAttemptKg).toBeNull();
      expect(
        calculateNominationPlaces([{ ...nomination, finalScore: score.finalScore }])[0],
      ).toMatchObject({
        placeInClass: null,
        placeInDivision: null,
        placeOverall: null,
      });
    },
  );

  it('shares places for equal result and bodyweight, leaving the next place vacant', () => {
    const places = calculateNominationPlaces([
      { ...baseNomination, id: 'heavy', finalScore: 100, bodyWeightAtWeighIn: 82, entryNumber: 1 },
      { ...baseNomination, id: 'light', finalScore: 100, bodyWeightAtWeighIn: 80, entryNumber: 3 },
      { ...baseNomination, id: 'early', finalScore: 100, bodyWeightAtWeighIn: 80, entryNumber: 2 },
    ]);

    expect(places.find((place) => place.nominationId === 'early')?.placeInClass).toBe(1);
    expect(places.find((place) => place.nominationId === 'light')?.placeInClass).toBe(1);
    expect(places.find((place) => place.nominationId === 'heavy')?.placeInClass).toBe(3);
  });
});

it('retains entry-number tie breaking only for historical v1 snapshots', () => {
  const nominations = [
    { ...baseNomination, id: 'late', finalScore: 100, entryNumber: 3 },
    { ...baseNomination, id: 'early', finalScore: 100, entryNumber: 2 },
  ];
  expect(calculateNominationPlacesV1(nominations).map((n) => n.placeInClass)).toEqual([2, 1]);
  expect(calculateNominationPlaces(nominations).map((n) => n.placeInClass)).toEqual([1, 1]);
});
