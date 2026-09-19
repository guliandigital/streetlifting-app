import { describe, it, expect } from 'vitest';
import { ageOnDate, admissionIssue } from './admission.js';
const input = {
  rulebook: 'ISF v5.1',
  startDate: '2026-09-20',
  endDate: '2026-09-20',
  athlete: {
    firstName: 'Test',
    lastName: 'Athlete',
    dateOfBirth: '2003-09-21',
    countryCode: 'AM',
    gender: 'M',
  },
  division: { gender: 'M', ageMin: 18, ageMax: 22 },
  bodyWeight: 75,
  weightClass: { weightMin: 67.5, weightMax: 75 },
  requireWeighIn: true,
};
describe('ISF admission on the competition date', () => {
  it('does not promote a junior merely because their 23rd birthday is this year', () => {
    expect(ageOnDate('2003-09-21', '2026-09-20')).toBe(22);
    expect(admissionIssue(input)).toBeNull();
    expect(admissionIssue({ ...input, startDate: '2026-09-21', endDate: '2026-09-21' })).toBe(
      'division_age_mismatch',
    );
  });
  it('requires the actual event date when a birthday crosses eligibility during the tournament', () => {
    expect(admissionIssue({ ...input, endDate: '2026-09-22' })).toBe(
      'admission_event_date_required',
    );
  });
  it.each([12, 13, 17, 18, 22, 23, 39, 40, 60, 69, 70, 80])(
    'uses the complete birthday at age %s',
    (age) => {
      expect(ageOnDate(`${2026 - age}-09-20`, '2026-09-20')).toBe(age);
      expect(ageOnDate(`${2026 - age}-09-20`, '2026-09-19')).toBe(age - 1);
    },
  );
  it('enforces the minimum age even when a division omits its bounds', () => {
    expect(
      admissionIssue({
        ...input,
        athlete: { ...input.athlete, dateOfBirth: '2013-09-21' },
        division: { gender: 'M', ageMin: null, ageMax: null },
      }),
    ).toBe('division_age_mismatch');
  });
  it('does not invent a policy for another rulebook', () => {
    expect(admissionIssue({ ...input, rulebook: 'Custom' })).toBe('admission_rulebook_unsupported');
  });
  it('requires weighing only at admission, not preliminary registration', () => {
    expect(admissionIssue({ ...input, bodyWeight: null })).toBe('weigh_in_required');
    expect(admissionIssue({ ...input, bodyWeight: null, requireWeighIn: false })).toBeNull();
  });
  it('checks gender and open lower/closed upper weight boundaries', () => {
    expect(admissionIssue({ ...input, athlete: { ...input.athlete, gender: 'F' } })).toBe(
      'division_gender_mismatch',
    );
    expect(admissionIssue({ ...input, bodyWeight: 67.5 })).toBe('body_weight_class_mismatch');
    expect(admissionIssue({ ...input, bodyWeight: 75.1 })).toBe('body_weight_class_mismatch');
    expect(admissionIssue(input)).toBeNull();
  });
});
