import { describe, expect, it } from 'vitest';
import { createRateGuard, tokenFromRequest } from './auth.js';

describe('ISF ID passwordless rate guard', () => {
  it('keeps the start and verification budgets separate', () => {
    const allowRequest = createRateGuard();
    const start = { max: 3, windowMs: 60_000 };
    const verify = { max: 5, windowMs: 60_000 };

    expect(allowRequest('start:127.0.0.1:athlete@example.test', start)).toBe(true);
    expect(allowRequest('start:127.0.0.1:athlete@example.test', start)).toBe(true);
    expect(allowRequest('start:127.0.0.1:athlete@example.test', start)).toBe(true);
    expect(allowRequest('start:127.0.0.1:athlete@example.test', start)).toBe(false);
    expect(allowRequest('verify:127.0.0.1:athlete@example.test', verify)).toBe(true);
  });
});

describe('ISF ID browser session token', () => {
  const opaque = 'a'.repeat(43);

  it('accepts the host-only HttpOnly cookie as an authentication credential', () => {
    expect(
      tokenFromRequest({ headers: { cookie: `theme=dark; __Host-isf_id_session=${opaque}` } }),
    ).toBe(opaque);
  });

  it('rejects malformed session cookies and keeps explicit bearer credentials compatible', () => {
    expect(
      tokenFromRequest({ headers: { cookie: '__Host-isf_id_session=not-a-valid-opaque-token' } }),
    ).toBeNull();
    expect(tokenFromRequest({ headers: { authorization: 'Bearer service-token' } })).toBe(
      'service-token',
    );
  });
});
