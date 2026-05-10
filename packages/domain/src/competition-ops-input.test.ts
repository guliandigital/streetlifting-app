import { describe, expect, it } from 'vitest';
import { AttemptUpsert, NominationCreate, NominationUpdate } from './competition-ops-input.js';

const uuid = '00000000-0000-0000-0000-000000000001';

describe('competition operations input schemas', () => {
  it('applies launch-safe defaults to nomination create payloads', () => {
    const parsed = NominationCreate.parse({
      athleteId: uuid,
      disciplineId: uuid,
      divisionId: uuid,
      weightClassId: uuid,
    });

    expect(parsed.status).toBe('draft');
    expect(parsed.isEntryFeePaid).toBe(false);
    expect(parsed.paymentStatus).toBe('unpaid');
    expect(parsed.paidAmountKopecks).toBe(0);
    expect(parsed.isMandatePassed).toBe(false);
  });

  it('allows nullable operational fields on nomination updates', () => {
    expect(
      NominationUpdate.parse({
        bodyWeightAtWeighIn: null,
        entryNumber: null,
        declaredWeightClassId: null,
        weightClassId: null,
        flightId: null,
        groupId: null,
        paymentStatus: 'partial',
        paidAmountKopecks: 150000,
        paymentMethod: 'cash',
        paymentComment: null,
        notes: null,
      }),
    ).toEqual({
      bodyWeightAtWeighIn: null,
      entryNumber: null,
      declaredWeightClassId: null,
      weightClassId: null,
      flightId: null,
      groupId: null,
      paymentStatus: 'partial',
      paidAmountKopecks: 150000,
      paymentMethod: 'cash',
      paymentComment: null,
      notes: null,
    });
  });

  it('bounds attempt numbers and defaults undecided attempts to pending', () => {
    expect(AttemptUpsert.parse({ componentId: uuid, attemptNumber: 1, weightKg: 42.5 }).result).toBe('pending');
    expect(AttemptUpsert.safeParse({ attemptNumber: 6, weightKg: 42.5 }).success).toBe(false);
  });
});
