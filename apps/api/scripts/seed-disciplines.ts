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

const COMPONENT_BY_EVENT: Record<
  string,
  { code: string; nameRu: string; nameEn: string; equipment: Equipment }
> = {
  PU: { code: 'pu', nameRu: 'Подтягивания', nameEn: 'Pull-Up', equipment: 'pull_up_bar' },
  DI: { code: 'di', nameRu: 'Отжимания на брусьях', nameEn: 'Dip', equipment: 'dip_bars' },
  MU_BAR: {
    code: 'mu_bar',
    nameRu: 'Выход силой на перекладине',
    nameEn: 'Bar Muscle-Up',
    equipment: 'pull_up_bar',
  },
  MU_RING: {
    code: 'mu_ring',
    nameRu: 'Выход силой на кольцах',
    nameEn: 'Ring Muscle-Up',
    equipment: 'rings',
  },
  SQ: { code: 'sq', nameRu: 'Приседания со штангой', nameEn: 'Barbell Squat', equipment: 'squat_rack' },
};

function componentEvents(p: (typeof presets.ISF_V51_DISCIPLINES)[number]): string[] {
  if (p.event === 'PUDI') return ['PU', 'DI'];
  if (p.event === 'PUDIMUSQ') return ['PU', 'DI', 'MU_BAR', 'SQ'];
  return [p.event];
}

function fixedWeightForEvent(p: (typeof presets.ISF_V51_DISCIPLINES)[number], event: string): number | null {
  if (p.competitionFormat !== 'multirep' || !p.presetLoadKg) return null;
  if (event === 'PU') return p.presetLoadKg.PU ?? null;
  if (event === 'DI') return p.presetLoadKg.DI ?? null;
  return null;
}

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
let componentUpserted = 0;
for (const p of presets.ISF_V51_DISCIPLINES) {
  const data = mapPresetToRow(p);
  const discipline = await prisma.discipline.upsert({
    where: { code: data.code },
    create: data,
    update: data,
  });

  const components = componentEvents(p).map((event, index) => {
    const component = COMPONENT_BY_EVENT[event] ?? COMPONENT_BY_EVENT.PU;
    return {
      ...component,
      order: index + 1,
      attemptCount: p.competitionFormat === 'classic' ? 3 : 1,
      fixedWeightKg: fixedWeightForEvent(p, event),
    };
  });

  await prisma.disciplineComponent.deleteMany({
    where: {
      disciplineId: discipline.id,
      code: { notIn: components.map((component) => component.code) },
    },
  });

  for (const component of components) {
    await prisma.disciplineComponent.upsert({
      where: { disciplineId_code: { disciplineId: discipline.id, code: component.code } },
      create: { ...component, disciplineId: discipline.id },
      update: component,
    });
    componentUpserted++;
  }
  upserted++;
}

console.log(`OK. Upserted ${upserted} ISF v5.1 disciplines and ${componentUpserted} components.`);
await prisma.$disconnect();
