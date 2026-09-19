import { describe, expect, it } from 'vitest';
import { calculateAge, formatDateOfBirth } from './format.js';
describe('incomplete athlete dates', () => {
  it('shows only the year when the full date is unknown', () => {
    expect(formatDateOfBirth(null, 'ru-RU', 2006)).toBe('2006');
    expect(formatDateOfBirth(null)).toBe('—');
    expect(calculateAge(null)).toBeNull();
  });
  it('keeps full dates and exact ages for complete profiles', () => {
    expect(formatDateOfBirth('2006-06-12', 'ru-RU')).toBe('12.06.2006');
    expect(calculateAge('2006-06-12', new Date('2026-06-11T12:00:00Z'))).toBe(19);
  });
});
