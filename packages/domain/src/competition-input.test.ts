import { describe, expect, it } from 'vitest';
import { CompetitionCreate, CompetitionUpdate } from './competition-input.js';

const validCreateInput = {
  federationId: '00000000-0000-0000-0000-000000000001',
  code: 'moscow-open-2026',
  nameRu: 'Moscow Open',
  nameEn: 'Moscow Open',
  startDate: '2026-06-10',
  endDate: '2026-06-12',
  timezone: 'Europe/Moscow',
};

describe('competition input schemas', () => {
  it('accepts a minimal competition create payload and applies defaults', () => {
    const parsed = CompetitionCreate.parse(validCreateInput);

    expect(parsed.rulebook).toBe('ISF v5.1');
    expect(parsed.status).toBe('draft');
    expect(parsed.entryFeeKopecks).toBe(0);
    expect(parsed.isOnlineRegistrationOpen).toBe(true);
  });

  it('rejects create payloads where endDate is before startDate', () => {
    const parsed = CompetitionCreate.safeParse({
      ...validCreateInput,
      startDate: '2026-06-12',
      endDate: '2026-06-10',
    });

    expect(parsed.success).toBe(false);
  });

  it('allows nullable text fields in update payloads so forms can clear values', () => {
    const parsed = CompetitionUpdate.parse({
      description: null,
      registrationDeadline: null,
      city: null,
      venue: null,
    });

    expect(parsed).toEqual({
      description: null,
      registrationDeadline: null,
      city: null,
      venue: null,
    });
  });
});
