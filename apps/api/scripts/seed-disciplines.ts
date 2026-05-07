/**
 * Seed the ISF v5.1 disciplines from the canonical preset list into the
 * `discipline` table. Idempotent — re-running upserts each row by `code`,
 * refreshing translations and metadata to match the preset.
 *
 * Used at first-time setup and after any change to
 * `packages/domain/src/presets/disciplines.ts`.
 *
 * Usage:
 *   pnpm --filter=@streetlifting/api seed:disciplines
 */

import { presets } from '@streetlifting/domain';
import { prisma } from '../src/lib/db.js';

type Equipment =
  | 'pull_up_bar'
  | 'dip_bars'
  | 'rings'
  | 'squat_rack';

const EQUIPMENT_BY_EVENT: Record<string, Equipment> = {
  PU: 'pull_up_bar',
  DI: 'dip_bars',
  PUDI: 'pull_up_bar',
  MU_BAR: 'pull_up_bar',
  MU_RING: 'rings',
  SQ: 'squat_rack',
  PUDIMUSQ: 'pull_up_bar',
};

function mapPresetToRow(p: (typeof presets.ISF_V51_DISCIPLINES)[number]) {
  const format: 'three_attempts_max' | 'reps_to_failure' =
    p.competitionFormat === 'classic' ? 'three_attempts_max' : 'reps_to_failure';

  const equipment = EQUIPMENT_BY_EVENT[p.event] ?? 'pull_up_bar';

  // Multirep events have a fixed weight (the preset load); classic and WC
  // singles do not (the athlete picks).
  const fixedWeightKg: number | null = (() => {
    if (p.competitionFormat !== 'multirep') return null;
    if (!p.presetLoadKg) return null;
    if (p.event === 'PU') return p.presetLoadKg.PU ?? null;
    if (p.event === 'DI') return p.presetLoadKg.DI ?? null;
    return null;
  })();

  // Family: explicit on WC entries, defaults to 'streetlifting' for the
  // classic + multirep streetlifting catalog.
  const family: 'streetlifting' | 'weighted_calisthenics' | 'multi_rep' =
    p.family ?? 'streetlifting';

  return {
    code: p.code,
    nameRu: p.labelRu,
    nameEn: p.labelEn,
    family,
    format,
    equipment,
    attemptCount: p.competitionFormat === 'classic' ? 3 : 1,
    fixedWeightKg,
    applyVeteranCoefficient: true,
  };
}

let upserted = 0;
for (const p of presets.ISF_V51_DISCIPLINES) {
  const data = mapPresetToRow(p);
  await prisma.discipline.upsert({
    where: { code: data.code },
    create: data,
    update: data,
  });
  upserted++;
}

console.log(`OK. Upserted ${upserted} ISF v5.1 disciplines.`);
await prisma.$disconnect();
