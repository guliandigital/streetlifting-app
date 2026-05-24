import { describe, expect, it } from 'vitest';
import { assertNoForbiddenExportKeys, findForbiddenExportKeys } from './privacy-allowlist.js';

describe('ISF privacy allowlist guard', () => {
  it('allows public result fields', () => {
    expect(() =>
      assertNoForbiddenExportKeys({
        athlete: { displayName: 'Ivan Ivanov', birthYear: 1998 },
        bodyWeightKg: 82.4,
        finalScore: 120.5,
      }),
    ).not.toThrow();
  });

  it('detects payment, contacts, consent, auth, exact birth date and private notes', () => {
    const findings = findForbiddenExportKeys({
      entryFeeKopecks: '150000',
      paymentStatus: 'paid',
      federation: { billingTariffKopecksPerNomination: '5000' },
      athlete: {
        dateOfBirth: '1998-01-02',
        federationCardNumber: 'CARD-1',
        email: 'athlete@example.test',
      },
      consent: { textShown: 'private' },
      notes: 'internal',
      auth: { refreshToken: 'secret' },
    });

    expect(findings).toEqual([
      '$.entryFeeKopecks',
      '$.paymentStatus',
      '$.federation.billingTariffKopecksPerNomination',
      '$.athlete.dateOfBirth',
      '$.athlete.federationCardNumber',
      '$.athlete.email',
      '$.consent',
      '$.consent.textShown',
      '$.notes',
      '$.auth.refreshToken',
    ]);
  });
});
