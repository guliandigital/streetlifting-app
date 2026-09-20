import { describe, expect, it } from 'vitest';
import {
  correctProtocol,
  protocolReviewCommand,
  reweighProtocol,
  requireResolvedTies,
  reviewSnapshotSchema,
  validateRecordEvidence,
} from './protocol-review.js';

const id = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
function fixture() {
  return {
    schemaVersion: 1,
    calculationVersion: 'competition-scoring-v1',
    competition: {
      id,
      federationId: id,
      code: 'cup',
      nameRu: 'Cup',
      startDate: '2030-01-01',
      endDate: '2030-01-01',
      rulebook: 'captured rules',
    },
    nominations: [
      {
        id,
        athleteId: id,
        disciplineId: id,
        divisionId: id,
        weightClassId: id,
        entryNumber: 1,
        status: 'finished',
        placeInClass: 1,
        placeInDivision: 1,
        placeOverall: 1,
        bodyWeightAtWeighIn: 75,
        bestSuccessfulAttemptKg: 50,
        finalScore: 50,
        athlete: { firstName: 'A', lastName: 'B', middleName: null },
        discipline: {
          nameRu: 'Pull-up',
          format: 'three_attempts_max',
          attemptCount: 1,
          fixedWeightKg: null as number | null,
          components: [],
        },
        division: { nameRu: 'Open', minAge: 13 },
        weightClass: { nameRu: '80', maxKg: 80 },
        attempts: [
          {
            id: other,
            componentId: null,
            attemptNumber: 1,
            weightKg: 50,
            repsCount: null,
            result: 'good_lift',
          },
        ],
      },
    ],
  };
}
const command = protocolReviewCommand.parse({
  action: 'correct',
  sourceReference: 'signed original',
  clericalCorrectionOnly: true,
  expectedRevision: 1,
  nominationId: id,
  attemptId: other,
  weightKg: 55,
  repsCount: null,
  result: 'good_lift',
  reason: 'Corrected from original judge sheet',
});
if (command.action !== 'correct') throw new Error('Fixture');
const correction = command;
describe('protocol correction', () => {
  it('recalculates from frozen rules without modifying the original evidence', () => {
    const source = fixture();
    const result = correctProtocol(source, correction);
    expect(source.nominations[0]!.finalScore).toBe(50);
    expect(result.nominations[0]!.finalScore).toBe(55);
    expect(result.nominations[0]!.division.minAge).toBe(13);
    expect(result.competition.rulebook).toBe('captured rules');
    expect(result.approvalStatus).toBe('not_recorded');
  });
  it('removes places when the corrected last successful attempt is not valid', () => {
    const result = correctProtocol(fixture(), { ...correction, result: 'no_lift' });
    expect(result.nominations[0]!.finalScore).toBeNull();
    expect(result.nominations[0]!.placeInClass).toBeNull();
  });
  it('rejects foreign attempt IDs and no-op revisions', () => {
    expect(() => correctProtocol(fixture(), { ...correction, attemptId: id })).toThrow();
    expect(() => correctProtocol(fixture(), { ...correction, weightKg: 50 })).toThrow();
  });
  it('enforces captured fixed weights and a supported calculator version', () => {
    const source = fixture();
    source.nominations[0]!.discipline.fixedWeightKg = 50;
    expect(() => correctProtocol(source, correction)).toThrow();
    expect(() =>
      correctProtocol({ ...fixture(), calculationVersion: 'unknown' }, correction),
    ).toThrow();
  });
  it('requires an explicit reason, revision and valid correction fields', () => {
    expect(protocolReviewCommand.safeParse({ ...correction, reason: '' }).success).toBe(false);
    expect(protocolReviewCommand.safeParse({ ...correction, weightKg: -1 }).success).toBe(false);
    expect(protocolReviewCommand.safeParse({ ...correction, expectedRevision: 0 }).success).toBe(
      false,
    );
    expect(protocolReviewCommand.safeParse({ ...correction, athleteId: other }).success).toBe(
      false,
    );
  });
});

describe('ISF 5.1 evidence and reweighing', () => {
  it('requires both protocol signatures and a reference', () => {
    expect(
      protocolReviewCommand.safeParse({
        action: 'approve',
        expectedRevision: 1,
        reason: 'Source protocol confirmed',
      }).success,
    ).toBe(false);
  });
  it('preserves legacy ranking but requires reweighing before approving tied results', () => {
    const source = fixture();
    source.calculationVersion = 'competition-scoring-v2';
    source.nominations.push({ ...source.nominations[0]!, id: other, entryNumber: 2 });
    expect(() => requireResolvedTies(reviewSnapshotSchema.parse(source))).toThrow();
    const shared = reweighProtocol(source, {
      action: 'reweigh',
      expectedRevision: 1,
      reason: 'Reweighing confirmed',
      sourceReference: 'signed weighing sheet',
      weights: [
        { nominationId: id, weightKg: 74 },
        { nominationId: other, weightKg: 74 },
      ],
    });
    expect(shared.nominations.map((n) => n.placeInClass)).toEqual([1, 1]);
    expect(() => requireResolvedTies(reviewSnapshotSchema.parse(shared))).not.toThrow();
    const ranked = reweighProtocol(source, {
      action: 'reweigh',
      expectedRevision: 1,
      reason: 'Reweighing confirmed',
      sourceReference: 'signed weighing sheet',
      weights: [
        { nominationId: id, weightKg: 74 },
        { nominationId: other, weightKg: 73 },
      ],
    });
    expect(ranked.nominations.map((n) => n.placeInClass)).toEqual([2, 1]);
    expect(source.nominations[0]!.bodyWeightAtWeighIn).toBe(75);
    expect(() =>
      reweighProtocol(
        { ...source, calculationVersion: 'competition-scoring-v1' },
        {
          action: 'reweigh',
          expectedRevision: 1,
          reason: 'Reweighing confirmed',
          sourceReference: 'source',
          weights: [{ nominationId: id, weightKg: 74 }],
        },
      ),
    ).toThrow();
  });
  it('enforces record increments and evidence completeness', () => {
    const evidence = {
      sanctionReference: 'sanction',
      judgingReference: 'judges',
      weightReference: 'weights',
      equipmentReference: 'equipment',
      videoReference: 'video',
      registryReference: 'registry',
      previousBest: 50,
      categoryAndAttemptEligibilityConfirmed: true,
    };
    expect(() => validateRecordEvidence('three_attempts_max', 51, evidence)).toThrow();
    expect(() => validateRecordEvidence('three_attempts_max', 51.25, evidence)).not.toThrow();
    expect(() => validateRecordEvidence('reps_to_failure', 50, evidence)).toThrow();
    expect(() => validateRecordEvidence('reps_to_failure', 51, evidence)).not.toThrow();
    expect(() => validateRecordEvidence('isometric_hold', 100, evidence)).toThrow();
    expect(() =>
      validateRecordEvidence('three_attempts_max', 55, { ...evidence, videoReference: '' }),
    ).toThrow();
  });
});
