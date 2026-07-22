import { describe, expect, it } from 'vitest';
import { createRateGuard } from './auth.js';

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
