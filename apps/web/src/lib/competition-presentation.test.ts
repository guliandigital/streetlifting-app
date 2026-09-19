import { describe, expect, it } from 'vitest';
import { competitionCity, competitionSourceLabel } from './competition-presentation.js';
describe('competition city from imported event headers', () => {
  it('removes the matching date trailer and preserves compound locality names', () => {
    expect(
      competitionCity('сельский посёлок Буревестник 06.07.2025 -', '2025-07-06T00:00:00Z'),
    ).toBe('сельский посёлок Буревестник');
    expect(competitionCity('Ростов-на-Дону 11.06.2020 -', '2020-06-11')).toBe('Ростов-на-Дону');
  });
  it('does not guess when the trailer differs from the stored event date', () => {
    expect(competitionCity('Уральск 25.06.2022 -', '2023-06-25')).toBe('Уральск 25.06.2022 -');
    expect(competitionCity('Нижний Новгород', '2026-01-01')).toBe('Нижний Новгород');
    expect(competitionCity(null, '2026-01-01')).toBeNull();
  });
});

it('marks only explicitly recorded imports and does not equate archive status with approval', () => {
  expect(competitionSourceLabel('Imported from PowerTable public snapshot.', 'archived')).toBe(
    'importedArchive',
  );
  expect(competitionSourceLabel('Карточка импортирована 19.09.2026.', 'draft')).toBe(
    'externalAnnouncement',
  );
  expect(competitionSourceLabel(null, 'archived')).toBe('sourceUnspecified');
});
