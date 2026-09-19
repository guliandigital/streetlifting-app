import { expect, it } from 'vitest';
import { formatEntryFee } from './money.js';
it('does not advertise an unconfirmed zero or invalid fee as free participation', () => {
  for (const value of [0, '0', '', 'unknown', -1])
    expect(formatEntryFee(value, 'Уточните у организатора')).toBe('Уточните у организатора');
  expect(formatEntryFee(120000, 'unknown')).toContain('1');
  expect(formatEntryFee(120000, 'unknown')).not.toBe('unknown');
});
