import { describe, expect, it } from 'vitest';
import {
  formatWebhookSignature,
  nextWebhookAttemptAt,
  signWebhookBody,
  verifyWebhookSignature,
} from './webhooks.js';

describe('ISF webhook signatures', () => {
  it('signs and verifies the timestamp plus raw body', () => {
    const rawBody = '{"event":"competition.finalized"}';
    const timestamp = 1_779_232_800;
    const header = formatWebhookSignature('secret', timestamp, rawBody);

    expect(header).toContain(`v1=${signWebhookBody('secret', timestamp, rawBody)}`);
    expect(verifyWebhookSignature('secret', rawBody, header, 300, timestamp)).toBe(true);
    expect(verifyWebhookSignature('secret', `${rawBody}\n`, header, 300, timestamp)).toBe(false);
  });

  it('applies the required retry schedule and then dead-letters', () => {
    const now = new Date('2026-05-20T00:00:00.000Z');

    expect(nextWebhookAttemptAt(1, now)?.toISOString()).toBe('2026-05-20T00:01:00.000Z');
    expect(nextWebhookAttemptAt(2, now)?.toISOString()).toBe('2026-05-20T00:05:00.000Z');
    expect(nextWebhookAttemptAt(3, now)?.toISOString()).toBe('2026-05-20T00:30:00.000Z');
    expect(nextWebhookAttemptAt(4, now)?.toISOString()).toBe('2026-05-20T02:00:00.000Z');
    expect(nextWebhookAttemptAt(5, now)?.toISOString()).toBe('2026-05-20T12:00:00.000Z');
    expect(nextWebhookAttemptAt(6, now)).toBeNull();
  });
});
