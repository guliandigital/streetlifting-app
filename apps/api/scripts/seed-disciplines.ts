/**
 * Seed the 19 ISF v5.1 disciplines from the canonical preset list into
 * the `discipline` table. Idempotent — re-running upserts each row by
 * `code`, refreshing translations and metadata to match the preset.
 *
 * Used at first-time setup and after any change to
 * `packages/domain/src/presets/disciplines.ts`.
 *
 * Usage:
 *   pnpm --filter=@streetlifting/api seed:disciplines
 */

import { presets } from '@streetlifting/domain';
import { prisma } from '../src/lib/db.js';
import type { CompetitionFormatCode, EventCode } from '@streetlifting/domain/presets';

/**
 * The presets describe disciplines in ISF terms (classic / multirep,
 * PU/DI/PUDI, formula, presetLoadKg). Map those to the DB shape.
 */
function mapPresetToRow(p: (typeof presets.ISF_V51_DISCIPLINES)[number]) {
  // Format derivation: classic → three_attempts_max; multirep → reps_to_failure
  const format: 'three_attempts_max' | 'reps_to_failure' =
    p.competitionFormat === 'classic' ? 'three_attempts_max' : 'reps_to_failure';

  // Equipment derivation from the event:
  //   PU   → pull_up_bar
  //   DI   → dip_bars
  //   PUDI → pull_up_bar (Total uses both — pick the primary; UI surfaces the
  //          full event from the discipline code)
  const equipment: 'pull_up_bar' | 'dip_bars' =
    p.event === 'DI' ? 'dip_bars' : 'pull_up_bar';

  // Multirep events have a fixed weight (the preset load); classic does not.
  const fixedWeightKg: number | null = (() => {
    if (p.competitionFormat !== 'multirep') return null;
    if (!p.presetLoadKg) return null;
    if (p.event === 'PU') return p.presetLoadKg.PU ?? null;
    if (p.event === 'DI') return p.presetLoadKg.DI ?? null;
    return null; // PUDI two-lift — no single fixed weight
  })();

  return {
    code: p.code,
    nameRu: p.labelRu,
    nameEn: p.labelEn,
    family: 'streetlifting' as const,
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

// Silence unused imports when the type-only ones aren't read at runtime
void ({} as { _?: CompetitionFormatCode | EventCode });
