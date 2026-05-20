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

  it('detects payment, contacts, consent, auth and private notes', () => {
    const findings = findForbiddenExportKeys({
      paymentStatus: 'paid',
      athlete: { email: 'athlete@example.test' },
      consent: { textShown: 'private' },
      notes: 'internal',
      auth: { refreshToken: 'secret' },
    });

    expect(findings).toEqual([
      '$.paymentStatus',
      '$.athlete.email',
      '$.consent',
      '$.consent.textShown',
      '$.notes',
      '$.auth.refreshToken',
    ]);
  });
});
