import { describe, expect, it } from 'vitest';
import { AthleteCreate, AthleteUpdate } from './athlete-input.js';
import { PublicCompetitionRegistrationCreate } from './public-registration-input.js';
const base = { firstName: 'Test', lastName: 'Athlete', gender: 'M' };
describe('incomplete athlete profiles', () => {
  it('accepts a known year without inventing a date or country', () => {
    const parsed = AthleteCreate.parse({ ...base, birthYear: 2006 });
    expect(parsed.dateOfBirth).toBeUndefined();
    expect(parsed.countryCode).toBeUndefined();
  });
  it('rejects mismatched years and invalid year precision', () => {
    for (const birthYear of [2005, 1899, 2101, 2006.5]) {
      expect(
        AthleteCreate.safeParse({ ...base, dateOfBirth: '2006-06-12', birthYear }).success,
      ).toBe(false);
    }
    expect(AthleteCreate.safeParse({ ...base, dateOfBirth: '2101-01-01' }).success).toBe(false);
    expect(AthleteUpdate.safeParse({ dateOfBirth: '2006-06-12', birthYear: 2005 }).success).toBe(
      false,
    );
  });
  it('allows explicitly clearing uncertain profile details', () => {
    expect(AthleteUpdate.parse({ dateOfBirth: null, countryCode: null, birthYear: 2006 })).toEqual({
      dateOfBirth: null,
      countryCode: null,
      birthYear: 2006,
    });
  });
  it('still requires exact date and country for public registration', () => {
    const athlete = PublicCompetitionRegistrationCreate.shape.athlete;
    expect(athlete.safeParse(base).success).toBe(false);
    expect(
      athlete.safeParse({ ...base, dateOfBirth: '2006-06-12', countryCode: 'AM' }).success,
    ).toBe(true);
  });
});
